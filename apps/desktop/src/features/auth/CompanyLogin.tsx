// [Auth /co/] 会社（本社・権限者）ログイン: メール＋パスワード（＋任意MFA）。
import { useState } from 'react'
import type { Session } from './authTypes.js'
import { signInCompany, AuthError } from './authService.js'

export function CompanyLogin({ onLogin }: { onLogin: (s: Session) => void }): JSX.Element {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mfa, setMfa] = useState('')
  const [useMfa, setUseMfa] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (): Promise<void> => {
    setErr(null); setBusy(true)
    try {
      const s = await signInCompany(email, password)
      onLogin(s)
    } catch (e) {
      setErr(e instanceof AuthError ? e.message : 'ログインに失敗しました')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell badge="会社ページ" path="/co/" title="本社・権限者 ログイン"
      note="自社の全現場を横断管理（集計・配置・AIシフト・通知・教育）。">
      <label className="field">
        <span className="field-label">メールアドレス</span>
        <input className="input" type="email" autoComplete="username" value={email}
          onChange={(e) => setEmail(e.target.value)} placeholder="admin@company.co.jp" />
      </label>
      <label className="field">
        <span className="field-label">パスワード</span>
        <input className="input" type="password" autoComplete="current-password" value={password}
          onChange={(e) => setPassword(e.target.value)} placeholder="8文字以上" />
      </label>
      <label className="auth-check">
        <input type="checkbox" checked={useMfa} onChange={(e) => setUseMfa(e.target.checked)} />
        二段階認証（MFA/TOTP）を使う
      </label>
      {useMfa && (
        <label className="field">
          <span className="field-label">MFAコード（6桁）</span>
          <input className="input" inputMode="numeric" value={mfa}
            onChange={(e) => setMfa(e.target.value)} placeholder="123456" />
        </label>
      )}
      {err && <p className="auth-err" role="alert">{err}</p>}
      <button type="button" className="btn btn-primary auth-submit" onClick={submit} disabled={busy}>{busy ? 'ログイン中…' : 'ログイン'}</button>
      <div className="auth-links">
        <a href="#reset">パスワードを忘れた</a>
        <span className="muted">アカウントは管理者からの招待制です</span>
      </div>
    </AuthShell>
  )
}

// 共通の中央寄せ認証シェル（3画面で共有）
export function AuthShell(props: {
  badge: string; path: string; title: string; note?: string; children: React.ReactNode
}): JSX.Element {
  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">
          <span className="app-logo">MAMOR-AI</span>
          <span className="auth-badge">{props.badge}</span>
        </div>
        <h1 className="auth-title">{props.title}</h1>
        <code className="auth-path">{props.path}</code>
        {props.note && <p className="auth-note">{props.note}</p>}
        <div className="auth-form">{props.children}</div>
        <p className="auth-demo">デモ表示：認証の実結線（Supabase Auth / MFA）は本結線フェーズ</p>
      </div>
    </div>
  )
}
