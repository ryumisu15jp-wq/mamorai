// [勤務員PWA] 有給申請。提出は共有ストアへ保存され、現場→会社の承認に回る。
// 承認状況（現場承認/会社承認/却下）はこの画面にも反映される。
import { useEffect, useState } from 'react'
import type { Staff } from '../staff.js'
import { COMPANY } from '../../pilot/bulgari.js'
import { submitLeave, listLeaveForStaff, subscribe, type LeaveReq } from '../../shared/leaveStore.js'

function diffDays(from: string, to: string): number {
  if (from === '' || to === '') return 1
  return Math.max(1, Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1)
}
const statusCls = (s: LeaveReq['status']): string =>
  s === '会社承認' ? 'h-ok' : s === '却下' ? 'h-off' : 'h-night'

export function LeaveApply({ staff, site }: { staff: Staff; site: string }): JSX.Element {
  const [from, setFrom] = useState('2026-09-01')
  const [to, setTo] = useState('2026-09-01')
  const [reason, setReason] = useState('')
  const [rows, setRows] = useState<LeaveReq[]>(() => listLeaveForStaff(staff.no))
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => subscribe(() => setRows(listLeaveForStaff(staff.no))), [staff.no])

  const remaining = 20 - rows.filter((r) => r.status !== '却下').reduce((s, r) => s + r.days, 0)

  const submit = (): void => {
    if (from === '' || to === '') { setToast('日付を入力してください'); return }
    submitLeave({
      staffNo: staff.no, name: staff.name, company: COMPANY.name, dept: staff.dept, site,
      from, to, days: diffDays(from, to), reason: reason || '私用の為',
    })
    setRows(listLeaveForStaff(staff.no))
    setReason('')
    setToast('有給を申請しました（現場・会社の承認待ち）')
  }

  return (
    <div className="pwa-page">
      <h1 className="pwa-title">有給申請</h1>
      <p className="pwa-lead">{site}／{staff.name}（残 {remaining} 日・デモ付与20日）</p>

      <div className="pwa-card">
        <div className="pwa-row2">
          <label className="pwa-field">開始日<input className="pwa-input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
          <label className="pwa-field">終了日<input className="pwa-input" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        </div>
        <label className="pwa-field">理由（任意・「私用の為」に続けて）
          <input className="pwa-input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="帰省の為 / 通院の為 等" />
        </label>
        <div className="pwa-summary">{diffDays(from, to)} 日間の申請</div>
        <button type="button" className="pwa-btn pwa-btn-primary pwa-btn-block" onClick={submit}>申請する</button>
      </div>

      <h2 className="pwa-h2">申請履歴</h2>
      <ul className="pwa-list">
        {rows.length === 0 && <li className="pwa-list-row"><span className="pwa-list-sub">まだ申請はありません</span></li>}
        {rows.map((r) => (
          <li key={r.id} className="pwa-list-row">
            <div>
              <div className="pwa-list-main">{r.from} 〜 {r.to}（{r.days}日）</div>
              <div className="pwa-list-sub">私用の為、{r.reason}</div>
            </div>
            <span className={`chip ${statusCls(r.status)}`}>{r.status}</span>
          </li>
        ))}
      </ul>
      {toast && <div className="pwa-toast" role="status">{toast}</div>}
    </div>
  )
}
