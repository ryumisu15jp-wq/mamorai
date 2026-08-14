// [共有ストア] 月次シフト(=配置予定)の保存。現場のシフト作成結果を保持し、
// 「配置予定表(予定)」がこれを参照する。同一オリジンの localStorage で永続化（次段でDB）。
export interface ShiftSnapshot {
  ym: string
  staff: { no: string; name: string }[]
  grid: Record<string, string[]>   // 氏名No → 日配列(区分コード)
  savedAt: string
}

const KEY = 'mamorai.shift.v1'
type Listener = () => void
const listeners = new Set<Listener>()

function readAll(): Record<string, ShiftSnapshot> {
  try { const raw = globalThis.localStorage?.getItem(KEY); if (raw) return JSON.parse(raw) as Record<string, ShiftSnapshot> } catch { /* ignore */ }
  return {}
}
export function saveShift(s: ShiftSnapshot): void {
  const all = readAll(); all[s.ym] = s
  try { globalThis.localStorage?.setItem(KEY, JSON.stringify(all)) } catch { /* ignore */ }
  listeners.forEach((l) => l())
}
export function loadShift(ym: string): ShiftSnapshot | undefined { return readAll()[ym] }
export function subscribe(l: Listener): () => void {
  listeners.add(l)
  const onStorage = (e: StorageEvent): void => { if (e.key === KEY) l() }
  try { globalThis.addEventListener?.('storage', onStorage) } catch { /* ignore */ }
  return () => { listeners.delete(l); try { globalThis.removeEventListener?.('storage', onStorage) } catch { /* ignore */ } }
}
