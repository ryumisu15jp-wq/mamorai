// [共有ストア] シフト希望票を 勤務員PWA(/app) と 現場(/s) で共有する。
// 勤務員が対象月の各日に希望(勤務可/夜勤希望/休み希望)を提出→現場の月次シフト作成に反映。
// 同一オリジンの localStorage を実データ源とする（次段で Supabase 実DB結線）。
export type HopeCode = '可' | '夜' | '休'
export interface ShiftHope {
  staffNo: string
  name: string
  site: string
  ym: string                    // 対象月 YYYY-MM
  days: Record<number, HopeCode> // 日(1-31) → 希望
  note: string
  submittedAt: string
}

const KEY = 'mamorai.shiftHope.v1'
type Listener = () => void
const listeners = new Set<Listener>()

function read(): ShiftHope[] {
  try { const raw = globalThis.localStorage?.getItem(KEY); if (raw) return JSON.parse(raw) as ShiftHope[] } catch { /* ignore */ }
  return []
}
function write(rows: ShiftHope[]): void {
  try { globalThis.localStorage?.setItem(KEY, JSON.stringify(rows)) } catch { /* ignore */ }
  listeners.forEach((l) => l())
}

/** 希望を提出（同一スタッフ・同一月は上書き）。 */
export function submitHope(h: ShiftHope): void {
  const rows = read().filter((r) => !(r.staffNo === h.staffNo && r.ym === h.ym))
  write([h, ...rows])
}
export function listHopes(): ShiftHope[] { return read() }
export function hopesForMonth(ym: string): ShiftHope[] {
  return read().filter((r) => r.ym === ym)
}
export function hopeFor(staffNo: string, ym: string): ShiftHope | undefined {
  return read().find((r) => r.staffNo === staffNo && r.ym === ym)
}
export function subscribe(l: Listener): () => void {
  listeners.add(l)
  const onStorage = (e: StorageEvent): void => { if (e.key === KEY) l() }
  try { globalThis.addEventListener?.('storage', onStorage) } catch { /* ignore */ }
  return () => { listeners.delete(l); try { globalThis.removeEventListener?.('storage', onStorage) } catch { /* ignore */ } }
}
