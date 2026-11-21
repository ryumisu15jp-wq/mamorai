// [本社PC・管理者・支店] 勤務員の個人情報の一覧。見られるのは自社（支店は担当現場）の勤務員だけ。
import { useEffect, useMemo, useState } from 'react'
import { listCompanyStaff, listPendingRequests, fetchRequestImage, decideRequest, type PendingRequest, type StaffListItem } from './staffProfileApi.js'
import { CATEGORY_LABEL, summarizeRequest } from '../../pwa/profileLogic.js'
import { StaffProfilePanel } from './StaffProfilePanel.js'

const fmt = (iso: string): string => new Date(iso).toLocaleString('ja-JP', { dateStyle: 'short', timeStyle: 'short' })

/** 承認待ちの申請。承認で反映、差し戻しは理由が必須（勤務員の画面に届く）。 */
function PendingRequests({ onChanged }: { onChanged: () => void }): JSX.Element {
  const [rows, setRows] = useState<PendingRequest[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [img, setImg] = useState<Record<string, string | null>>({})
  const [rejecting, setRejecting] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const load = (): void => { void listPendingRequests().then(setRows).catch((e: unknown) => setErr(e instanceof Error ? e.message : '読み込めませんでした')) }
  useEffect(load, [])
  const decide = (id: string, approve: boolean): void => {
    setBusy(true); setErr(null)
    void decideRequest(id, approve, note)
      .then(() => { setRejecting(null); setNote(''); load(); onChanged() })
      .catch((e: unknown) => setErr(e instanceof Error ? e.message : '処理できませんでした'))
      .finally(() => setBusy(false))
  }
  const showImg = (id: string): void => {
    void fetchRequestImage(id).then((d) => setImg((x) => ({ ...x, [id]: d ? `data:${d.mime};base64,${d.base64}` : null })))
      .catch((e: unknown) => setErr(e instanceof Error ? e.message : '読み込めませんでした'))
  }
  return (
    <section className="card" aria-label="承認待ちの申請">
      <div className="card-h"><h2>承認待ちの申請{rows ? `（${rows.length}件）` : ''}</h2></div>
      <div className="card-b">
        {err && <p className="sp-err" role="alert">{err}</p>}
        {rows !== null && rows.length === 0 && <p className="muted">承認待ちの申請はありません。</p>}
        {(rows ?? []).map((r) => (
          <div key={r.id} className="ap-box">
            <div className="ap-main">
              <strong>{r.name}</strong>（No.{r.staff_no}）　<span className="status st-submitted">{CATEGORY_LABEL[r.category]}</span>　{fmt(r.submitted_at)}
              <div>{summarizeRequest(r.category, r.payload)}</div>
              {r.current && r.category !== 'face' && r.category !== 'id_doc' && <div className="ap-diff">変更前：{summarizeRequest(r.category, r.current) || '未登録'}</div>}
              {r.has_image && (img[r.id] === undefined
                ? <button type="button" className="btn-sm" style={{ marginTop: 6 }} onClick={() => showImg(r.id)}>添付の写真を見る</button>
                : img[r.id] ? <img className="sp-cred" style={{ marginTop: 6, display: 'block' }} src={img[r.id] ?? ''} alt="添付の写真" /> : <span className="muted"> 写真がありません</span>)}
            </div>
            <div className="ap-actions">
              <button type="button" className="btn btn-primary" disabled={busy} onClick={() => decide(r.id, true)}>承認する</button>
              <button type="button" className="btn-sm btn-reject" disabled={busy} onClick={() => { setRejecting(rejecting === r.id ? null : r.id); setNote('') }}>差し戻す</button>
            </div>
            {rejecting === r.id && (
              <div className="ap-reject">
                <input className="input" style={{ flex: 1, minWidth: 220 }} placeholder="差し戻しの理由（必須。勤務員の画面に表示されます）" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} aria-label="差し戻しの理由" />
                <button type="button" className="btn-sm btn-reject" disabled={busy || note.trim() === ''} onClick={() => decide(r.id, false)}>差し戻しを確定</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}

export function StaffProfiles({ isAdmin }: { isAdmin: boolean }): JSX.Element {
  const [rows, setRows] = useState<StaffListItem[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<StaffListItem | null>(null)
  const loadStaff = (): void => { void listCompanyStaff().then(setRows).catch((e: unknown) => setErr(e instanceof Error ? e.message : '読み込めませんでした')) }
  useEffect(loadStaff, [])
  const shown = useMemo(() => (rows ?? []).filter((r) => q.trim() === '' || r.name.includes(q.trim()) || r.staff_no.includes(q.trim()) || r.sites.some((s) => s.includes(q.trim()))), [rows, q])

  return (
    <div>
      <div className="qdr-head"><h1 className="qdr-title">勤務員の個人情報</h1></div>
      <p className="muted" style={{ marginBottom: 12 }}>勤務員がスマホから申請した内容を承認します（氏名・現住所・本籍・顔写真・本人確認資料・資格）。電話・メール・緊急連絡先・経歴は申請なしで反映されます。開くと見たことが記録されます。</p>
      {err && <p className="sp-err" role="alert">{err}</p>}
      <PendingRequests onChanged={loadStaff} />
      <section className="card" aria-label="勤務員の一覧">
        <div className="card-h"><h2>勤務員一覧</h2>
          <input className="input" style={{ maxWidth: 260 }} placeholder="氏名・No・現場で絞り込み" value={q} onChange={(e) => setQ(e.target.value)} aria-label="絞り込み" />
        </div>
        <div className="card-b" style={{ padding: 0 }}>
          <table className="tbl">
            <thead><tr><th>No.</th><th>氏名</th><th>現場</th><th>基本情報</th><th>顔写真</th><th>資格・教育・健診</th><th></th></tr></thead>
            <tbody>
              {rows === null && err === null && <tr><td colSpan={7} className="muted">読み込み中…</td></tr>}
              {shown.map((r) => (
                <tr key={r.staff_no} style={{ opacity: r.is_active ? 1 : 0.5 }}>
                  <td>{r.staff_no}</td><td>{r.name}</td><td>{r.sites.join('、') || '—'}</td>
                  <td>{r.has_profile ? '登録済み' : <span className="muted">未登録</span>}</td>
                  <td>{r.has_face ? '登録済み' : <span className="muted">未登録</span>}</td>
                  <td>
                    {r.credential_count}件
                    {r.expired_count > 0 && <span className="status st-reject" style={{ marginLeft: 6 }}>期限切れ {r.expired_count}</span>}
                    {r.soon_count > 0 && <span className="status st-warn" style={{ marginLeft: 6 }}>更新間近 {r.soon_count}</span>}
                    {(r.pending_count ?? 0) > 0 && <span className="status st-submitted" style={{ marginLeft: 6 }}>承認待ち {r.pending_count}</span>}
                  </td>
                  <td><button type="button" className="btn-sm" onClick={() => setOpen(r)}>開く</button></td>
                </tr>
              ))}
              {rows !== null && shown.length === 0 && <tr><td colSpan={7} className="muted">該当する勤務員がいません。</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
      {open && <StaffProfilePanel realm="company" staffNo={open.staff_no} staffName={open.name} isAdmin={isAdmin} onClose={() => setOpen(null)} />}
    </div>
  )
}
