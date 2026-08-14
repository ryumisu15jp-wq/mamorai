// [現場] 有給申請の一次承認。勤務員PWAからの申請(申請中)を現場責任者が承認/却下する。
// 承認時、ログイン中の担当者（現場責任者）の印影＋署名が自動付与され、会社へ送信される。
import { useEffect, useMemo, useState } from 'react'
import { STAFF, siteManager } from '../../pilot/bulgari.js'
import { buildSealSvg, buildSignatureSvg } from '../../lib/sealSignature.js'
import { listForSite, approveSite, rejectAtSite, subscribe, type LeaveReq } from './leaveApi.js'

const today = '2026-09-15' // 決定論の当日値（本結線時はサーバ日付）

export function LeaveSiteApproval(): JSX.Element {
  const [rows, setRows] = useState<LeaveReq[]>([])
  const [approver, setApprover] = useState<string>(() => siteManager().name)
  const [toast, setToast] = useState<string | null>(null)
  const load = (): void => { void listForSite().then(setRows) }
  useEffect(() => { load(); return subscribe(load) }, [])

  const pending = rows.filter((r) => r.status === '申請中')
  const seal = useMemo(() => buildSealSvg(approver, 46), [approver])
  const sig = useMemo(() => buildSignatureSvg(approver, 110, 22), [approver])

  const approve = (r: LeaveReq): void => {
    void approveSite(r.id, { name: approver, title: '現場責任者', date: today })
      .then(() => { load(); setToast(`${r.name} さんの申請を承認し、会社へ送信しました`) })
      .catch((e: unknown) => setToast(e instanceof Error ? e.message : '承認に失敗しました'))
  }
  const reject = (r: LeaveReq): void => {
    void rejectAtSite(r.id, `現場(${approver})`).then(() => { load(); setToast(`${r.name} さんの申請を却下しました`) })
  }

  return (
    <div className="page">
      <header className="page-head">
        <h1 className="page-title">有給申請の承認（現場）</h1>
        <span className="muted">未処理 {pending.length} 件</span>
      </header>

      <section className="card" aria-label="承認担当者">
        <div className="card-h"><h2>承認担当者（現場責任者）</h2><span className="muted">承認時に印・署名を自動付与</span></div>
        <div className="card-b">
          <div className="filters" style={{ alignItems: 'center' }}>
            <label className="fl">担当者
              <select className="input" value={approver} onChange={(e) => setApprover(e.target.value)}>
                {STAFF.filter((s) => s.role !== '隊員').map((s) => <option key={s.no} value={s.name}>{s.name}（{s.role}）</option>)}
              </select>
            </label>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
              <span dangerouslySetInnerHTML={{ __html: seal }} />
              <span dangerouslySetInnerHTML={{ __html: sig }} />
            </span>
          </div>
          <p className="muted">※ ログイン中の担当者を選択。承認すると上記の印影・署名が申請書に押印されます。</p>
        </div>
      </section>

      <section className="card" aria-label="有給申請一覧">
        <div className="card-h"><h2>申請一覧</h2><span className="muted">{rows.length} 件</span></div>
        <div className="card-b">
          <table className="tbl">
            <thead><tr><th>現場</th><th>対象者</th><th>期間</th><th>日数</th><th>理由</th><th>状態</th><th></th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.site}</td>
                  <td>{r.name}<br /><span className="muted">No.{r.staffNo}</span></td>
                  <td>{r.from} 〜 {r.to}</td><td>{r.days}日</td><td>私用の為、{r.reason}</td>
                  <td><span className={`status ${r.status === '会社承認' ? 'st-approved' : r.status === '却下' ? 'st-rejected' : r.status === '現場承認' ? 'st-submitted' : 'st-draft'}`}>{r.status}</span></td>
                  <td>
                    {r.status === '申請中' ? (
                      <span className="row-actions" style={{ gap: 6 }}>
                        <button type="button" className="btn-sm btn-approve" onClick={() => approve(r)}>承認して会社へ送信</button>
                        <button type="button" className="btn-sm btn-reject" onClick={() => reject(r)}>却下</button>
                      </span>
                    ) : r.status === '現場承認' ? <span className="muted">会社の承認待ち</span>
                      : <span className="muted">—</span>}
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
