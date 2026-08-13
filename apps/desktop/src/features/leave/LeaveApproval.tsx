// [会社] 有給申請の確認/承認。現場からの申請を会社側で承認・却下（デモ:ローカル状態）。
// 承認時は、アップロード様式(17.有給休暇申請.xlsx)準拠の「有給休暇申請書」PDFを出力できる。
import { useState } from 'react'
import { printLeaveForm, type LeaveForm } from './leaveForm.js'

interface Req {
  id: string
  site: string
  staff: string
  staffNo: string
  dept: string
  from: string
  to: string
  days: number
  reason: string
  status: '申請中' | '承認' | '却下'
}

const SEED: Req[] = [
  { id: 'a1', site: 'ららテラス立川(施設)', staff: '鈴木 花', staffNo: '812', dept: 'セキュリティサービス4', from: '2026-08-20', to: '2026-08-21', days: 2, reason: '帰省の為', status: '申請中' },
  { id: 'a2', site: '立川立飛(施設)', staff: '田中 誠', staffNo: '655', dept: 'セキュリティサービス2', from: '2026-08-25', to: '2026-08-25', days: 1, reason: '通院の為', status: '申請中' },
  { id: 'a3', site: 'ららテラス立川(施設)', staff: '佐藤 健', staffNo: '921', dept: 'セキュリティサービス4', from: '2026-07-10', to: '2026-07-10', days: 1, reason: '私用の為', status: '承認' },
]

export function LeaveApproval(): JSX.Element {
  const [rows, setRows] = useState<Req[]>(SEED)
  const [toast, setToast] = useState<string | null>(null)
  const decide = (id: string, status: '承認' | '却下'): void => {
    setRows((p) => p.map((r) => (r.id === id ? { ...r, status } : r)))
    setToast(`申請を${status}しました`)
  }
  // 承認済みの申請を、様式PDF(印刷ダイアログ)で出力する。
  const output = (r: Req): void => {
    const form: LeaveForm = {
      filedDate: '2026-08-15', dept: r.dept, site: r.site, staffNo: r.staffNo,
      name: r.staff, fromDate: r.from, toDate: r.to, days: r.days, reason: r.reason,
    }
    if (!printLeaveForm(form)) setToast('ポップアップがブロックされました。許可してください。')
  }
  const approveAndOutput = (r: Req): void => {
    decide(r.id, '承認')
    output({ ...r, status: '承認' })
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
                  <td>{r.site}</td><td>{r.staff}<br /><span className="muted">No.{r.staffNo}</span></td><td>{r.from} 〜 {r.to}</td><td>{r.days}日</td><td>{r.reason}</td>
                  <td><span className={`status ${r.status === '承認' ? 'st-approved' : r.status === '却下' ? 'st-rejected' : 'st-submitted'}`}>{r.status}</span></td>
                  <td>
                    {r.status === '申請中' ? (
                      <span className="row-actions" style={{ gap: 6 }}>
                        <button type="button" className="btn-sm btn-approve" onClick={() => approveAndOutput(r)}>承認してPDF出力</button>
                        <button type="button" className="btn-sm btn-reject" onClick={() => decide(r.id, '却下')}>却下</button>
                      </span>
                    ) : r.status === '承認' ? (
                      <button type="button" className="btn-sm" onClick={() => output(r)}>申請書PDF</button>
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
