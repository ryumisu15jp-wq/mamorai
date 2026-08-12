// [REQ-017] 日次配置表の生成と欠員検出（純粋・決定論）
import type { ShiftCell, PositionRequirement, Staff, DailyAssignment, AssignmentCell } from '../types.js'

/** staffId が position の requiredQualifications をすべて満たすか判定 */
function isQualified(
  staffId: string,
  required: string[] | undefined,
  staff: Staff[] | undefined,
): boolean {
  // staff 未指定 or 資格要件なし → 資格チェックを行わず割当可
  if (staff === undefined || required === undefined || required.length === 0) return true
  const found = staff.find((s) => s.id === staffId)
  const held = found ? found.qualifications : []
  return required.every((q) => held.includes(q))
}

/**
 * [REQ-017] 当日の稼働者（workType===position）を requiredHeadcount 分だけ
 * 資格を満たす範囲で staffId 昇順に割当て、不足分は null 欠員セルとする。
 */
export function buildDailyAssignment(
  siteId: string,
  date: string,
  shiftCells: ShiftCell[],
  positions: PositionRequirement[],
  staff?: Staff[],
): DailyAssignment {
  const cells: AssignmentCell[] = []
  const vacancies: { position: string; shortBy: number }[] = []

  for (const pos of positions) {
    const eligible = shiftCells
      .filter((c) => c.date === date && c.workType === pos.position)
      .map((c) => c.staffId)
      .filter((id) => isQualified(id, pos.requiredQualifications, staff))
      .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))

    const assigned = eligible.slice(0, pos.requiredHeadcount)
    for (const id of assigned) cells.push({ position: pos.position, staffId: id })

    const shortBy = pos.requiredHeadcount - assigned.length
    for (let i = 0; i < shortBy; i++) cells.push({ position: pos.position, staffId: null })
    if (shortBy > 0) vacancies.push({ position: pos.position, shortBy })
  }

  return { siteId, date, cells, vacancies }
}
