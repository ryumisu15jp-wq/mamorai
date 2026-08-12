// [Auth /s/] 施設（現場）ログイン: 会社識別コード＋施設コード＋現場PIN（共有端末・低摩擦）。
import { useState } from 'react'
import { AuthShell } from './CompanyLogin.js'
import type { Session } from './authTypes.js'
import { signInSite, AuthError } from './authService.js'

export function SiteLogin({ onLogin }: { onLogin: (s: Session) => void }): JSX.Element {
  const [companyCode, setCompanyCode] = useState('')
  const [siteCode, setSiteCode] = useState('')
  const [pin, setPin] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (): Promise<void> => {
    setErr(null); setBusy(true)
    try {
      const s = await signInSite(companyCode, siteCode, pin)
      onLogin(s)
    } catch (e) {
      setErr(e instanceof AuthError ? e.message : 'ログインに失敗しました')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell badge="施設（現場）ページ" path="/s/" title="現場端末 ログイン"
      note="共有端末向け。会社識別コード＋施設コード＋現場PINで、この現場のみを開きます。">
      <label className="field">
        <span className="field-label">会社識別コード</span>
        <input className="input" value={companyCode} onChange={(e) => setCompanyCode(e.target.value)}
          placeholder="TRA-8821" autoCapitalize="characters" />
      </label>
      <label className="field">
        <span className="field-label">施設（現場）コード</span>
        <input className="input" value={siteCode} onChange={(e) => setSiteCode(e.target.value)}
          placeholder="LALA-01" autoCapitalize="characters" />
      </label>
      <label className="field">
        <span className="field-label">現場PIN</span>
        <input className="input" type="password" inputMode="numeric" value={pin}
          onChange={(e) => setPin(e.target.value)} placeholder="4〜8桁" />
      </label>
      {err && <p className="auth-err" role="alert">{err}</p>}
      <button type="button" className="btn btn-primary auth-submit" onClick={submit} disabled={busy}>{busy ? '照合中…' : 'この現場を開く'}</button>
      <div className="auth-links">
        <span className="muted">個人の特定は日報の「対応者」欄で記録されます</span>
      </div>
    </AuthShell>
  )
}
