// [勤務員PWA] ログインは共有の勤務員マスタ(staffStore)を参照（現場登録と同一データ）。
// 初期PINは生年月日(MMDD)。初回ログイン時に変更を強制（pinMustChange）。
import { authStaff, changePin as storeChangePin, type Staff as StoreStaff } from '../shared/staffStore.js'

export interface Staff {
  no: string
  name: string
  dob: string
  dept: string
  sites: string[]         // 担当現場（PWA互換のため配列。ブルガリは単一現場）
  pinMustChange?: boolean
}

function toPwa(s: StoreStaff): Staff {
  return { no: s.no, name: s.name, dob: s.dob, dept: s.dept, sites: [s.site], pinMustChange: s.pinMustChange }
}

/** スタッフNo＋PINでログイン。 */
export function signInStaff(no: string, pin: string): Staff | null {
  const s = authStaff(no, pin)
  return s ? toPwa(s) : null
}

/** PIN変更（初回・任意）。要変更フラグを解除。 */
export function changeStaffPin(no: string, newPin: string): void {
  storeChangePin(no, newPin)
}
