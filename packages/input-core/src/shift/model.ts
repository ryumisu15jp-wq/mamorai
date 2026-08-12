// [REQ-016] シフト表モデル: base+overridesマージ / 勤務区分集計（純粋・決定論）
import type { ShiftCell, ShiftGrid, WorkType } from '../types.js'

/** (staffId,date) キー */
function cellKey(c: ShiftCell): string {
  return `${c.date}#${c.staffId}`
}

/** date 昇順 → staffId 昇順の安定比較 */
function byDateThenStaff(a: ShiftCell, b: ShiftCell): number {
  if (a.date < b.date) return -1
  if (a.date > b.date) return 1
  if (a.staffId < b.staffId) return -1
  if (a.staffId > b.staffId) return 1
  return 0
}

/**
 * [REQ-016] base と overrides を (staffId,date) キーでマージ。
 * 同一キーは override を優先し、date 昇順→staffId 昇順で安定ソートする。
 */
export function mergeShiftCells(base: ShiftCell[], overrides: ShiftCell[]): ShiftCell[] {
  const map = new Map<string, ShiftCell>()
  for (const c of base) map.set(cellKey(c), c)
  for (const c of overrides) map.set(cellKey(c), c)
  return Array.from(map.values()).sort(byDateThenStaff)
}

/**
 * [REQ-016] スタッフ別・勤務区分別の件数を集計する。
 * 戻り値: staffId -> (workType -> count)
 */
export function monthlyWorkTypeCounts(grid: ShiftGrid): Record<string, Partial<Record<WorkType, number>>> {
  const result: Record<string, Partial<Record<WorkType, number>>> = {}
  for (const c of grid.cells) {
    const perStaff: Partial<Record<WorkType, number>> = result[c.staffId] ?? {}
    perStaff[c.workType] = (perStaff[c.workType] ?? 0) + 1
    result[c.staffId] = perStaff
  }
  return result
}
