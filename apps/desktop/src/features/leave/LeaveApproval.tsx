// [会社] 有給申請の確認/承認。現場からの申請を会社側で承認・却下（デモ:ローカル状態）。
import { useState } from 'react'

interface Req {
  id: string
  site: string
  staff: string
  from: string
  to: string
  days: number
  reason: string
  status: '申請中' | '承認' | '却下'
}

const SEED: Req[] = [
  { id: 'a1', site: 'ららテラス立川', staff: '鈴木 花', from: '2026-08-20', to: '2026-08-21', days: 2, reason: '私用', status: '申請中' },
  { id: 'a2', site: '立川立飛', staff: '田中 誠', from: '2026-08-25', to: '2026-08-25', days: 1, reason: '通院', status: '申請中' },
  { id: 'a3', site: 'ららテラス立川', staff: '佐藤 健', from: '2026-07-10', to: '2026-07-10', days: 1, reason: '私用', status: '承認' },
]

export function LeaveApproval(): JSX.Element {
  const [rows, setRows] = useState<Req[]>(SEED)
  const [toast, setToast] = useState<string | null>(null)
  const decide = (id: string, status: '承認' | '却下'): void => {
    setRows((p) => p.map((r) => (r.id === id ? { ...r, status } : r)))
    setToast(`申請を${status}しました`)
  }
  const pending = rows.filter((r) => r.status === '申請中')

  return (
    <div className="page">
      <header className="page-head">
        <h1 className="page-title">有給申請の確認</h1>
        <span className="muted">未処理 {pending.length} 件</span>
      </header>
      <section className="card" aria-label="有給申請一覧">
        <div className="card-h"><h2>申請一覧</h2><span className="muted">{rows.length} 件</span></div>
        <div className="card-b">
          <table className="tbl">
            <thead><tr><th>現場</th><th>対象者</th><th>期間</th><th>日数</th><th>理由</th><th>状態</th><th></th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.site}</td><td>{r.staff}</td><td>{r.from} 〜 {r.to}</td><td>{r.days}日</td><td>{r.reason}</td>
                  <td><span className={`status ${r.status === '承認' ? 'st-approved' : r.status === '却下' ? 'st-rejected' : 'st-submitted'}`}>{r.status}</span></td>
                  <td>
                    {r.status === '申請中' ? (
                      <span className="row-actions" style={{ gap: 6 }}>
                        <button type="button" className="btn-sm btn-approve" onClick={() => decide(r.id, '承認')}>承認</button>
                        <button type="button" className="btn-sm btn-reject" onClick={() => decide(r.id, '却下')}>却下</button>
                      </span>
                    ) : <span className="muted">—</span>}
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
