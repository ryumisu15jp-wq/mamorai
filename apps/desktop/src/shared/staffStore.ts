// [共有ストア] 勤務員マスタ。現場(/s)の「勤務員登録」で登録・編集し、
// シフト表・講習会・有給などがこの名簿を参照する（同一オリジンの localStorage で永続化）。
// 次段で Supabase 実DB(staff テーブル)へ置換。
import { STAFF as SEED_STAFF, type PilotStaff } from '../pilot/bulgari.js'

export type Staff = PilotStaff

const KEY = 'mamorai.staff.v1'
type Listener = () => void
const listeners = new Set<Listener>()

function read(): Staff[] {
  try { const raw = globalThis.localStorage?.getItem(KEY); if (raw) return JSON.parse(raw) as Staff[] } catch { /* ignore */ }
  try { globalThis.localStorage?.setItem(KEY, JSON.stringify(SEED_STAFF)) } catch { /* ignore */ }
  return SEED_STAFF.slice()
}
function write(rows: Staff[]): void {
  try { globalThis.localStorage?.setItem(KEY, JSON.stringify(rows)) } catch { /* ignore */ }
  listeners.forEach((l) => l())
}

export function listStaff(): Staff[] { return read() }
export function activeStaff(): Staff[] { return read().filter((s) => s.active) }

/** 登録/更新（スタッフNoが既存なら更新、無ければ追加）。 */
export function upsertStaff(s: Staff): void {
  const rows = read()
  const i = rows.findIndex((r) => r.no === s.no)
  if (i >= 0) { rows[i] = s; write(rows.slice()) } else { write([...rows, s]) }
}
export function setActive(no: string, active: boolean): void {
  write(read().map((r) => (r.no === no ? { ...r, active } : r)))
}
export function subscribe(l: Listener): () => void {
  listeners.add(l)
  const onStorage = (e: StorageEvent): void => { if (e.key === KEY) l() }
  try { globalThis.addEventListener?.('storage', onStorage) } catch { /* ignore */ }
  return () => { listeners.delete(l); try { globalThis.removeEventListener?.('storage', onStorage) } catch { /* ignore */ } }
}
