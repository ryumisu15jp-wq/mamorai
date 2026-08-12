// [REQ-017] 対象日選択で日次配置表を表示、欠員ポジションを赤で明示。
// 配置生成・欠員検出は input-core の buildDailyAssignment に委譲（層分離厳守）。
import { useMemo, useState } from 'react'
import {
  buildDailyAssignment,
  type DailyAssignment as DailyAssignmentModel,
} from '@mamorai/input-core'
import {
  DEMO_SITE_ID,
  DEMO_WORK_DATES,
  demoStaff,
  demoPositions,
  demoBaseCells,
} from './demoShift.js'

/** staffId→表示名。 */
function nameOf(staffId: string | null): string {
  if (staffId === null) return '—'
  const s = demoStaff.find((x) => x.id === staffId)
  return s?.name ?? staffId
}

export function DailyAssignment(): JSX.Element {
  const cells = useMemo(() => demoBaseCells(), [])
  const [date, setDate] = useState<string>(DEMO_WORK_DATES[0] ?? '')

  // [input-core] buildDailyAssignment: 当日の稼働者を必要人数分だけ資格を満たす範囲で割当、不足は欠員。
  const assignment: DailyAssignmentModel = useMemo(
    () => buildDailyAssignment(DEMO_SITE_ID, date, cells, demoPositions, demoStaff),
    [date, cells],
  )

  const vacancyPositions = new Set(assignment.vacancies.map((v) => v.position))

  return (
    <div className="page">
      <header className="page-head">
        <h1 className="page-title">配置表</h1>
        <label className="fl">
          対象日
          <select className="input" aria-label="対象日を選択" value={date} onChange={(e) => setDate(e.target.value)}>
            {DEMO_WORK_DATES.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </label>
      </header>

      {assignment.vacancies.length > 0 && (
        <section className="card" aria-label="欠員警告">
          <div className="card-b vacancy-alert">
            <span className="lv lv-high">欠員</span>
            <span>
              {assignment.vacancies.map((v) => `${v.position}（不足${v.shortBy}名）`).join(' / ')}
            </span>
          </div>
        </section>
      )}

      <section className="card" aria-label="配置表">
        <div className="card-b">
          <table className="tbl">
            <thead>
              <tr>
                <th>ポジション</th>
                <th>担当</th>
                <th>状態</th>
              </tr>
            </thead>
            <tbody>
              {assignment.cells.map((c, i) => {
                const vacant = c.staffId === null
                return (
                  <tr key={`${c.position}-${i}`} className={vacant ? 'row-vacant' : undefined}>
                    <td>{c.position}</td>
                    <td>{nameOf(c.staffId)}</td>
                    <td>
                      {vacant ? (
                        <span className="status st-rejected">欠員</span>
                      ) : (
                        <span className="status st-approved">充足</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {vacancyPositions.size === 0 && (
            <p className="muted">この日はすべてのポジションが充足しています。</p>
          )}
        </div>
      </section>
    </div>
  )
}
