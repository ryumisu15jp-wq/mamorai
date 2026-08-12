// [Auth /s/] 施設（現場）ログイン: 会社識別コード＋施設コード＋現場PIN（共有端末・低摩擦）。
import { useState } from 'react'
import { AuthShell } from './CompanyLogin.js'
import { isValidCompanyCode, isValidSiteCode, isValidPin, type Session } from './authTypes.js'

export function SiteLogin({ onLogin }: { onLogin: (s: Session) => void }): JSX.Element {
  const [companyCode, setCompanyCode] = useState('')
  const [siteCode, setSiteCode] = useState('')
  const [pin, setPin] = useState('')
  const [err, setErr] = useState<string | null>(null)

  const submit = (): void => {
    if (!isValidCompanyCode(companyCode)) { setErr('会社識別コードの形式が正しくありません（例 TRA-8821）'); return }
    if (!isValidSiteCode(siteCode)) { setErr('施設コードの形式が正しくありません（例 LALA-01）'); return }
    if (!isValidPin(pin)) { setErr('現場PINは4〜8桁の数字です'); return }
    setErr(null)
    // 本結線時: 会社×施設×PIN を検証 → 単一現場スコープのセッション（RLSは site_id で限定）
    onLogin({
      realm: 'site', role: 'site_operator',
      companyCode: companyCode.trim().toUpperCase(), siteCode: siteCode.trim().toUpperCase(),
      scope: 'site', label: `現場: ${siteCode.trim().toUpperCase()}`,
    })
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
      <button type="button" className="btn btn-primary auth-submit" onClick={submit}>この現場を開く</button>
      <div className="auth-links">
        <span className="muted">個人の特定は日報の「対応者」欄で記録されます</span>
      </div>
    </AuthShell>
  )
}
