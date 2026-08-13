// [会社] 講習会の登録・案内・予約受付。会社/本社が講習会を登録し、現場からの申込(予約)を受け付ける（デモ:ローカル状態）。
import { useMemo, useState } from 'react'

interface Seminar {
  id: string
  title: string
  date: string
  place: string
  capacity: number
  reserved: number
}

const SEED: Seminar[] = [
  { id: 's1', title: '新任警備員 法定研修（20時間）', date: '2026-09-03', place: '本社研修室', capacity: 20, reserved: 12 },
  { id: 's2', title: '施設警備 現任教育', date: '2026-09-10', place: 'オンライン', capacity: 50, reserved: 31 },
  { id: 's3', title: '上級救命講習', date: '2026-09-18', place: '立川消防署', capacity: 15, reserved: 15 },
]

export function TrainingManage(): JSX.Element {
  const [rows, setRows] = useState<Seminar[]>(SEED)
  const [title, setTitle] = useState('')
  const [date, setDate] = useState('2026-09-25')
  const [place, setPlace] = useState('')
  const [cap, setCap] = useState(20)
  const [toast, setToast] = useState<string | null>(null)

  const add = (): void => {
    if (title === '') { setToast('講習会名を入力してください'); return }
    setRows((p) => [...p, { id: `s-${p.length + 1}`, title, date, place, capacity: cap, reserved: 0 }])
    setTitle(''); setPlace('')
    setToast('講習会を登録しました（現場へ案内・予約受付を開始）')
  }
  const sorted = useMemo(() => [...rows].sort((a, b) => a.date.localeCompare(b.date)), [rows])

  return (
    <div className="page">
      <header className="page-head">
        <h1 className="page-title">講習会 管理</h1>
        <span className="muted">登録 {rows.length} 件 / 予約 {rows.reduce((s, r) => s + r.reserved, 0)} 名</span>
      </header>

      <section className="card" aria-label="講習会の登録">
        <div className="card-h"><h2>講習会を登録</h2></div>
        <div className="card-b">
          <div className="filters">
            <label className="fl">講習会名<input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="例: 現任教育" /></label>
            <label className="fl">開催日<input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
            <label className="fl">会場<input className="input" value={place} onChange={(e) => setPlace(e.target.value)} placeholder="本社研修室 / オンライン 等" /></label>
            <label className="fl">定員<input className="input" type="number" value={cap} onChange={(e) => setCap(Number(e.target.value) || 0)} /></label>
          </div>
          <div className="row-actions"><button type="button" className="btn btn-primary" onClick={add}>登録して案内</button></div>
        </div>
      </section>

      <section className="card" aria-label="開催カレンダー(予約受付)">
        <div className="card-h"><h2>開催カレンダー・予約状況</h2></div>
        <div className="card-b">
          <table className="tbl">
            <thead><tr><th>開催日</th><th>講習会</th><th>会場</th><th>予約/定員</th><th>状況</th></tr></thead>
            <tbody>
              {sorted.map((s) => {
                const rate = s.capacity > 0 ? s.reserved / s.capacity : 0
                return (
                  <tr key={s.id}>
                    <td>{s.date}</td><td>{s.title}</td><td>{s.place}</td>
                    <td>{s.reserved}/{s.capacity}</td>
                    <td><span className={`status ${rate >= 1 ? 'st-rejected' : rate >= 0.8 ? 'st-submitted' : 'st-approved'}`}>{rate >= 1 ? '満席' : rate >= 0.8 ? '残少' : '受付中'}</span></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>
      {toast && <div className="toast" role="status" aria-live="polite">{toast}</div>}
    </div>
  )
}
