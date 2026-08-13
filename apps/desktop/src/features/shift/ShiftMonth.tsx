// [現場] 月次シフト表（氏名 × 1〜31日）。BHT「シフト掲示用」様式に準拠。
// セル=勤務区分コード。クリックで区分を巡回入力（＝シフト登録）。曜日ヘッダ＋日別体制(出勤数)を集計。
// 区分は現場で追加・調整できる想定（既定コードを持つ）。
import { useMemo, useState } from 'react'

// 勤務区分コード（責任者/日勤A..C/夜勤A,B/当務/明休/公休/研修/有給/非番）。working=出勤としてカウント。
interface Code { key: string; label: string; working: boolean; cls: string }
const CODES: Code[] = [
  { key: '', label: '', working: false, cls: '' },
  { key: '責', label: '責任者', working: true, cls: 'sc-resp' },
  { key: '日A', label: '日勤A', working: true, cls: 'sc-day' },
  { key: '日B', label: '日勤B', working: true, cls: 'sc-day' },
  { key: '日C', label: '日勤C', working: true, cls: 'sc-day' },
  { key: '夜A', label: '夜勤A', working: true, cls: 'sc-night' },
  { key: '夜B', label: '夜勤B', working: true, cls: 'sc-night' },
  { key: '当', label: '当務', working: true, cls: 'sc-touban' },
  { key: '明', label: '明休', working: false, cls: 'sc-off' },
  { key: '休', label: '公休', working: false, cls: 'sc-off' },
  { key: '研', label: '研修', working: true, cls: 'sc-train' },
  { key: '有', label: '有給', working: false, cls: 'sc-leave' },
  { key: '×', label: '不可', working: false, cls: 'sc-x' },
]
const codeOf = (k: string): Code => CODES.find((c) => c.key === k) ?? CODES[0]!
const DOW = ['日', '月', '火', '水', '木', '金', '土']

interface Staff { id: string; name: string; emp: string }
const STAFF: Staff[] = [
  { id: 'u1', name: '三角 龍彦', emp: '社員' },
  { id: 'u2', name: '藤井 隆幸', emp: '社員' },
  { id: 'u3', name: '武田 崇将', emp: '社員' },
  { id: 'u4', name: '石井 秀幸', emp: '社員' },
  { id: 'u5', name: '鈴木 花', emp: '契約' },
  { id: 'u6', name: '田中 誠', emp: '契約' },
]

function daysInMonth(month: string): { date: string; day: number; dow: number }[] {
  const [y, m] = month.split('-').map(Number)
  const n = new Date(y!, m!, 0).getDate()
  const out = []
  for (let d = 1; d <= n; d++) {
    const date = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    out.push({ date, day: d, dow: new Date(y!, m! - 1, d).getDay() })
  }
  return out
}

// 決定論的なデモ初期シフト（責/日勤ローテ＋夜勤＋当務＋休み）。乱数不使用。
function seedGrid(staff: Staff[], days: { day: number }[]): Record<string, string[]> {
  const rot = ['責', '日B', '日C', '明', '休', '夜A', '当', '明', '休', '日C']
  const g: Record<string, string[]> = {}
  staff.forEach((s, si) => {
    g[s.id] = days.map((d) => rot[(d.day + si * 3) % rot.length]!)
  })
  return g
}

