// [勤務員アプリ・設定] プロフィール（警備員名簿に必要な情報）・PIN変更・ログアウト。
//   承認が要る項目（氏名・現住所・本籍・顔写真・本人確認資料・資格）: 申請 → 本社PC・管理者が承認して反映（差し戻しは理由が届く）
//   承認が要らない項目（電話・メール・緊急連絡先・学歴・業務経歴）: 保存するとすぐ反映
// 見られるのは本人・本社PC・管理者・配置されている現場の担当者（本人確認資料は本社・管理者だけ）。本人以外が見ると記録が残る。マイナンバーは預かりません。
import { useEffect, useRef, useState } from 'react'
import { changeStaffPin, type Staff } from '../staff.js'
import {
  loadProfile, saveContact, saveCareer, submitRequest, withdrawRequest, loadImage, fileToJpeg,
  type Profile, type Credential, type ProfileRequest,
} from '../profileApi.js'
import {
  CATEGORY_LABEL, CREDENTIAL_KINDS, DOC_TYPES, PREFECTURES, STATUS_LABEL, checkEducation, checkNewPin, checkWork, docLabel, expiryStatus, kindLabel, summarizeRequest,
  type CredentialKind, type DocType, type RequestCategory,
} from '../profileLogic.js'

const today = (): string => new Date().toLocaleDateString('sv-SE')
const msg = (e: unknown, fallback: string): string => (e instanceof Error ? e.message : fallback)

function ImageThumb({ kind, id, version, alt }: { kind: 'face' | 'credential'; id: string | null; version: number; alt: string }): JSX.Element {
  const [src, setSrc] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    void loadImage(kind, id).then((d) => { if (live) setSrc(d ? `data:${d.mime};base64,${d.base64}` : null) }).catch(() => { if (live) setSrc(null) })
    return () => { live = false }
  }, [kind, id, version])
  return src ? <img className="set-thumb" src={src} alt={alt} /> : <div className="set-thumb set-thumb-empty" aria-hidden="true">未登録</div>
}

/** 写真を撮る・選ぶボタン（カメラ優先）。 */
function PhotoPick({ label, onPick }: { label: string; onPick: (f: File) => void }): JSX.Element {
  const ref = useRef<HTMLInputElement>(null)
  return (<>
    <input ref={ref} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onPick(f); e.target.value = '' }} />
    <button type="button" className="pwa-btn pwa-btn-sm" onClick={() => ref.current?.click()}>{label}</button>
  </>)
}

/** 項目ごとの申請の状態（承認待ち／差し戻し＋理由）。 */
function ReqBadge({ reqs, category, doc }: { reqs: ProfileRequest[]; category: RequestCategory; doc?: DocType }): JSX.Element | null {
  const r = reqs.find((x) => x.category === category && (doc === undefined || x.payload['doc_type'] === doc))
  if (!r) return null
  return r.status === 'pending'
    ? <span className="chip h-night">承認待ち</span>
    : <span className="chip h-off" title={r.note ?? ''}>差し戻し{r.note ? `：${r.note}` : ''}</span>
}

type CredForm = { id: string | null; kind: CredentialKind; label: string; obtainedOn: string; expiresOn: string; photo: File | null }

