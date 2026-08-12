import { useMemo, useState } from 'react'
import {
  buildMonthlyList,
  filterReports,
  transitionReport,
  type DailyReport,
  type ReportFilter,
  type ReportListRow,
  type ReportStatus,
  type WorkflowAction,
} from '@mamorai/input-core'
import { DEMO_MONTH, demoMonthlyReports } from '../month/demoMonth.js'

// 日報一覧画面。フィルタ(filterReports)・月次補完(buildMonthlyList)・
// 状態遷移(transitionReport) はすべて @mamorai/input-core に委譲。
// 承認/差し戻しはローカル state に反映（永続化は Supabase 接続時＝スタブ）。

const STATUS_OPTIONS: ReportStatus[] = ['下書き', '提出済', '承認済', '差し戻し']
const APPROVER_ID = 'mgr-1'

function reporterNameOf(r: DailyReport): string {
  const name = r.values?.meta?.reporterName
  return typeof name === 'string' && name !== '' ? name : r.reporterId
}

export function ReportList(): JSX.Element {
  const [reports, setReports] = useState<DailyReport[]>(() => demoMonthlyReports())
  const [statusFilter, setStatusFilter] = useState<ReportStatus | ''>('')
  const [reporterFilter, setReporterFilter] = useState<string>('')
  const [keyword, setKeyword] = useState<string>('')
  const [toast, setToast] = useState<string | null>(null)

  // 報告者セレクタの候補（デモデータから一意抽出）。
  const reporters = useMemo(() => {
    const map = new Map<string, string>()
    for (const r of reports) map.set(r.reporterId, reporterNameOf(r))
    return [...map.entries()]
  }, [reports])

  // [input-core] ReportFilter 条件（status/reporterId 完全一致・keyword 部分一致の AND）
  const filter: ReportFilter = useMemo(() => {
    const f: ReportFilter = {}
    if (statusFilter !== '') f.status = statusFilter
    if (reporterFilter !== '') f.reporterId = reporterFilter
    if (keyword !== '') f.keyword = keyword
    return f
  }, [statusFilter, reporterFilter, keyword])

  // [input-core] filterReports: フィルタ後の実レコード（件数表示・行アクション対象）
  const filtered = useMemo(() => filterReports(reports, filter), [reports, filter])
  // [input-core] buildMonthlyList: 当月全日を1行/日に補完（未作成日を明示）
  const rows: ReportListRow[] = useMemo(
    () => buildMonthlyList(reports, DEMO_MONTH, filter),
    [reports, filter]
  )

  const applyTransition = (report: DailyReport, action: WorkflowAction): void => {
    try {
      // [input-core] transitionReport: 許可遷移のみ実行、不正遷移は throw
      const next = transitionReport(report, action, { id: APPROVER_ID, at: new Date().toISOString() })
      setReports((prev) => prev.map((r) => (r.id === report.id ? next : r)))
      setToast(`${report.reportDate} を「${next.status}」に更新（ローカルstate／永続化スタブ）`)
    } catch (e) {
      // 不正遷移(InvalidTransition)は握りつぶしてトースト表示
      setToast(e instanceof Error ? `操作できません: ${e.message}` : '想定外のエラー')
    }
  }

  const resetFilters = (): void => {
    setStatusFilter('')
    setReporterFilter('')
    setKeyword('')
  }

  return (
    <div className="page">
      <header className="page-head">
        <h1 className="page-title">日報一覧</h1>
        <span className="muted">
          {DEMO_MONTH} ／ 該当 {filtered.length} 件（全 {reports.length} 件）
        </span>
      </header>

      {/* フィルタ */}
      <section className="card" aria-label="フィルタ">
        <div className="card-b filters">
          <label className="fl">
            状態
            <select
              className="input"
              aria-label="状態で絞り込み"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as ReportStatus | '')}
            >
              <option value="">すべて</option>
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="fl">
            報告者
            <select
              className="input"
              aria-label="報告者で絞り込み"
              value={reporterFilter}
              onChange={(e) => setReporterFilter(e.target.value)}
            >
              <option value="">すべて</option>
              {reporters.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label className="fl">
            キーワード
            <input
              className="input"
              type="text"
              aria-label="キーワードで絞り込み"
              placeholder="報告事項の本文を検索"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
            />
          </label>
          <button type="button" className="btn btn-secondary" onClick={resetFilters}>
            クリア
          </button>
        </div>
      </section>

      {/* 月次一覧（未作成日を明示・承認/差し戻し操作つき） */}
      <section className="card" aria-label="日報一覧">
        <div className="card-b">
          <table className="tbl">
            <thead>
              <tr>
                <th>日付</th>
                <th>状態</th>
                <th>報告者</th>
                <th>報告事項</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.reportDate} className={row.status === '未作成' ? 'row-missing' : ''}>
                  <td>{row.reportDate}</td>
                  <td>
                    <StatusBadge status={row.status} />
                  </td>
                  <td>{row.report !== null ? reporterNameOf(row.report) : '—'}</td>
                  <td className="note-cell">
                    {row.report !== null ? noteOf(row.report) : ''}
                  </td>
                  <td>
                    <RowActions report={row.report} onAction={applyTransition} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {toast !== null && (
        <div className="toast" role="status" aria-live="polite" onAnimationEnd={() => undefined}>
          {toast}
        </div>
      )}
    </div>
  )
}

function noteOf(r: DailyReport): string {
  const note = r.values?.gate?.note
  return typeof note === 'string' ? note : ''
}

/** 現在 status に応じて許可された遷移ボタンのみ描画（提出済→承認/差し戻し, 差し戻し→再提出）。 */
function RowActions({
  report,
  onAction,
}: {
  report: DailyReport | null
  onAction: (r: DailyReport, a: WorkflowAction) => void
}): JSX.Element {
  if (report === null) return <span className="muted">—</span>
  if (report.status === '提出済') {
    return (
      <div className="row-actions">
        <button type="button" className="btn-sm btn-approve" aria-label={`${report.reportDate} を承認`} onClick={() => onAction(report, 'approve')}>
          承認
        </button>
        <button type="button" className="btn-sm btn-reject" aria-label={`${report.reportDate} を差し戻し`} onClick={() => onAction(report, 'reject')}>
          差し戻し
        </button>
      </div>
    )
  }
  if (report.status === '差し戻し') {
    return (
      <button type="button" className="btn-sm btn-resubmit" aria-label={`${report.reportDate} を再提出`} onClick={() => onAction(report, 'resubmit')}>
        再提出
      </button>
    )
  }
  return <span className="muted">—</span>
}

function StatusBadge({ status }: { status: ReportListRow['status'] }): JSX.Element {
  const cls: Record<ReportListRow['status'], string> = {
    下書き: 'st-draft',
    提出済: 'st-submitted',
    承認済: 'st-approved',
    差し戻し: 'st-rejected',
    未作成: 'st-missing',
  }
  return <span className={`status ${cls[status]}`}>{status}</span>
}
