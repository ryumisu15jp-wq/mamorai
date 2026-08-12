// [REQ-004][REQ-005][REQ-008][REQ-009] 日報データアクセス層（RLSセッション下で往復）。
//
// 検証・状態遷移・一覧構築のロジックは一切再実装せず @mamorai/input-core に委譲する:
//   ・createDraft / createSubmittedReport … 生成＋提出前検証（SubmitValidationError）
//   ・transitionReport                     … status 遷移（許可遷移以外は throw）
//   ・buildMonthlyList                     … 当月全日を1行/日へ整形（未作成補完）
// 本層の責務は「検証済みの純粋オブジェクト ⇄ daily_reports 行」の写像と SQL 実行のみ。
import {
  createDraft,
  createSubmittedReport,
  transitionReport as transitionReportPure,
  buildMonthlyList,
  type CreateReportArgs,
  type DailyReport,
  type ReportTemplate,
  type WorkflowAction,
  type Actor,
  type ReportFilter,
  type ReportListRow,
} from '@mamorai/input-core'
import type { DbExec } from './pool.js'

/** daily_reports の生行（SELECT で明示 alias する列）。date/timestamp は text 化して受ける。 */
interface ReportRow {
  id: string
  site_id: string
  template_id: string | null
  reporter_id: string
  report_date: string
  status: string
  values: Record<string, Record<string, string | number | boolean | null>>
  submitted_at: string | null
  approved_at: string | null
  approver_id: string | null
}

/** SELECT 句（date/timestamptz を text にキャストし、JS Date のタイムゾーン揺れを避ける）。 */
const SELECT_COLS = `
  id,
  site_id,
  template_id,
  reporter_id,
  report_date::text        as report_date,
  status,
  values,
  submitted_at::text       as submitted_at,
  approved_at::text        as approved_at,
  approver_id`

/** 生行 → DailyReport（input-core の型）へ写像。 */
function toReport(row: ReportRow): DailyReport {
  return {
    id: row.id,
    siteId: row.site_id,
    templateId: row.template_id ?? '',
    reporterId: row.reporter_id,
    reportDate: row.report_date,
    status: statusFromDb(row.status),
    values: row.values,
    submittedAt: row.submitted_at,
    approvedAt: row.approved_at,
    approverId: row.approver_id,
  }
}

/** DB の status 文字列を ReportStatus へ（想定外値はそのまま通し、型の逃げに as を使わない）。 */
function statusFromDb(status: string): DailyReport['status'] {
  switch (status) {
    case '下書き':
    case '提出済':
    case '承認済':
    case '差し戻し':
      return status
    default:
      // 想定外は下書き扱いにフォールバック（RLS/検証の対象外の破損データ保護）
      return '下書き'
  }
}

/** createReport の引数: template を渡せば提出済（検証あり）、無ければ下書き。 */
export interface CreateReportInput extends CreateReportArgs {
  /** 渡すと createSubmittedReport（提出前検証）を通し status='提出済' で INSERT。 */
  template?: ReportTemplate
}

/**
 * [REQ-004][REQ-005] 日報を作成して INSERT。生成/検証は input-core に委譲。
 * template あり → createSubmittedReport（検証NGは SubmitValidationError を送出）。
 * template なし → createDraft。RLS 下で site_id が担当外なら INSERT は拒否される。
 */
export async function createReport(db: DbExec, input: CreateReportInput): Promise<DailyReport> {
  const report: DailyReport =
    input.template !== undefined
      ? createSubmittedReport({ ...input, template: input.template })
      : createDraft(input)

  const { rows } = await db.query<ReportRow>(
    `insert into daily_reports
       (id, site_id, template_id, reporter_id, report_date, status, values, submitted_at, approved_at, approver_id)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     returning ${SELECT_COLS}`,
    [
      report.id,
      report.siteId,
      report.templateId,
      report.reporterId,
      report.reportDate,
      report.status,
      JSON.stringify(report.values),
      report.submittedAt ?? null,
      report.approvedAt ?? null,
      report.approverId ?? null,
    ]
  )
  const row = rows[0]
  if (row === undefined) throw new Error('createReport: INSERT が行を返しませんでした')
  return toReport(row)
}

/** [REQ-009] 単一日報を取得。RLS で担当外なら 0 件 → null。 */
export async function getReport(db: DbExec, id: string): Promise<DailyReport | null> {
  const { rows } = await db.query<ReportRow>(
    `select ${SELECT_COLS} from daily_reports where id = $1`,
    [id]
  )
  const row = rows[0]
  return row === undefined ? null : toReport(row)
}

/**
 * [REQ-009] 現場×月の日報一覧（当月全日・未作成補完）。
 * DB からは当月レコードのみ取得し、行整形は input-core の buildMonthlyList に委譲。
 * RLS により担当外現場の行は最初から返らない。
 */
export async function listReportsByMonth(
  db: DbExec,
  siteId: string,
  month: string,
  filter?: ReportFilter
): Promise<ReportListRow[]> {
  const { rows } = await db.query<ReportRow>(
    `select ${SELECT_COLS}
       from daily_reports
      where site_id = $1
        and report_date >= ($2 || '-01')::date
        and report_date <  (($2 || '-01')::date + interval '1 month')
      order by report_date`,
    [siteId, month]
  )
  const reports = rows.map(toReport)
  return buildMonthlyList(reports, month, filter)
}

/**
 * [REQ-008] 承認ワークフロー遷移を永続化。status 遷移は input-core に委譲。
 * 対象を取得 → transitionReport（許可遷移以外は throw）→ 変化列を UPDATE。
 * RLS 下で担当外なら取得段階で null（→ throw）または UPDATE 拒否となる。
 */
export async function transitionReport(
  db: DbExec,
  id: string,
  action: WorkflowAction,
  actor: Actor
): Promise<DailyReport> {
  const current = await getReport(db, id)
  if (current === null) throw new Error(`transitionReport: 日報が見つかりません (id=${id})`)

  const next = transitionReportPure(current, action, actor)

  const { rows } = await db.query<ReportRow>(
    `update daily_reports
        set status       = $2,
            submitted_at = $3,
            approved_at  = $4,
            approver_id  = $5,
            updated_at   = now()
      where id = $1
      returning ${SELECT_COLS}`,
    [id, next.status, next.submittedAt ?? null, next.approvedAt ?? null, next.approverId ?? null]
  )
  const row = rows[0]
  if (row === undefined) throw new Error('transitionReport: UPDATE が行を返しませんでした（RLS拒否の可能性）')
  return toReport(row)
}
