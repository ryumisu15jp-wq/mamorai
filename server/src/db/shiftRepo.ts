// [REQ-016][REQ-019][REQ-020] シフトデータアクセス層。
//   ・shift_overrides（群A）: 現場担当が RLS 下で upsert（手動/AI反映セルの上書き）。
//   ・shift_optimization_runs（群B=AI経路）: 書込は service 相当のみ（withService 経由）。
//     素の app_client 接続では RLS の with_check app_is_service() により INSERT が拒否される。
import type { WorkType } from '@mamorai/input-core'
import type { DbExec } from './pool.js'

/** shift_overrides への upsert 引数。 */
export interface ShiftOverrideInput {
  siteId: string
  staffId: string
  targetDate: string // YYYY-MM-DD
  workType: WorkType
  source?: 'manual' | 'ai_apply'
  runId?: string | null
}

/** shift_overrides の生行。 */
interface OverrideRow {
  id: string
  site_id: string
  staff_id: string
  target_date: string
  work_type: string
  source: string | null
  run_id: string | null
}

/** 永続化済みの override（生行の写像）。 */
export interface PersistedOverride {
  id: string
  siteId: string
  staffId: string
  targetDate: string
  workType: string
  source: string | null
  runId: string | null
}

function toOverride(row: OverrideRow): PersistedOverride {
  return {
    id: row.id,
    siteId: row.site_id,
    staffId: row.staff_id,
    targetDate: row.target_date,
    workType: row.work_type,
    source: row.source,
    runId: row.run_id,
  }
}

const OVERRIDE_COLS = `id, site_id, staff_id, target_date::text as target_date, work_type, source, run_id`

/**
 * [REQ-016] shift_overrides を (site_id, staff_id, target_date) 単位で upsert。
 * 一意制約が無いため「更新→0件なら挿入」で実現。全操作は RLS 下（担当外は拒否）。
 */
export async function upsertShiftOverride(
  db: DbExec,
  input: ShiftOverrideInput
): Promise<PersistedOverride> {
  const source = input.source ?? 'manual'
  const runId = input.runId ?? null

  const updated = await db.query<OverrideRow>(
    `update shift_overrides
        set work_type = $4, source = $5, run_id = $6
      where site_id = $1 and staff_id = $2 and target_date = $3
      returning ${OVERRIDE_COLS}`,
    [input.siteId, input.staffId, input.targetDate, input.workType, source, runId]
  )
  const updatedRow = updated.rows[0]
  if (updatedRow !== undefined) return toOverride(updatedRow)

  const inserted = await db.query<OverrideRow>(
    `insert into shift_overrides (site_id, staff_id, target_date, work_type, source, run_id)
     values ($1, $2, $3, $4, $5, $6)
     returning ${OVERRIDE_COLS}`,
    [input.siteId, input.staffId, input.targetDate, input.workType, source, runId]
  )
  const insertedRow = inserted.rows[0]
  if (insertedRow === undefined) throw new Error('upsertShiftOverride: INSERT が行を返しませんでした')
  return toOverride(insertedRow)
}

/** shift_optimization_runs の作成引数（群B）。 */
export interface OptimizationRunInput {
  siteId: string
  month: string // YYYY-MM
  feasible: boolean
  evaluation?: unknown
}

/**
 * [REQ-020] 最適化ラン（下案）を作成。群B=AI経路のため withService 経由でのみ成功する。
 * 素の app_client 接続（app.role 未設定）では RLS で INSERT が拒否される。
 */
export async function createOptimizationRun(
  db: DbExec,
  input: OptimizationRunInput
): Promise<string> {
  const { rows } = await db.query<{ run_id: string }>(
    `insert into shift_optimization_runs (site_id, month, status, evaluation, feasible)
     values ($1, $2, '下案', $3, $4)
     returning run_id`,
    [input.siteId, input.month, JSON.stringify(input.evaluation ?? {}), input.feasible]
  )
  const row = rows[0]
  if (row === undefined) throw new Error('createOptimizationRun: INSERT が行を返しませんでした')
  return row.run_id
}
