// [現場] 月次シフト表（氏名 × 1〜31日）。BHT「シフト掲示用」様式に準拠。
// セル=勤務区分コード。クリックで区分を巡回入力（＝シフト登録）。曜日ヘッダ＋日別体制(出勤数)を集計。
// 区分は現場で追加・調整できる想定（既定コードを持つ）。
import { useEffect, useMemo, useState } from 'react'
import { listStaff as apiListStaff, subscribe as subStaff } from '../staff/staffApi.js'
import { hopesForMonth, subscribe as subHope } from '../../shared/shiftHopeStore.js'
import { saveShift } from '../../shared/shiftStore.js'

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
const ROT = ['責', '日B', '日C', '明', '休', '夜A', '当', '明', '休', '日C']

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
  const g: Record<string, string[]> = {}
  staff.forEach((s, si) => {
    g[s.id] = days.map((d) => ROT[(d.day + si * 3) % ROT.length]!)
  })
  return g
}

export function ShiftMonth(): JSX.Element {
  const [month, setMonth] = useState('2026-09')
  const days = useMemo(() => daysInMonth(month), [month])
  const [roster, setRoster] = useState<Staff[]>([])
  const [grid, setGrid] = useState<Record<string, string[]>>({})
  const [toast, setToast] = useState<string | null>(null)
  // 勤務員PWAから提出されたシフト希望（対象月）。
  const [hopeCount, setHopeCount] = useState<number>(() => hopesForMonth(month).length)
  useEffect(() => subHope(() => setHopeCount(hopesForMonth(month).length)), [month])
  // 名簿(勤務員登録)の変更を反映。新規登録者は既定ローテで行追加。
  const loadRoster = (): void => { void apiListStaff().then((list) => setRoster(list.filter((s) => s.active).map((s) => ({ id: s.no, name: s.name, emp: s.role })))) }
  useEffect(() => { loadRoster(); return subStaff(loadRoster) }, [])
  useEffect(() => {
    setGrid((p) => {
      const g = { ...p }
      roster.forEach((s, si) => { if (!g[s.id]) g[s.id] = days.map((d) => ROT[(d.day + si * 3) % ROT.length]!) })
      return g
    })
  }, [roster, days])
  // シフト(=配置予定)を保存。配置予定表がこれを参照する。
  useEffect(() => {
    saveShift({ ym: month, staff: roster.map((r) => ({ no: r.id, name: r.name })), grid, savedAt: month })
  }, [grid, month, roster])

  // 月変更時はグリッド作り直し
  const changeMonth = (m: string): void => {
    setMonth(m)
    setGrid(seedGrid(roster, daysInMonth(m)))
    setHopeCount(hopesForMonth(m).length)
  }

  // 勤務員の希望をシフトに反映（休み希望→公休 / 夜勤希望→夜勤A / 勤務可→空欄なら日勤B）。
  const applyHopes = (): void => {
    const hs = hopesForMonth(month)
    if (hs.length === 0) { setToast('この月の希望はまだ提出されていません'); return }
    setGrid((p) => {
      const g = { ...p }
      for (const h of hs) {
        const row = [...(g[h.staffNo] ?? days.map(() => ''))]
        for (const [d, v] of Object.entries(h.days)) {
          const i = Number(d) - 1
          if (i < 0 || i >= row.length) continue
          row[i] = v === '休' ? '休' : v === '夜' ? '夜A' : (row[i] && row[i] !== '' ? row[i]! : '日B')
        }
        g[h.staffNo] = row
      }
      return g
    })
    setToast(`勤務員の希望 ${hs.length}名分をシフトに反映しました`)
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
    () => days.map((_, i) => roster.reduce((n, s) => n + (codeOf(grid[s.id]?.[i] ?? '').working ? 1 : 0), 0)),
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
          <h2>現場名：ブルガリホテル東京</h2>
          <span className="muted">{month} / {roster.length}名 ／ 提出希望 {hopeCount}名</span>
          <button type="button" className="btn btn-primary" style={{ marginLeft: 'auto' }} onClick={applyHopes}>勤務員の希望を反映</button>
          <button type="button" className="btn btn-secondary" onClick={() => setToast('勤務表を出力しました（出力センターの現場様式・本結線時PDF/Excel）')}>勤務表を出力</button>
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
                {roster.map((s) => (
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
