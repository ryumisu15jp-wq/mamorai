// [Auth /tradmin/] 運営（TRYANGROW）ログイン: メール＋パスワード＋MFA必須。顧客認証とは別レルム。
import { useState } from 'react'
import { AuthShell } from './CompanyLogin.js'
import type { Session } from './authTypes.js'
import { signInTradmin, AuthError } from './authService.js'

export function TradminLogin({ onLogin }: { onLogin: (s: Session) => void }): JSX.Element {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mfa, setMfa] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (): Promise<void> => {
    setErr(null); setBusy(true)
    try {
      const s = await signInTradmin(email, password, mfa)
      onLogin(s)
    } catch (e) {
      setErr(e instanceof AuthError ? e.message : 'ログインに失敗しました')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell badge="運営（TRYANGROW）" path="/tradmin/" title="運営管理 ログイン"
      note="プラットフォーム全体。MFA必須・顧客認証とは別レルムで分離。将来は社内SSOへ移行。">
      <label className="field">
        <span className="field-label">メールアドレス（運営）</span>
        <input className="input" type="email" autoComplete="username" value={email}
          onChange={(e) => setEmail(e.target.value)} placeholder="ops@tryangrow.com" />
      </label>
      <label className="field">
        <span className="field-label">パスワード</span>
        <input className="input" type="password" autoComplete="current-password" value={password}
          onChange={(e) => setPassword(e.target.value)} placeholder="12文字以上" />
      </label>
      <label className="field">
        <span className="field-label">MFAコード（6桁・必須）</span>
        <input className="input" inputMode="numeric" value={mfa}
          onChange={(e) => setMfa(e.target.value)} placeholder="123456" />
      </label>
      {err && <p className="auth-err" role="alert">{err}</p>}
      <button type="button" className="btn btn-primary auth-submit" onClick={submit} disabled={busy}>{busy ? 'ログイン中…' : '運営としてログイン'}</button>
      <div className="auth-links">
        <span className="muted">roadmap: 従業員管理は社内SSO（Google Workspace / SAML）で一元化</span>
      </div>
    </AuthShell>
  )
}
