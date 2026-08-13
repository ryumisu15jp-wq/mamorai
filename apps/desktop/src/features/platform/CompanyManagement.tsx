// [運営/TRYANGROW] 会社管理。契約中の会社（テナント）の登録・状態確認（デモ:ローカル状態）。
import { useState } from 'react'

interface Company {
  id: string
  name: string
  code: string
  sites: number
  users: number
  plan: string
  status: '稼働' | '停止' | '試用'
}

const SEED: Company[] = [
  { id: 'c1', name: '三角警備保障', code: 'TRA-8821', sites: 12, users: 148, plan: 'Standard', status: '稼働' },
  { id: 'c2', name: '立飛セキュリティ', code: 'TAC-1032', sites: 5, users: 63, plan: 'Lite', status: '試用' },
  { id: 'c3', name: 'ミライ警備', code: 'MRI-4407', sites: 20, users: 240, plan: 'Enterprise', status: '稼働' },
]

export function CompanyManagement(): JSX.Element {
  const [rows, setRows] = useState<Company[]>(SEED)
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [toast, setToast] = useState<string | null>(null)
  const add = (): void => {
    if (name === '' || code === '') { setToast('会社名と識別コードを入力してください'); return }
    setRows((p) => [...p, { id: `c-${p.length + 1}`, name, code: code.toUpperCase(), sites: 0, users: 0, plan: 'Lite', status: '試用' }])
    setName(''); setCode('')
    setToast('会社を登録しました')
  }
  return (
    <div className="page">
      <header className="page-head">
        <h1 className="page-title">会社管理</h1>
        <span className="muted">契約会社 {rows.length} 社 / 現場 {rows.reduce((s, r) => s + r.sites, 0)} / 利用者 {rows.reduce((s, r) => s + r.users, 0)}</span>
      </header>
      <section className="card" aria-label="会社を登録">
        <div className="card-h"><h2>会社を登録</h2></div>
        <div className="card-b">
          <div className="filters">
            <label className="fl">会社名<input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="◯◯警備" /></label>
            <label className="fl">会社識別コード<input className="input" value={code} onChange={(e) => setCode(e.target.value)} placeholder="TRA-8821" /></label>
          </div>
          <div className="row-actions"><button type="button" className="btn btn-primary" onClick={add}>登録</button></div>
        </div>
      </section>
      <section className="card" aria-label="会社一覧">
        <div className="card-h"><h2>契約会社</h2></div>
        <div className="card-b">
          <table className="tbl">
            <thead><tr><th>会社名</th><th>識別コード</th><th>現場</th><th>利用者</th><th>プラン</th><th>状態</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.name}</td><td><code>{r.code}</code></td><td>{r.sites}</td><td>{r.users}</td><td>{r.plan}</td>
                  <td><span className={`status ${r.status === '稼働' ? 'st-approved' : r.status === '試用' ? 'st-submitted' : 'st-rejected'}`}>{r.status}</span></td>
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
