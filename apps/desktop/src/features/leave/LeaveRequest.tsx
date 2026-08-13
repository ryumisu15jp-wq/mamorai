// [現場] 有給申請。スタッフが休暇を申請し、会社側(有給確認)で承認される想定（デモ:ローカル状態）。
import { useState } from 'react'

interface LeaveReq {
  id: string
  from: string
  to: string
  days: number
  reason: string
  status: '申請中' | '承認' | '却下'
}

function today(): string {
  // 決定論を保つため固定の当日値（本結線時はサーバ日付）
  return '2026-08-15'
}

export function LeaveRequest(): JSX.Element {
  const [from, setFrom] = useState(today())
  const [to, setTo] = useState(today())
  const [reason, setReason] = useState('')
  const [rows, setRows] = useState<LeaveReq[]>([
    { id: 'lv-1', from: '2026-07-20', to: '2026-07-20', days: 1, reason: '私用', status: '承認' },
  ])
  const [toast, setToast] = useState<string | null>(null)

  const submit = (): void => {
    if (from === '' || to === '') { setToast('日付を入力してください'); return }
    const d = Math.max(1, Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1)
    setRows((p) => [{ id: `lv-${p.length + 1}`, from, to, days: d, reason, status: '申請中' }, ...p])
    setReason('')
    setToast('有給を申請しました（会社の確認待ち）')
  }

  const remaining = 20 - rows.filter((r) => r.status !== '却下').reduce((s, r) => s + r.days, 0)

  return (
    <div className="page">
      <header className="page-head">
        <h1 className="page-title">有給申請</h1>
        <span className="muted">残 {remaining} 日（付与20日・デモ）</span>
      </header>

      <section className="card" aria-label="申請フォーム">
        <div className="card-h"><h2>新規申請</h2></div>
        <div className="card-b">
          <div className="filters">
            <label className="fl">開始日<input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
            <label className="fl">終了日<input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
            <label className="fl">理由（任意）<input className="input" type="text" value={reason} placeholder="私用 等" onChange={(e) => setReason(e.target.value)} /></label>
          </div>
          <div className="row-actions"><button type="button" className="btn btn-primary" onClick={submit}>申請する</button></div>
        </div>
      </section>

      <section className="card" aria-label="申請履歴">
        <div className="card-h"><h2>申請履歴</h2><span className="muted">{rows.length} 件</span></div>
        <div className="card-b">
          <table className="tbl">
            <thead><tr><th>期間</th><th>日数</th><th>理由</th><th>状態</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.from} 〜 {r.to}</td><td>{r.days}日</td><td>{r.reason || '—'}</td>
                  <td><span className={`status ${r.status === '承認' ? 'st-approved' : r.status === '却下' ? 'st-rejected' : 'st-submitted'}`}>{r.status}</span></td>
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