export function ShiftMonth(): JSX.Element {
  const [month, setMonth] = useState('2026-08')
  const days = useMemo(() => daysInMonth(month), [month])
  const [grid, setGrid] = useState<Record<string, string[]>>(() => seedGrid(STAFF, days))
  const [toast, setToast] = useState<string | null>(null)

  // 月変更時はグリッド作り直し
  const changeMonth = (m: string): void => {
    setMonth(m)
    setGrid(seedGrid(STAFF, daysInMonth(m)))
  }

  // セルクリックで次の区分へ巡回（シフト登録）
  const cycle = (staffId: string, idx: number): void => {
    setGrid((p) => {
      const row = [...(p[staffId] ?? [])]
      const cur = CODES.findIndex((c) => c.key === (row[idx] ?? ''))
      row[idx] = CODES[(cur + 1) % CODES.length]!.key
      return { ...p, [staffId]: row }
    })
  }

  // 日別 出勤者数（体制）
  const headcount = useMemo(
    () => days.map((_, i) => STAFF.reduce((n, s) => n + (codeOf(grid[s.id]?.[i] ?? '').working ? 1 : 0), 0)),
    [grid, days],
  )
  // スタッフ別 出勤日数
  const workDays = (id: string): number => (grid[id] ?? []).filter((k) => codeOf(k).working).length

  return (
    <div className="page">
      <header className="page-head">
        <h1 className="page-title">シフト表（月次）</h1>
        <label className="fl">対象月<input className="input" type="month" value={month} onChange={(e) => changeMonth(e.target.value)} /></label>
      </header>

      <section className="card" aria-label="勤務区分の凡例">
        <div className="card-b sc-legend">
          {CODES.filter((c) => c.key).map((c) => (
            <span key={c.key} className={`sc-chip ${c.cls}`}>{c.key}<i>{c.label}</i></span>
          ))}
          <span className="muted">セルをクリックで区分を切替（＝シフト登録）</span>
        </div>
      </section>

      <section className="card" aria-label="月次シフト表">
        <div className="card-h">
          <h2>現場名：ブルガリホテル東京（デモ）</h2>
          <span className="muted">{month} / {STAFF.length}名</span>
          <button type="button" className="btn btn-secondary" style={{ marginLeft: 'auto' }} onClick={() => setToast('勤務表を出力しました（出力センターの現場様式・本結線時PDF/Excel）')}>勤務表を出力</button>
        </div>
        <div className="card-b" style={{ padding: 0 }}>
          <div className="sm-scroll">
            <table className="sm-tbl">
              <thead>
                <tr>
                  <th className="sm-name sm-sticky">氏名</th>
                  <th className="sm-emp">区分</th>
                  {days.map((d) => (
                    <th key={d.date} className={`sm-d ${d.dow === 0 ? 'sm-sun' : d.dow === 6 ? 'sm-sat' : ''}`}>{d.day}</th>
                  ))}
                  <th className="sm-sum">出勤</th>
                </tr>
                <tr>
                  <th className="sm-name sm-sticky"></th>
                  <th className="sm-emp"></th>
                  {days.map((d) => (
                    <th key={d.date} className={`sm-dow ${d.dow === 0 ? 'sm-sun' : d.dow === 6 ? 'sm-sat' : ''}`}>{DOW[d.dow]}</th>
                  ))}
                  <th className="sm-sum"></th>
                </tr>
              </thead>
              <tbody>
                {STAFF.map((s) => (
                  <tr key={s.id}>
                    <td className="sm-name sm-sticky">{s.name}</td>
                    <td className="sm-emp">{s.emp}</td>
                    {days.map((d, i) => {
                      const c = codeOf(grid[s.id]?.[i] ?? '')
                      return (
                        <td key={d.date} className={`sm-cell ${c.cls} ${d.dow === 0 ? 'sm-sun-c' : d.dow === 6 ? 'sm-sat-c' : ''}`}>
                          <button type="button" className="sm-btn" title={`${s.name} ${d.day}日`} onClick={() => cycle(s.id, i)}>{c.key}</button>
                        </td>
                      )
                    })}
                    <td className="sm-sum">{workDays(s.id)}</td>
                  </tr>
                ))}
                <tr className="sm-total">
                  <td className="sm-name sm-sticky">体制（出勤数）</td>
                  <td className="sm-emp"></td>
                  {headcount.map((n, i) => (
                    <td key={i} className={`sm-hc ${n === 0 ? 'sm-zero' : ''}`}>{n}</td>
                  ))}
                  <td className="sm-sum">{headcount.reduce((a, b) => a + b, 0)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {toast && <div className="toast" role="status" aria-live="polite">{toast}</div>}
    </div>
  )
}
