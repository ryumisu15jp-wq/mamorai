// [現場] 勤務員登録。ブルガリホテル東京 セキュリティ２グループの勤務員を登録・編集する。
// 登録した勤務員は、講習会申込の自動反映や有給申請書の氏名などに用いられる（本結線時はDB）。
import { useEffect, useState } from 'react'
import { SITE, COMPANY, type PilotStaff } from '../../pilot/bulgari.js'
import { listStaff, upsertStaff, setActive, subscribe } from '../../shared/staffStore.js'

type Row = PilotStaff
const ROLES: Row['role'][] = ['現場責任者', '副責任者', '隊員']

export function StaffRegister(): JSX.Element {
  const [rows, setRows] = useState<Row[]>(() => listStaff())
  const [form, setForm] = useState<Row>({ no: '', name: '', dob: '', dept: SITE.dept, site: SITE.name, role: '隊員', active: true })
  const [editing, setEditing] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  useEffect(() => subscribe(() => setRows(listStaff())), [])

  const reset = (): void => { setForm({ no: '', name: '', dob: '', dept: SITE.dept, site: SITE.name, role: '隊員', active: true }); setEditing(null) }

  const save = (): void => {
    if (form.no.trim() === '' || form.name.trim() === '') { setToast('スタッフNoと氏名は必須です'); return }
    upsertStaff({ ...form, no: form.no.trim() })
    setToast(`${form.name}（No.${form.no}）を${editing !== null ? '更新' : '登録'}しました`)
    reset()
  }
  const edit = (r: Row): void => { setForm({ ...r }); setEditing(r.no) }
  const toggle = (no: string): void => { const r = rows.find((x) => x.no === no); if (r) setActive(no, !r.active) }

  return (
    <div className="page">
      <header className="page-head">
        <h1 className="page-title">勤務員登録</h1>
        <span className="muted">{COMPANY.name}／{SITE.name}／{SITE.dept}</span>
      </header>

      <section className="card" aria-label="勤務員の登録・編集">
        <div className="card-h"><h2>{editing !== null ? '勤務員を編集' : '新規登録'}</h2>{editing !== null && <button type="button" className="btn-sm" onClick={reset}>新規に切替</button>}</div>
        <div className="card-b">
          <div className="filters">
            <label className="fl">スタッフNo<input className="input" value={form.no} disabled={editing !== null} onChange={(e) => setForm({ ...form, no: e.target.value })} placeholder="例: 831" /></label>
            <label className="fl">氏名<input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="姓 名" /></label>
            <label className="fl">生年月日<input className="input" type="date" value={form.dob} onChange={(e) => setForm({ ...form, dob: e.target.value })} /></label>
            <label className="fl">役割
              <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Row['role'] })}>
                {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </label>
            <label className="fl">所属<input className="input" value={form.dept} onChange={(e) => setForm({ ...form, dept: e.target.value })} /></label>
          </div>
          <div className="row-actions"><button type="button" className="btn btn-primary" onClick={save}>{editing !== null ? '更新する' : '登録する'}</button></div>
        </div>
      </section>

      <section className="card" aria-label="勤務員一覧">
        <div className="card-h"><h2>勤務員一覧</h2><span className="muted">在籍 {rows.filter((r) => r.active).length} 名 / 全 {rows.length} 名</span></div>
        <div className="card-b">
          <table className="tbl">
            <thead><tr><th>No.</th><th>氏名</th><th>生年月日</th><th>役割</th><th>所属</th><th>状態</th><th></th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.no} style={{ opacity: r.active ? 1 : 0.5 }}>
                  <td>{r.no}</td><td>{r.name}</td><td>{r.dob || '—'}</td>
                  <td><span className={`status ${r.role === '現場責任者' ? 'st-approved' : r.role === '副責任者' ? 'st-submitted' : 'st-draft'}`}>{r.role}</span></td>
                  <td>{r.dept}</td>
                  <td>{r.active ? '在籍' : '休止'}</td>
                  <td>
                    <span className="row-actions" style={{ gap: 6 }}>
                      <button type="button" className="btn-sm" onClick={() => edit(r)}>編集</button>
                      <button type="button" className="btn-sm btn-reject" onClick={() => toggle(r.no)}>{r.active ? '休止' : '復帰'}</button>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {toast && <div className="toast" role="status" aria-live="polite">{toast}</div>}
    </div>
  )
}
