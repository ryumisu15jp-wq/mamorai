// [現場] 講習会・研修の参加申込。会社/本社が登録した講習会に申し込む（デモ:ローカル状態）。
import { useState } from 'react'

interface Seminar {
  id: string
  title: string
  date: string
  place: string
  capacity: number
  applied: number
  mine: boolean
}

const SEED: Seminar[] = [
  { id: 't1', title: '新任警備員 法定研修（20時間）', date: '2026-09-03', place: '本社研修室', capacity: 20, applied: 12, mine: false },
  { id: 't2', title: '施設警備 現任教育', date: '2026-09-10', place: 'オンライン', capacity: 50, applied: 31, mine: false },
  { id: 't3', title: '上級救命講習', date: '2026-09-18', place: '立川消防署', capacity: 15, applied: 15, mine: false },
]

export function TrainingApply(): JSX.Element {
  const [rows, setRows] = useState<Seminar[]>(SEED)
  const [toast, setToast] = useState<string | null>(null)
  const apply = (id: string): void => {
    setRows((p) => p.map((s) => (s.id === id && !s.mine && s.applied < s.capacity ? { ...s, applied: s.applied + 1, mine: true } : s)))
    setToast('参加を申し込みました')
  }
  return (
    <div className="page">
      <header className="page-head">
        <h1 className="page-title">講習会・研修 参加申込</h1>
        <span className="muted">申込済 {rows.filter((s) => s.mine).length} 件</span>
      </header>
      <section className="card" aria-label="講習会一覧">
        <div className="card-h"><h2>開催予定</h2><span className="muted">{rows.length} 件</span></div>
        <div className="card-b">
          <table className="tbl">
            <thead><tr><th>講習会</th><th>日程</th><th>会場</th><th>定員</th><th></th></tr></thead>
            <tbody>
              {rows.map((s) => {
                const full = s.applied >= s.capacity && !s.mine
                return (
                  <tr key={s.id}>
                    <td>{s.title}</td><td>{s.date}</td><td>{s.place}</td>
                    <td>{s.applied}/{s.capacity}</td>
                    <td>
                      {s.mine ? <span className="status st-approved">申込済</span>
                        : full ? <span className="status st-missing">満席</span>
                        : <button type="button" className="btn-sm btn-approve" onClick={() => apply(s.id)}>申込む</button>}
                    </td>
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
