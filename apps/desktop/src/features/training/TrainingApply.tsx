// [現場] 講習会・研修の参加申込。法定研修(新任/現任)を含む。
// 申込には氏名・生年月日が必要。スタッフNo入力で登録済み勤務員(氏名/生年月日/部署/所属現場)を自動反映。
import { useState } from 'react'

interface Seminar {
  id: string
  title: string
  kind: '新任教育' | '現任教育' | '一般'
  date: string
  place: string
  capacity: number
  applied: number
  mine: boolean
}
// 現場で登録済みの勤務員マスタ（スタッフNo→属性）。本結線時はDB。
interface StaffRec { no: string; name: string; dob: string; dept: string; site: string }
const STAFF_MASTER: Record<string, StaffRec> = {
  '783': { no: '783', name: '三角 龍彦', dob: '1985-04-12', dept: '施設警備部', site: 'ブルガリホテル東京' },
  '784': { no: '784', name: '藤井 隆幸', dob: '1990-09-03', dept: '施設警備部', site: 'ブルガリホテル東京' },
  '812': { no: '812', name: '鈴木 花', dob: '1998-01-22', dept: '交通誘導部', site: '立川立飛' },
}

const SEED: Seminar[] = [
  { id: 't1', title: '新任教育（法定20時間）', kind: '新任教育', date: '2026-09-03', place: '本社研修室', capacity: 20, applied: 12, mine: false },
  { id: 't2', title: '現任教育（法定10時間）', kind: '現任教育', date: '2026-09-10', place: 'オンライン', capacity: 50, applied: 31, mine: false },
  { id: 't3', title: '上級救命講習', kind: '一般', date: '2026-09-18', place: '立川消防署', capacity: 15, applied: 15, mine: false },
]
const kindCls = (k: Seminar['kind']): string => (k === '新任教育' ? 'st-rejected' : k === '現任教育' ? 'st-submitted' : 'st-draft')

export function TrainingApply(): JSX.Element {
  const [rows, setRows] = useState<Seminar[]>(SEED)
  const [staffNo, setStaffNo] = useState('')
  const [name, setName] = useState('')
  const [dob, setDob] = useState('')
  const [dept, setDept] = useState('')
  const [site, setSite] = useState('')
  const [toast, setToast] = useState<string | null>(null)

  // スタッフNo入力→マスタから自動反映
  const onStaffNo = (v: string): void => {
    setStaffNo(v)
    const rec = STAFF_MASTER[v.trim()]
    if (rec) { setName(rec.name); setDob(rec.dob); setDept(rec.dept); setSite(rec.site) }
  }

  const apply = (id: string): void => {
    if (name === '' || dob === '') { setToast('申込には氏名・生年月日が必要です（スタッフNoで自動反映できます）'); return }
    setRows((p) => p.map((s) => (s.id === id && !s.mine && s.applied < s.capacity ? { ...s, applied: s.applied + 1, mine: true } : s)))
    setToast(`${name} さんの参加を申し込みました`)
  }

  return (
    <div className="page">
      <header className="page-head">
        <h1 className="page-title">講習会・研修 参加申込</h1>
        <span className="muted">申込済 {rows.filter((s) => s.mine).length} 件</span>
      </header>

      <section className="card" aria-label="申込者情報">
        <div className="card-h"><h2>申込者情報</h2><span className="muted">スタッフNoで自動反映</span></div>
        <div className="card-b">
          <div className="filters">
            <label className="fl">スタッフNo<input className="input" value={staffNo} onChange={(e) => onStaffNo(e.target.value)} placeholder="例: 783" /></label>
            <label className="fl">氏名<input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="自動反映" /></label>
            <label className="fl">生年月日<input className="input" type="date" value={dob} onChange={(e) => setDob(e.target.value)} /></label>
            <label className="fl">部署<input className="input" value={dept} onChange={(e) => setDept(e.target.value)} placeholder="自動反映" /></label>
            <label className="fl">所属現場<input className="input" value={site} onChange={(e) => setSite(e.target.value)} placeholder="自動反映" /></label>
          </div>
          <p className="muted">※ 現場で登録済みの勤務員は、スタッフNo入力だけで氏名・生年月日・部署・所属現場が反映されます。</p>
        </div>
      </section>

      <section className="card" aria-label="講習会一覧">
        <div className="card-h"><h2>開催予定（法定研修を含む）</h2><span className="muted">{rows.length} 件</span></div>
        <div className="card-b">
          <table className="tbl">
            <thead><tr><th>区分</th><th>講習会</th><th>日程</th><th>会場</th><th>予約</th><th></th></tr></thead>
            <tbody>
              {rows.map((s) => {
                const full = s.applied >= s.capacity && !s.mine
                return (
                  <tr key={s.id}>
                    <td><span className={`status ${kindCls(s.kind)}`}>{s.kind}</span></td>
                    <td>{s.title}</td><td>{s.date}</td><td>{s.place}</td><td>{s.applied}/{s.capacity}</td>
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
