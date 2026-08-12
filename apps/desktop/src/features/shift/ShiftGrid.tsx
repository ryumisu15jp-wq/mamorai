// [REQ-016] スタッフ×日付のカレンダー型勤務表。
// セル編集は override として保持し mergeShiftCells(base+manual) で反映、
// monthlyWorkTypeCounts で右端に区分別集計を表示（マージ/集計ロジックは input-core に委譲＝層分離厳守）。
import { useMemo, useState } from 'react'
import {
  mergeShiftCells,
  monthlyWorkTypeCounts,
  type ShiftCell,
  type ShiftGrid as ShiftGridModel,
  type WorkType,
} from '@mamorai/input-core'
import {
  DEMO_SITE_ID,
  DEMO_MONTH,
  DEMO_WORK_DATES,
  WORK_TYPES,
  demoStaff,
  demoBaseCells,
} from './demoShift.js'

/** 表示用の短い日付（DD）。 */
function dayOf(date: string): string {
  return date.slice(8, 10)
}

/** cells を (staffId,date)→workType の索引に。 */
function indexCells(cells: ShiftCell[]): Map<string, ShiftCell> {
  const m = new Map<string, ShiftCell>()
  for (const c of cells) m.set(`${c.date}#${c.staffId}`, c)
  return m
}

export function ShiftGrid(): JSX.Element {
  const base = useMemo(() => demoBaseCells(), [])
  // 手動編集は override 配列として別管理（source='manual'）。
  const [overrides, setOverrides] = useState<ShiftCell[]>([])

  // [input-core] mergeShiftCells: base + 手動override をキー(staffId,date)でマージ。
  const merged = useMemo(() => mergeShiftCells(base, overrides), [base, overrides])
  const index = useMemo(() => indexCells(merged), [merged])

  // [input-core] monthlyWorkTypeCounts: スタッフ別×勤務区分別の件数集計。
  const grid: ShiftGridModel = useMemo(
    () => ({ siteId: DEMO_SITE_ID, month: DEMO_MONTH, cells: merged }),
    [merged],
  )
  const counts = useMemo(() => monthlyWorkTypeCounts(grid), [grid])

  const editCount = overrides.length

  function setCell(staffId: string, date: string, workType: WorkType): void {
    setOverrides((prev) => {
      const rest = prev.filter((c) => !(c.staffId === staffId && c.date === date))
      // 手動編集は必ず source='manual'。
      return [...rest, { staffId, date, workType, source: 'manual' }]
    })
  }

  function resetEdits(): void {
    setOverrides([])
  }

  return (
    <div className="page">
      <header className="page-head">
        <h1 className="page-title">勤務表（{DEMO_MONTH}）</h1>
        <div className="row-actions">
          <span className="muted">手動編集 {editCount} 件</span>
          <button type="button" className="btn-sm" onClick={resetEdits} disabled={editCount === 0}>
            編集を破棄
          </button>
        </div>
      </header>

      <section className="card" aria-label="勤務表">
        <div className="card-b shift-scroll">
          <table className="tbl shift-tbl">
            <thead>
              <tr>
                <th className="shift-name">スタッフ</th>
                {DEMO_WORK_DATES.map((d) => (
                  <th key={d} className="num">{dayOf(d)}</th>
                ))}
                {WORK_TYPES.map((w) => (
                  <th key={w} className="num shift-sum">{w}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {demoStaff.map((s) => {
                const perStaff = counts[s.id] ?? {}
                return (
                  <tr key={s.id}>
                    <td className="shift-name">{s.name ?? s.id}</td>
                    {DEMO_WORK_DATES.map((d) => {
                      const cell = index.get(`${d}#${s.id}`)
                      const wt = (cell?.workType ?? '公休') as WorkType
                      const manual = cell?.source === 'manual'
                      return (
                        <td key={d} className="shift-cell">
                          <select
                            className={`shift-select${manual ? ' shift-manual' : ''}`}
                            aria-label={`${s.name ?? s.id} ${dayOf(d)}日の勤務区分`}
                            value={wt}
                            onChange={(e) => setCell(s.id, d, e.target.value as WorkType)}
                          >
                            {WORK_TYPES.map((opt) => (
                              <option key={opt} value={opt}>{opt}</option>
                            ))}
                          </select>
                        </td>
                      )
                    })}
                    {WORK_TYPES.map((w) => (
                      <td key={w} className="num shift-sum">{perStaff[w] ?? 0}</td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>
      <p className="muted">手動編集したセルは <span className="shift-manual-hint">青枠</span>（source=manual）。base の上に override してマージ表示しています。</p>
    </div>
  )
}
