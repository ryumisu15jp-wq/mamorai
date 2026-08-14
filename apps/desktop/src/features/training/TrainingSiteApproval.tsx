// [現場] 講習会・研修 申込の一次承認。勤務員PWAからの申込(申請中)を現場責任者が承認/却下する。
// 承認時、ログイン中の担当者（現場責任者）の印影＋署名が付与され、会社へ送信される。
import { useEffect, useMemo, useState } from 'react'
import { STAFF, siteManager } from '../../pilot/bulgari.js'
import { buildSealSvg, buildSignatureSvg } from '../../lib/sealSignature.js'
import { listTraining, approveSiteTraining, rejectTraining, subscribe, type TrainingApp } from '../../shared/trainingStore.js'

const today = '2026-09-15'
const kindCls = (k: TrainingApp['kind']): string => (k === '新任教育' ? 'st-rejected' : k === '現任教育' ? 'st-submitted' : 'st-draft')

export function TrainingSiteApproval(): JSX.Element {
  const [rows, setRows] = useState<TrainingApp[]>(() => listTraining())
  const [approver, setApprover] = useState<string>(() => siteManager().name)
  const [toast, setToast] = useState<string | null>(null)
  useEffect(() => subscribe(() => setRows(listTraining())), [])

  const pending = rows.filter((r) => r.status === '申請中')
  const seal = useMemo(() => buildSealSvg(approver, 46), [approver])
  const sig = useMemo(() => buildSignatureSvg(approver, 110, 22), [approver])

  const approve = (r: TrainingApp): void => {
    approveSiteTraining(r.id, { name: approver, title: '現場責任者', date: today })
    setToast(`${r.name} さんの申込を承認し、会社へ送信しました`)
  }
  const reject = (r: TrainingApp): void => { rejectTraining(r.id, `現場(${approver})`); setToast(`${r.name} さんの申込を却下しました`) }

  return (
    <div className="page">
      <header className="page-head">
        <h1 className="page-title">講習会 申込の承認（現場）</h1>
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
        </div>
      </section>

      <section className="card" aria-label="講習会申込一覧">
        <div className="card-h"><h2>申込一覧</h2><span className="muted">{rows.length} 件</span></div>
        <div className="card-b">
          <table className="tbl">
            <thead><tr><th>区分</th><th>講習会</th><th>対象者</th><th>状態</th><th></th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td><span className={`status ${kindCls(r.kind)}`}>{r.kind}</span></td>
                  <td>{r.seminarTitle}</td>
                  <td>{r.name}<br /><span className="muted">No.{r.staffNo}</span></td>
                  <td><span className={`status ${r.status === '会社受理' ? 'st-approved' : r.status === '却下' ? 'st-rejected' : r.status === '現場承認' ? 'st-submitted' : 'st-draft'}`}>{r.status}</span></td>
                  <td>
                    {r.status === '申請中' ? (
                      <span className="row-actions" style={{ gap: 6 }}>
                        <button type="button" className="btn-sm btn-approve" onClick={() => approve(r)}>承認して会社へ送信</button>
                        <button type="button" className="btn-sm btn-reject" onClick={() => reject(r)}>却下</button>
                      </span>
                    ) : r.status === '現場承認' ? <span className="muted">会社の受理待ち</span> : <span className="muted">—</span>}
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
