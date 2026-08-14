// [勤務員PWA] スマホ特化シェル。スタッフログイン→ボトムナビで4機能。
//   希望(シフト希望提出) / 有給(有給申請) / 研修(講習会申込) / 連絡(お知らせ・業務連絡)
import { useState } from 'react'
import { signInStaff, changeStaffPin, type Staff } from './staff.js'
import { ShiftHope } from './screens/ShiftHope.js'
import { LeaveApply } from './screens/LeaveApply.js'
import { TrainingApplyPwa } from './screens/TrainingApplyPwa.js'
import { Notices } from './screens/Notices.js'

type PwaTab = 'hope' | 'leave' | 'training' | 'notice'
const TABS: { key: PwaTab; label: string; icon: string }[] = [
  { key: 'hope', label: 'シフト希望', icon: '🗓️' },
  { key: 'leave', label: '有給申請', icon: '🌴' },
  { key: 'training', label: '講習会', icon: '🎓' },
  { key: 'notice', label: 'お知らせ', icon: '🔔' },
]

function StaffLogin({ onLogin }: { onLogin: (s: Staff) => void }): JSX.Element {
  const [no, setNo] = useState('')
  const [pin, setPin] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const submit = (): void => {
    const s = signInStaff(no, pin)
    if (s === null) { setErr('スタッフNoまたはPINが正しくありません'); return }
    onLogin(s)
  }
  return (
    <div className="pwa-login">
      <div className="pwa-login-card">
        <img src="/logo-full.png" alt="MAMOR-AI" className="pwa-login-logo" />
        <p className="pwa-login-sub">勤務員アプリ</p>
        <label className="pwa-field">スタッフNo
          <input className="pwa-input" inputMode="numeric" value={no} onChange={(e) => setNo(e.target.value)} placeholder="例: 783" />
        </label>
        <label className="pwa-field">PIN
          <input className="pwa-input" type="password" inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="4桁" />
        </label>
        {err && <p className="pwa-err" role="alert">{err}</p>}
        <button type="button" className="pwa-btn pwa-btn-primary" onClick={submit}>ログイン</button>
        <p className="pwa-note">初期PINは生年月日の月日（例: 783 → 0412）。初回ログイン後に変更します。</p>
      </div>
    </div>
  )
}

// 初回ログイン時のPIN変更画面（変更するまで先へ進めない）。
function PinChange({ staff, onDone }: { staff: Staff; onDone: () => void }): JSX.Element {
  const [p1, setP1] = useState('')
  const [p2, setP2] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const submit = (): void => {
    if (!/^\d{4,8}$/.test(p1)) { setErr('PINは4〜8桁の数字です'); return }
    if (p1 !== p2) { setErr('確認用PINが一致しません'); return }
    changeStaffPin(staff.no, p1)
    onDone()
  }
  return (
    <div className="pwa-login">
      <div className="pwa-login-card">
        <img src="/logo-full.png" alt="MAMOR-AI" className="pwa-login-logo" />
        <p className="pwa-login-sub">PINの変更（初回）</p>
        <p className="pwa-note" style={{ marginBottom: 12 }}>{staff.name} さん、安全のため初期PINを変更してください。</p>
        <label className="pwa-field">新しいPIN（4〜8桁）
          <input className="pwa-input" type="password" inputMode="numeric" value={p1} onChange={(e) => setP1(e.target.value)} placeholder="新しいPIN" />
        </label>
        <label className="pwa-field">新しいPIN（確認）
          <input className="pwa-input" type="password" inputMode="numeric" value={p2} onChange={(e) => setP2(e.target.value)} placeholder="もう一度入力" />
        </label>
        {err && <p className="pwa-err" role="alert">{err}</p>}
        <button type="button" className="pwa-btn pwa-btn-primary" onClick={submit}>PINを変更して続ける</button>
      </div>
    </div>
  )
}

export function WorkerApp(): JSX.Element {
  const [staff, setStaff] = useState<Staff | null>(null)
  const [tab, setTab] = useState<PwaTab>('hope')
  const [site, setSite] = useState<string>('')

  if (staff === null) return <StaffLogin onLogin={(s) => { setStaff(s); setSite(s.sites[0] ?? '') }} />
  if (staff.pinMustChange) return <PinChange staff={staff} onDone={() => setStaff({ ...staff, pinMustChange: false })} />

  return (
    <div className="pwa-shell">
      <header className="pwa-head">
        <div className="pwa-head-top">
          <img src="/logo-full.png" alt="MAMOR-AI" className="pwa-head-logo" />
          <button type="button" className="pwa-logout" onClick={() => setStaff(null)}>ログアウト</button>
        </div>
        <div className="pwa-head-staff">
          <span className="pwa-staff-name">{staff.name}</span>
          <span className="pwa-staff-no">No.{staff.no}</span>
          {staff.sites.length > 1 ? (
            <select className="pwa-site" aria-label="担当現場を切替" value={site} onChange={(e) => setSite(e.target.value)}>
              {staff.sites.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          ) : <span className="pwa-site-1">{site}</span>}
        </div>
      </header>

      <main className="pwa-main">
        {tab === 'hope' && <ShiftHope staff={staff} site={site} />}
        {tab === 'leave' && <LeaveApply staff={staff} site={site} />}
        {tab === 'training' && <TrainingApplyPwa staff={staff} />}
        {tab === 'notice' && <Notices />}
      </main>

      <nav className="pwa-nav" aria-label="メニュー">
        {TABS.map((t) => (
          <button key={t.key} type="button" className={`pwa-nav-item${tab === t.key ? ' active' : ''}`} aria-current={tab === t.key ? 'page' : undefined} onClick={() => setTab(t.key)}>
            <span className="pwa-nav-ico" aria-hidden="true">{t.icon}</span>
            <span className="pwa-nav-lbl">{t.label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}
