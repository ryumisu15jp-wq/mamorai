// [実行時コンテキスト] 現場セッションの会社識別コード／施設コードを保持する。
// 現場(/s)ログイン時に App が実コードを設定し、各API(staff/leave)がRPCのスコープに使う。
// 既定は env(VITE_COMPANY_CODE/VITE_SITE_CODE) → 無ければパイロット定数。
import { COMPANY, SITE } from '../pilot/bulgari.js'

const env = (import.meta.env ?? {}) as Record<string, string | undefined>
let companyCode = env.VITE_COMPANY_CODE ?? COMPANY.code
let siteCode = env.VITE_SITE_CODE ?? SITE.code

/** 現場ログイン時に実コードを設定。 */
export function setSiteCodes(company?: string, site?: string): void {
  if (company && company.trim() !== '') companyCode = company.trim()
  if (site && site.trim() !== '') siteCode = site.trim()
}
export function siteCodes(): { companyCode: string; siteCode: string } {
  return { companyCode, siteCode }
}
