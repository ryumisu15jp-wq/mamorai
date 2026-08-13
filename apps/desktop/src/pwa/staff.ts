// [勤務員PWA] スタッフ（勤務員）マスタと簡易ログイン（デモ）。
// 本結線時は Supabase(app_profiles/現場割当) + PIN/パスキーに置換。
export interface Staff {
  no: string
  name: string
  dob: string          // 生年月日 YYYY-MM-DD
  dept: string         // 所属（例: セキュリティサービス4）
  sites: string[]      // 担当現場（複数可・担当外は含めない）
  pin: string          // デモPIN（本番は保存しない）
}

export const STAFF: Record<string, Staff> = {
  '783': { no: '783', name: '三角 龍彦', dob: '1985-04-12', dept: 'セキュリティサービス4', sites: ['ブルガリホテル東京(施設)', 'ららテラス立川(施設)'], pin: '1234' },
  '812': { no: '812', name: '鈴木 花', dob: '1998-01-22', dept: 'セキュリティサービス4', sites: ['立川立飛(施設)'], pin: '1234' },
  '655': { no: '655', name: '田中 誠', dob: '1979-11-05', dept: 'セキュリティサービス2', sites: ['ららテラス立川(施設)'], pin: '0000' },
}

/** スタッフNo + PIN でログイン。成功で Staff を返す。 */
export function signInStaff(no: string, pin: string): Staff | null {
  const s = STAFF[no.trim()]
  if (s && s.pin === pin.trim()) return s
  return null
}
