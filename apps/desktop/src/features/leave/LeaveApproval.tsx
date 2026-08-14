// [会社] 有給申請の最終承認。現場が一次承認した申請(現場承認)を会社担当者が最終承認する。
// 承認時、会社担当者の印・署名が自動付与され、有給休暇申請書(A5・様式準拠)PDFを出力する。
import { useEffect, useMemo, useState } from 'react'
import { COMPANY_APPROVERS } from '../../pilot/bulgari.js'
import { buildSealSvg, buildSignatureSvg } from '../../lib/sealSignature.js'
import { printLeaveForm, type LeaveForm } from './leaveForm.js'
import { listForCompany, approveCompany, rejectAtCompany, subscribe, type LeaveReq } from './leaveApi.js'

const today = '2026-09-16'

export function LeaveApproval(): JSX.Element {
  const [rows, setRows] = useState<LeaveReq[]>([])
  const [approverName, setApproverName] = useState<string>(() => COMPANY_APPROVERS[0]!.name)
  const [toast, setToast] = useState<string | null>(null)
  const load = (): void => { void listForCompany().then(setRows) }
  useEffect(() => { load(); return subscribe(load) }, [])

  const approver = COMPANY_APPROVERS.find((a) => a.name === approverName) ?? COMPANY_APPROVERS[0]!
  const seal = useMemo(() => buildSealSvg(approver.name, 46), [approver])
  const sig = useMemo(() => buildSignatureSvg(approver.name, 110, 22), [approver])

  const pending = rows.filter((r) => r.status === '現場承認')

  const toForm = (r: LeaveReq): LeaveForm => ({
    filedDate: r.submittedAt, company: r.company, dept: r.dept, site: r.site, staffNo: r.staffNo,
    name: r.name, fromDate: r.from, toDate: r.to, days: r.days, reason: r.reason,
    siteApprover: r.siteApprover, companyApprover: r.companyApprover,
  })

  const approveAndOutput = (r: LeaveReq): void => {
    const ca = { name: approver.name, title: approver.title, date: today }
    void approveCompany(r.id, ca)
      .then(() => {
        load()
        if (!printLeaveForm(toForm({ ...r, status: '会社承認', companyApprover: ca }))) setToast('ポップアップがブロックされました。許可してください。')
        else setToast(`${r.name} さんの申請を承認し、有給休暇申請書(A5)を出力しました`)
      })
      .catch((e: unknown) => setToast(e instanceof Error ? e.message : '承認に失敗しました'))
  }
  const reOutput = (r: LeaveReq): void => { printLeaveForm(toForm(r)) }
  const reject = (r: LeaveReq): void => { void rejectAtCompany(r.id, `会社(${approver.title} ${approver.name})`).then(() => { load(); setToast(`${r.name} さんの申請を却下しました`) }) }

  return (
    <div className="page">
      <header className="page-head">
        <h1 className="page-title">有給申請の確認（会社）</h1>
        <span className="muted">未処理 {pending.length} 件</span>
      </header>

      <section className="card" aria-label="承認担当者">
        <div className="card-h"><h2>承認担当者（会社）</h2><span className="muted">承認時に印・署名を自動付与</span></div>
        <div className="card-b">
          <div className="filters" style={{ alignItems: 'center' }}>
            <label className="fl">担当者
              <select className="input" value={approverName} onChange={(e) => setApproverName(e.target.value)}>
                {COMPANY_APPROVERS.map((a) => <option key={a.name} value={a.name}>{a.title}　{a.name}</option>)}
              </select>
            </label>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
              <span dangerouslySetInnerHTML={{ __html: seal }} />
              <span dangerouslySetInnerHTML={{ __html: sig }} />
            </span>
          </div>
        </div>
      </section>

      <section className="card" aria-label="有給申請一覧">
        <div className="card-h"><h2>申請一覧</h2><span className="muted">{rows.length} 件</span></div>
        <div className="card-b">
          <table className="tbl">
            <thead><tr><th>現場</th><th>対象者</th><th>期間</th><th>日数</th><th>理由</th><th>現場承認</th><th>状態</th><th></th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.site}</td>
                  <td>{r.name}<br /><span className="muted">No.{r.staffNo}</span></td>
                  <td>{r.from} 〜 {r.to}</td><td>{r.days}日</td><td>私用の為、{r.reason}</td>
                  <td>{r.siteApprover ? <span className="muted">{r.siteApprover.name}<br />{r.siteApprover.date}</span> : <span className="muted">—</span>}</td>
                  <td><span className={`status ${r.status === '会社承認' ? 'st-approved' : r.status === '却下' ? 'st-rejected' : r.status === '現場承認' ? 'st-submitted' : 'st-draft'}`}>{r.status}</span></td>
                  <td>
                    {r.status === '現場承認' ? (
                      <span className="row-actions" style={{ gap: 6 }}>
                        <button type="button" className="btn-sm btn-approve" onClick={() => approveAndOutput(r)}>承認してPDF出力</button>
                        <button type="button" className="btn-sm btn-reject" onClick={() => reject(r)}>却下</button>
                      </span>
                    ) : r.status === '会社承認' ? (
                      <button type="button" className="btn-sm" onClick={() => reOutput(r)}>申請書PDF</button>
                    ) : r.status === '申請中' ? <span className="muted">現場の承認待ち</span>
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