export function Settings({ staff, onBack, onLogout }: { staff: Staff; onBack: () => void; onLogout: () => void }): JSX.Element {
  const [p, setP] = useState<Profile | null>(null)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)
  const [imgVer, setImgVer] = useState(0)
  const [open, setOpen] = useState<'name' | 'address' | 'honseki' | 'cred' | 'pin' | null>(null)
  const [nameF, setNameF] = useState({ name: '', furigana: '' })
  const [addrF, setAddrF] = useState({ postal: '', address: '', station: '' })
  const [pref, setPref] = useState('')
  const [docType, setDocType] = useState<DocType>('license')
  const [contact, setContact] = useState({ phone: '', email: '', emergencyName: '', emergencyRelation: '', emergencyPhone: '' })
  const [edu, setEdu] = useState<{ school: string; entered: string; graduated: string }[]>([])
  const [work, setWork] = useState<{ company: string; detail: string; from: string; to: string }[]>([])
  const [cred, setCred] = useState<CredForm | null>(null)
  const [pin, setPin] = useState({ old: '', p1: '', p2: '' })

  const reload = (): Promise<void> => loadProfile().then((r) => {
    setP(r); setLoadErr(null)
    setNameF({ name: r.name, furigana: r.furigana ?? '' })
    setAddrF({ postal: r.postal_code ?? '', address: r.address ?? '', station: r.nearest_station ?? '' })
    setPref(r.honseki_pref ?? '')
    setContact({ phone: r.phone ?? '', email: r.email ?? '', emergencyName: r.emergency.name ?? '', emergencyRelation: r.emergency.relation ?? '', emergencyPhone: r.emergency.phone ?? '' })
    setEdu(r.education.map((e) => ({ school: e.school, entered: e.entered_year?.toString() ?? '', graduated: e.graduated_year?.toString() ?? '' })))
    setWork(r.work_history.map((w) => ({ company: w.company, detail: w.detail ?? '', from: w.from ?? '', to: w.to ?? '' })))
  }).catch((e: unknown) => setLoadErr(msg(e, '読み込めませんでした')))
  useEffect(() => { void reload() }, [])

  const run = async (okText: string, fn: () => Promise<void>): Promise<void> => {
    setNotice(null)
    try { await fn(); setNotice({ ok: true, text: okText }) } catch (e) { setNotice({ ok: false, text: msg(e, '保存できませんでした') }) }
  }
  const apply = (okText: string, category: RequestCategory, payload: Record<string, unknown>, photo?: File): void => {
    void run(okText, async () => {
      await submitRequest(category, payload, photo ? await fileToJpeg(photo, category === 'face' ? 1024 : 1400) : undefined)
      setOpen(null); setCred(null); await reload(); setImgVer((v) => v + 1)
    })
  }
  const reqs = p?.requests ?? []
  const pendingCount = reqs.filter((r) => r.status === 'pending').length

  return (
    <div className="pwa-page set-page">
      <button type="button" className="set-back" onClick={onBack}>← 戻る</button>
      <h1 className="pwa-title">設定</h1>
      <p className="pwa-lead">{staff.name}（No.{staff.no}）</p>
      <p className="set-privacy">登録した情報は、警備員名簿・教育記録など、業務に必要な管理のために使います。見られるのは、あなた・本社・管理者・配置されている現場の担当者だけです（本人確認資料は本社・管理者だけ）。本人以外が見ると記録が残ります。マイナンバー（個人番号）とマイナンバーカードは登録しません。</p>
      <p className="set-privacy set-legend"><span className="chip h-night">申請</span> のある項目は、本社・管理者が確認して承認すると反映されます。それ以外は、保存するとすぐ反映されます。</p>

      {loadErr && <p className="pwa-err" role="alert">{loadErr}</p>}
      {notice && <p className={notice.ok ? 'set-ok' : 'pwa-err'} role="status">{notice.text}</p>}

      {p && (<>
        {reqs.length > 0 && (
          <section className="pwa-card" aria-label="申請の状況">
            <h2 className="set-h">申請の状況{pendingCount > 0 ? `（承認待ち ${pendingCount}件）` : ''}</h2>
            <ul className="set-req-list">
              {reqs.map((r) => (
                <li key={r.id} className="set-req">
                  <div><strong>{CATEGORY_LABEL[r.category]}</strong>　{summarizeRequest(r.category, r.payload)}</div>
                  <div className="set-cred-sub">
                    <span className={r.status === 'pending' ? 'chip h-night' : 'chip h-off'}>{STATUS_LABEL[r.status]}</span>
                    {r.status === 'rejected' && r.note && <span>理由：{r.note}</span>}
                    {r.status === 'pending' && <button type="button" className="pwa-btn pwa-btn-sm pwa-btn-line" onClick={() => void run('取り下げました', () => withdrawRequest(r.id).then(reload))}>取り下げる</button>}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="pwa-card">
          <h2 className="set-h">基本情報</h2>
          <dl className="set-fixed">
            <dt>氏名</dt><dd>{p.name}　<ReqBadge reqs={reqs} category="name" /></dd>
            <dt>ふりがな</dt><dd>{p.furigana ?? '未登録'}</dd>
            <dt>生年月日</dt><dd>{p.dob ?? '未登録（本社に確認してください）'}</dd>
            <dt>本籍</dt><dd>{p.honseki_pref ?? '未登録'}　<ReqBadge reqs={reqs} category="honseki" /></dd>
          </dl>
          {open !== 'name' ? <button type="button" className="pwa-btn pwa-btn-sm" onClick={() => setOpen('name')}>氏名・ふりがなを申請</button> : (
            <div className="set-edit">
              <label className="pwa-field">氏名<input className="pwa-input" value={nameF.name} onChange={(e) => setNameF({ ...nameF, name: e.target.value })} /></label>
              <label className="pwa-field">ふりがな<input className="pwa-input" value={nameF.furigana} onChange={(e) => setNameF({ ...nameF, furigana: e.target.value })} /></label>
              <div className="set-edit-actions">
                <button type="button" className="pwa-btn pwa-btn-primary" onClick={() => apply('氏名を申請しました（承認待ち）', 'name', { name: nameF.name, furigana: nameF.furigana })}>申請する</button>
                <button type="button" className="pwa-btn" onClick={() => setOpen(null)}>やめる</button>
              </div>
            </div>
          )}
          {open !== 'honseki' ? <button type="button" className="pwa-btn pwa-btn-sm" style={{ marginLeft: 8 }} onClick={() => setOpen('honseki')}>本籍を申請</button> : (
            <div className="set-edit">
              <label className="pwa-field">本籍（都道府県）
                <select className="pwa-input" value={pref} onChange={(e) => setPref(e.target.value)}>
                  <option value="">選んでください</option>
                  {PREFECTURES.map((x) => <option key={x} value={x}>{x}</option>)}
                </select>
              </label>
              <div className="set-edit-actions">
                <button type="button" className="pwa-btn pwa-btn-primary" onClick={() => apply('本籍を申請しました（承認待ち）', 'honseki', { pref })}>申請する</button>
                <button type="button" className="pwa-btn" onClick={() => setOpen(null)}>やめる</button>
              </div>
            </div>
          )}
        </section>

        <section className="pwa-card">
          <h2 className="set-h">顔写真・本人確認資料</h2>
          <div className="set-face">
            <ImageThumb kind="face" id={null} version={imgVer} alt="顔写真" />
            <div>
              <p className="set-cred-sub"><ReqBadge reqs={reqs} category="face" />{!reqs.some((r) => r.category === 'face') && (p.has_face ? <span>登録済み</span> : <span>未登録</span>)}</p>
              <PhotoPick label={p.has_face ? '顔写真を撮り直して申請' : '顔写真を撮って申請'} onPick={(f) => apply('顔写真を申請しました（承認待ち）', 'face', {}, f)} />
              <p className="pwa-note" style={{ textAlign: 'left' }}>正面・無帽・背景は無地がめやすです。</p>
            </div>
          </div>
          <h3 className="set-h2">本人確認資料</h3>
          <ul className="set-cred-list">
            {DOC_TYPES.map((d) => (
              <li key={d.key} className="set-doc">
                <span>{d.label}</span>
                <span className="set-cred-sub"><ReqBadge reqs={reqs} category="id_doc" doc={d.key} />{p.id_docs.includes(d.key) && <span className="chip h-ok">登録済み</span>}</span>
              </li>
            ))}
          </ul>
          <label className="pwa-field">種類
            <select className="pwa-input" value={docType} onChange={(e) => setDocType(e.target.value as DocType)}>
              {DOC_TYPES.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
            </select>
          </label>
          <PhotoPick label={`${docLabel(docType)}を撮って申請`} onPick={(f) => apply('本人確認資料を申請しました（承認待ち）', 'id_doc', { doc_type: docType }, f)} />
          <p className="pwa-note" style={{ textAlign: 'left' }}>マイナンバーカードは使えません（個人番号は預かりません）。</p>
        </section>

        <section className="pwa-card">
          <h2 className="set-h">住所</h2>
          <dl className="set-fixed">
            <dt>現住所</dt><dd>{p.address ? `${p.postal_code ?? ''} ${p.address}` : '未登録'}　<ReqBadge reqs={reqs} category="address" /></dd>
            <dt>最寄駅</dt><dd>{p.nearest_station ?? '未登録'}</dd>
          </dl>
          {open !== 'address' ? <button type="button" className="pwa-btn pwa-btn-sm" onClick={() => setOpen('address')}>住所を申請</button> : (
            <div className="set-edit">
              <label className="pwa-field">郵便番号<input className="pwa-input" inputMode="numeric" value={addrF.postal} onChange={(e) => setAddrF({ ...addrF, postal: e.target.value })} placeholder="100-0001" /></label>
              <label className="pwa-field">現住所<input className="pwa-input" value={addrF.address} onChange={(e) => setAddrF({ ...addrF, address: e.target.value })} /></label>
              <label className="pwa-field">最寄駅<input className="pwa-input" value={addrF.station} onChange={(e) => setAddrF({ ...addrF, station: e.target.value })} /></label>
              <div className="set-edit-actions">
                <button type="button" className="pwa-btn pwa-btn-primary" onClick={() => apply('住所を申請しました（承認待ち）', 'address', { postal_code: addrF.postal, address: addrF.address, nearest_station: addrF.station })}>申請する</button>
                <button type="button" className="pwa-btn" onClick={() => setOpen(null)}>やめる</button>
              </div>
            </div>
          )}
        </section>

        <section className="pwa-card">
          <h2 className="set-h">連絡先・緊急連絡先</h2>
          <label className="pwa-field">電話番号<input className="pwa-input" inputMode="tel" value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} placeholder="09012345678" /></label>
          <label className="pwa-field">メールアドレス<input className="pwa-input" type="email" inputMode="email" value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} /></label>
          <h3 className="set-h2">緊急連絡先</h3>
          <label className="pwa-field">氏名<input className="pwa-input" value={contact.emergencyName} onChange={(e) => setContact({ ...contact, emergencyName: e.target.value })} /></label>
          <label className="pwa-field">続柄<input className="pwa-input" value={contact.emergencyRelation} onChange={(e) => setContact({ ...contact, emergencyRelation: e.target.value })} placeholder="例: 配偶者" /></label>
          <label className="pwa-field">電話番号<input className="pwa-input" inputMode="tel" value={contact.emergencyPhone} onChange={(e) => setContact({ ...contact, emergencyPhone: e.target.value })} /></label>
          <button type="button" className="pwa-btn pwa-btn-primary pwa-btn-block" onClick={() => void run('連絡先を保存しました', () => saveContact(contact).then(reload))}>保存する</button>
        </section>

        <section className="pwa-card">
          <h2 className="set-h">学歴・業務経歴</h2>
          <h3 className="set-h2">学歴</h3>
          {edu.map((e, i) => (
            <div key={i} className="set-row">
              <input className="pwa-input" aria-label="学校名" placeholder="学校名" value={e.school} onChange={(ev) => setEdu(edu.map((x, j) => (j === i ? { ...x, school: ev.target.value } : x)))} />
              <input className="pwa-input set-year" aria-label="入学年" inputMode="numeric" placeholder="入学年" value={e.entered} onChange={(ev) => setEdu(edu.map((x, j) => (j === i ? { ...x, entered: ev.target.value } : x)))} />
              <input className="pwa-input set-year" aria-label="卒業年" inputMode="numeric" placeholder="卒業年" value={e.graduated} onChange={(ev) => setEdu(edu.map((x, j) => (j === i ? { ...x, graduated: ev.target.value } : x)))} />
              <button type="button" className="pwa-btn pwa-btn-sm pwa-btn-line" onClick={() => setEdu(edu.filter((_, j) => j !== i))}>削除</button>
            </div>
          ))}
          <button type="button" className="pwa-btn pwa-btn-sm" onClick={() => setEdu([...edu, { school: '', entered: '', graduated: '' }])}>＋ 学歴を追加</button>
          <h3 className="set-h2">業務経歴</h3>
          {work.map((w, i) => (
            <div key={i} className="set-row set-row-col">
              <input className="pwa-input" aria-label="勤務先・業種" placeholder="勤務先・業種" value={w.company} onChange={(ev) => setWork(work.map((x, j) => (j === i ? { ...x, company: ev.target.value } : x)))} />
              <input className="pwa-input" aria-label="仕事内容" placeholder="仕事内容" value={w.detail} onChange={(ev) => setWork(work.map((x, j) => (j === i ? { ...x, detail: ev.target.value } : x)))} />
              <div className="set-row">
                <input className="pwa-input set-year" aria-label="開始" placeholder="2020-04" value={w.from} onChange={(ev) => setWork(work.map((x, j) => (j === i ? { ...x, from: ev.target.value } : x)))} />
                <span>〜</span>
                <input className="pwa-input set-year" aria-label="終了" placeholder="2023-03" value={w.to} onChange={(ev) => setWork(work.map((x, j) => (j === i ? { ...x, to: ev.target.value } : x)))} />
                <button type="button" className="pwa-btn pwa-btn-sm pwa-btn-line" onClick={() => setWork(work.filter((_, j) => j !== i))}>削除</button>
              </div>
            </div>
          ))}
          <button type="button" className="pwa-btn pwa-btn-sm" onClick={() => setWork([...work, { company: '', detail: '', from: '', to: '' }])}>＋ 業務経歴を追加</button>
          <button type="button" className="pwa-btn pwa-btn-primary pwa-btn-block" style={{ marginTop: 12 }} onClick={() => {
            const bad = checkEducation(edu) ?? checkWork(work)
            if (bad) { setNotice({ ok: false, text: bad }); return }
            void run('経歴を保存しました', () => saveCareer(
              edu.map((e) => ({ school: e.school.trim(), entered_year: e.entered.trim() ? Number(e.entered) : null, graduated_year: e.graduated.trim() ? Number(e.graduated) : null })),
              work.map((w) => ({ company: w.company.trim(), detail: w.detail.trim() || null, from: w.from.trim() || null, to: w.to.trim() || null })),
            ).then(reload))
          }}>経歴を保存する</button>
        </section>

        <section className="pwa-card">
          <h2 className="set-h">資格・教育・健康診断</h2>
          {p.credentials.length === 0 && <p className="pwa-note" style={{ textAlign: 'left' }}>まだ登録がありません。</p>}
          <ul className="set-cred-list">
            {p.credentials.map((c: Credential) => {
              const st = expiryStatus(c.expires_on, today())
              const pend = reqs.find((r) => r.category === 'credential' && r.payload['id'] === c.id)
              return (
                <li key={c.id} className="set-cred">
                  <div className="set-cred-main">
                    <strong>{kindLabel(c.kind)}</strong>{c.label ? `　${c.label}` : ''}
                    <div className="set-cred-sub">
                      {c.obtained_on ? `取得 ${c.obtained_on}` : '取得日 未入力'}　{c.expires_on ? `期限 ${c.expires_on}` : '期限なし'}
                      {st === '期限切れ' && <span className="chip h-off">期限切れ</span>}
                      {st === '更新間近' && <span className="chip h-night">更新間近</span>}
                      {pend && <span className="chip h-night">{pend.payload['action'] === 'delete' ? '削除を申請中' : '変更を申請中'}</span>}
                    </div>
                  </div>
                  <ImageThumb kind="credential" id={c.has_image ? c.id : null} version={imgVer} alt={`${kindLabel(c.kind)}の証書`} />
                  <div className="set-cred-actions">
                    <button type="button" className="pwa-btn pwa-btn-sm" onClick={() => { setOpen('cred'); setCred({ id: c.id, kind: c.kind, label: c.label ?? '', obtainedOn: c.obtained_on ?? '', expiresOn: c.expires_on ?? '', photo: null }) }}>変更を申請</button>
                    <button type="button" className="pwa-btn pwa-btn-sm pwa-btn-line" onClick={() => { if (globalThis.confirm('この記録の削除を申請しますか？')) apply('削除を申請しました（承認待ち）', 'credential', { action: 'delete', id: c.id }) }}>削除を申請</button>
                  </div>
                </li>
              )
            })}
          </ul>
          {reqs.filter((r) => r.category === 'credential' && !r.payload['id'] && r.status === 'pending').map((r) => (
            <p key={r.id} className="set-cred-sub"><span className="chip h-night">追加を申請中</span>{summarizeRequest('credential', r.payload)}</p>
          ))}
          {cred === null
            ? <button type="button" className="pwa-btn pwa-btn-block" onClick={() => { setOpen('cred'); setCred({ id: null, kind: 'shinnin', label: '', obtainedOn: '', expiresOn: '', photo: null }) }}>＋ 記録の追加を申請</button>
            : (
              <div className="set-edit">
                <label className="pwa-field">種類
                  <select className="pwa-input" value={cred.kind} onChange={(e) => setCred({ ...cred, kind: e.target.value as CredentialKind })}>
                    {CREDENTIAL_KINDS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
                  </select>
                </label>
                <label className="pwa-field">名称・メモ（例: 2号 交通誘導）<input className="pwa-input" value={cred.label} onChange={(e) => setCred({ ...cred, label: e.target.value })} /></label>
                <label className="pwa-field">取得日・受診日<input className="pwa-input" type="date" value={cred.obtainedOn} onChange={(e) => setCred({ ...cred, obtainedOn: e.target.value })} /></label>
                <label className="pwa-field">有効期限（ないものは空欄）<input className="pwa-input" type="date" value={cred.expiresOn} onChange={(e) => setCred({ ...cred, expiresOn: e.target.value })} /></label>
                <div className="set-photo-actions">
                  <PhotoPick label={cred.photo ? '証書の写真を選び直す' : '証書の写真を添える（任意）'} onPick={(f) => setCred({ ...cred, photo: f })} />
                  {cred.photo && <span className="set-cred-sub">写真を添付しました</span>}
                </div>
                <div className="set-edit-actions" style={{ marginTop: 10 }}>
                  <button type="button" className="pwa-btn pwa-btn-primary" onClick={() => apply('申請しました（承認待ち）', 'credential', { action: 'upsert', id: cred.id, kind: cred.kind, label: cred.label, obtained_on: cred.obtainedOn, expires_on: cred.expiresOn }, cred.photo ?? undefined)}>申請する</button>
                  <button type="button" className="pwa-btn" onClick={() => { setCred(null); setOpen(null) }}>やめる</button>
                </div>
              </div>
            )}
        </section>
      </>)}

      <section className="pwa-card">
        <h2 className="set-h">アカウント</h2>
        {open !== 'pin'
          ? <button type="button" className="pwa-btn pwa-btn-block" onClick={() => { setPin({ old: '', p1: '', p2: '' }); setOpen('pin') }}>PIN（パスワード）を変更する</button>
          : (
            <div className="set-edit" style={{ borderTop: 'none', paddingTop: 0 }}>
              <label className="pwa-field">現在のPIN<input className="pwa-input" type="password" inputMode="numeric" autoComplete="current-password" value={pin.old} onChange={(e) => setPin({ ...pin, old: e.target.value })} /></label>
              <label className="pwa-field">新しいPIN（4〜8桁）<input className="pwa-input" type="password" inputMode="numeric" autoComplete="new-password" value={pin.p1} onChange={(e) => setPin({ ...pin, p1: e.target.value })} /></label>
              <label className="pwa-field">新しいPIN（確認）<input className="pwa-input" type="password" inputMode="numeric" autoComplete="new-password" value={pin.p2} onChange={(e) => setPin({ ...pin, p2: e.target.value })} /></label>
              <div className="set-edit-actions">
                <button type="button" className="pwa-btn pwa-btn-primary" onClick={() => {
                  const bad = checkNewPin(pin.old, pin.p1, pin.p2)
                  if (bad) { setNotice({ ok: false, text: bad }); return }
                  void run('PINを変更しました', async () => { await changeStaffPin(staff.no, pin.old, pin.p1); setPin({ old: '', p1: '', p2: '' }); setOpen(null) })
                }}>変更する</button>
                <button type="button" className="pwa-btn" onClick={() => setOpen(null)}>やめる</button>
              </div>
            </div>
          )}
        <button type="button" className="pwa-btn pwa-btn-block pwa-btn-line" style={{ marginTop: 10 }} onClick={onLogout}>ログアウト</button>
      </section>
    </div>
  )
}
