// [Auth] 実認証サービス。Supabase 構成時は実認証、未構成時はデモ動作にフォールバック。
//   会社/運営: Supabase Auth メール＋パスワード → app_profiles でロール解決・レルム検証
//   施設(現場): Supabase RPC app_site_login(会社コード, 施設コード, PIN) で照合
import { getSupabase, isSupabaseConfigured } from '../../lib/supabaseClient.js'
import {
  isValidEmail, isValidCompanyCode, isValidSiteCode, isValidPin,
  type Session, type Role,
} from './authTypes.js'

export class AuthError extends Error {}

const COMPANY_ROLES: Role[] = ['company_admin', 'company_manager']

/** app_profiles から role/company_id/site_id を解決。 */
async function resolveProfile(userId: string): Promise<{ role: Role; companyId?: string; siteId?: string }> {
  const sb = getSupabase()
  if (sb === null) throw new AuthError('認証基盤が未構成です')
  const { data, error } = await sb
    .from('app_profiles')
    .select('role, company_id, site_id')
    .eq('user_id', userId)
    .single()
  if (error !== null || data === null) throw new AuthError('このアカウントには権限が設定されていません')
  return { role: data.role as Role, companyId: data.company_id ?? undefined, siteId: data.site_id ?? undefined }
}

/** 会社ページ（本社・権限者）ログイン。 */
export async function signInCompany(email: string, password: string): Promise<Session> {
  if (!isValidEmail(email)) throw new AuthError('メールアドレスの形式が正しくありません')
  if (password.length < 8) throw new AuthError('パスワードは8文字以上です')
  if (!isSupabaseConfigured()) {
    return { realm: 'company', role: 'company_admin', email, scope: 'company', label: `会社: ${email}` }
  }
  const sb = getSupabase()!
  const { data, error } = await sb.auth.signInWithPassword({ email, password })
  if (error !== null || data.user === null) throw new AuthError('メールまたはパスワードが違います')
  const prof = await resolveProfile(data.user.id)
  if (!COMPANY_ROLES.includes(prof.role)) {
    await sb.auth.signOut()
    throw new AuthError('この入口は会社アカウント専用です')
  }
  return { realm: 'company', role: prof.role, email, companyCode: prof.companyId, scope: 'company', label: `会社: ${email}` }
}

/** 運営（TRYANGROW）ログイン。MFA は Supabase MFA(TOTP) 有効化後に aal2 を要求（本結線）。 */
export async function signInTradmin(email: string, password: string, mfa: string): Promise<Session> {
  if (!isValidEmail(email)) throw new AuthError('メールアドレスの形式が正しくありません')
  if (password.length < 12) throw new AuthError('運営パスワードは12文字以上です')
  if (!/^\d{6}$/.test(mfa)) throw new AuthError('MFAコード（6桁）は必須です')
  if (!isSupabaseConfigured()) {
    return { realm: 'tradmin', role: 'platform_admin', email, scope: 'platform', label: `運営: ${email}` }
  }
  const sb = getSupabase()!
  const { data, error } = await sb.auth.signInWithPassword({ email, password })
  if (error !== null || data.user === null) throw new AuthError('メールまたはパスワードが違います')
  const prof = await resolveProfile(data.user.id)
  if (prof.role !== 'platform_admin') {
    await sb.auth.signOut()
    throw new AuthError('この入口は運営アカウント専用です')
  }
  return { realm: 'tradmin', role: 'platform_admin', email, scope: 'platform', label: `運営: ${email}` }
}

/** 施設（現場）ログイン。会社コード＋施設コード＋PIN を RPC で照合。 */
export async function signInSite(companyCode: string, siteCode: string, pin: string): Promise<Session> {
  const cc = companyCode.trim().toUpperCase()
  const sc = siteCode.trim().toUpperCase()
  if (!isValidCompanyCode(cc)) throw new AuthError('会社識別コードの形式が正しくありません（例 TRA-8821）')
  if (!isValidSiteCode(sc)) throw new AuthError('施設コードの形式が正しくありません（例 LALA-01）')
  if (!isValidPin(pin)) throw new AuthError('現場PINは4〜8桁の数字です')
  if (!isSupabaseConfigured()) {
    return { realm: 'site', role: 'site_operator', companyCode: cc, siteCode: sc, scope: 'site', label: `現場: ${sc}` }
  }
  const sb = getSupabase()!
  const { data, error } = await sb.rpc('app_site_login', { p_company_code: cc, p_site_code: sc, p_pin: pin })
  const row = Array.isArray(data) ? data[0] : data
  if (error !== null || row == null) throw new AuthError('会社コード・施設コード・PINのいずれかが違います')
  return {
    realm: 'site', role: 'site_operator', companyCode: cc, siteCode: sc,
    scope: 'site', label: `現場: ${row.site_name ?? sc}`,
  }
}

/** ログアウト（Supabase セッション破棄）。 */
export async function signOut(): Promise<void> {
  const sb = getSupabase()
  if (sb !== null) await sb.auth.signOut()
}
