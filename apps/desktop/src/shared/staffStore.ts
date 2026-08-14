// [共有ストア] 勤務員マスタ。現場(/s)の「勤務員登録」で登録・編集し、
// シフト表・講習会・有給などがこの名簿を参照する（同一オリジンの localStorage で永続化）。
// 次段で Supabase 実DB(staff テーブル)へ置換。
import { STAFF as SEED_STAFF, pinFromDob, type PilotStaff } from '../pilot/bulgari.js'

export type Staff = PilotStaff

const KEY = 'mamorai.staff.v1'
type Listener = () => void
const listeners = new Set<Listener>()

// 初期PINを付与（生年月日→MMDD、初回変更強制）。既にpinがあれば保持。
function withInitialPin(s: Staff): Staff {
  return s.pin ? s : { ...s, pin: pinFromDob(s.dob), pinMustChange: true }
}

function read(): Staff[] {
  try { const raw = globalThis.localStorage?.getItem(KEY); if (raw) return JSON.parse(raw) as Staff[] } catch { /* ignore */ }
  const seed = SEED_STAFF.map(withInitialPin)
  try { globalThis.localStorage?.setItem(KEY, JSON.stringify(seed)) } catch { /* ignore */ }
  return seed
}
function write(rows: Staff[]): void {
  try { globalThis.localStorage?.setItem(KEY, JSON.stringify(rows)) } catch { /* ignore */ }
  listeners.forEach((l) => l())
}

export function listStaff(): Staff[] { return read() }
export function activeStaff(): Staff[] { return read().filter((s) => s.active) }

/** 登録/更新（スタッフNoが既存なら更新、無ければ初期PIN=生年月日で追加）。 */
export function upsertStaff(s: Staff): void {
  const rows = read()
  const i = rows.findIndex((r) => r.no === s.no)
  if (i >= 0) { rows[i] = { ...rows[i]!, ...s }; write(rows.slice()) } else { write([...rows, withInitialPin(s)]) }
}
export function setActive(no: string, active: boolean): void {
  write(read().map((r) => (r.no === no ? { ...r, active } : r)))
}
/** 勤務員ログイン照合（スタッフNo＋PIN）。 */
export function authStaff(no: string, pin: string): Staff | null {
  const s = read().find((r) => r.no === no.trim() && r.active)
  return s && (s.pin ?? pinFromDob(s.dob)) === pin.trim() ? s : null
}
/** PIN変更（初回変更・任意変更）。要変更フラグを解除。 */
export function changePin(no: string, newPin: string): void {
  write(read().map((r) => (r.no === no ? { ...r, pin: newPin, pinMustChange: false } : r)))
}
/** 初期PIN(生年月日)へリセット（現場が復旧時に使用）。 */
export function resetPinToDob(no: string): string {
  let pin = '0000'
  write(read().map((r) => { if (r.no === no) { pin = pinFromDob(r.dob); return { ...r, pin, pinMustChange: true } } return r }))
  return pin
}
export function subscribe(l: Listener): () => void {
  listeners.add(l)
  const onStorage = (e: StorageEvent): void => { if (e.key === KEY) l() }
  try { globalThis.addEventListener?.('storage', onStorage) } catch { /* ignore */ }
  return () => { listeners.delete(l); try { globalThis.removeEventListener?.('storage', onStorage) } catch { /* ignore */ } }
}
