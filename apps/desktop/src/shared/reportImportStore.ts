// [共有ストア] 過去日報の取込データを蓄積する（リスク・事案情報のデータ化）。
// 月ごとに 日別カウント＋事案(インシデント) を保持し、複数月を累積。
// 同一オリジンの localStorage で永続化（次段で Supabase 実DBへ）。
import { IMPORT_SEED_JUNE } from '../pilot/bhtImportSeed.js'

/** 事案として扱うカウント項目（セキュリティ事象）。 */
export const INCIDENT_KEYS = [
  '巡回時未施錠', '警察対応', '自火報発報', 'ジュエリーケース発報', '救急対応',
  '不審物対応', '不審者対応', 'エレベーター呼出', '緊急呼出', '未返却', '誤進入',
] as const
/** 取込対象のカウント項目（事案＋運用件数）。 */
export const COUNT_KEYS = [...INCIDENT_KEYS, '入館者', '外部スタッフ', 'セキュリティカード登録・変更'] as const

export interface Incident { date: string; category: string; count: number; note?: string }
export interface DailyCount { day: number; counts: Record<string, number>; rate: number | null }
export interface ImportedMonth {
  site: string
  ym: string                        // 対象年月 YYYY-MM
  totals: Record<string, number>    // 月次合計（稼働率平均・総数を含む）
  dailies: DailyCount[]
  incidents: Incident[]
  importedAt?: string
}

const KEY = 'mamorai.reportImport.v1'
type Listener = () => void
const listeners = new Set<Listener>()

function read(): Record<string, ImportedMonth> {
  try { const raw = globalThis.localStorage?.getItem(KEY); if (raw) return JSON.parse(raw) as Record<string, ImportedMonth> } catch { /* ignore */ }
  const seed: Record<string, ImportedMonth> = { [IMPORT_SEED_JUNE.ym]: { ...IMPORT_SEED_JUNE, importedAt: '取込済(初期)' } }
  try { globalThis.localStorage?.setItem(KEY, JSON.stringify(seed)) } catch { /* ignore */ }
  return seed
}
function write(all: Record<string, ImportedMonth>): void {
  try { globalThis.localStorage?.setItem(KEY, JSON.stringify(all)) } catch { /* ignore */ }
  listeners.forEach((l) => l())
}

/** 取込済みの月一覧（新しい月順）。 */
export function listMonths(): ImportedMonth[] {
  return Object.values(read()).sort((a, b) => (a.ym < b.ym ? 1 : -1))
}
export function getMonth(ym: string): ImportedMonth | undefined { return read()[ym] }
/** 月を追加/更新（取込）。 */
export function addMonth(m: ImportedMonth): void {
  const all = read(); all[m.ym] = { ...m, importedAt: m.importedAt ?? new Date().toISOString().slice(0, 10) }
  write(all)
}
export function removeMonth(ym: string): void { const all = read(); delete all[ym]; write(all) }

/** 全月を横断した事案ログ（日付降順）。 */
export function allIncidents(): Incident[] {
  return listMonths().flatMap((m) => m.incidents).sort((a, b) => (a.date < b.date ? 1 : -1))
}
/** 事案カテゴリ別の累積件数（全月）。 */
export function incidentTotals(): { category: string; count: number }[] {
  const agg: Record<string, number> = {}
  for (const m of listMonths()) for (const k of INCIDENT_KEYS) agg[k] = (agg[k] ?? 0) + (m.totals[k] ?? 0)
  return INCIDENT_KEYS.map((k) => ({ category: k, count: agg[k] ?? 0 })).sort((a, b) => b.count - a.count)
}
/** 月別リスク（事案合計）トレンド。 */
export function monthlyIncidentTrend(): { ym: string; total: number }[] {
  return listMonths().map((m) => ({ ym: m.ym, total: INCIDENT_KEYS.reduce((s, k) => s + (m.totals[k] ?? 0), 0) })).reverse()
}

export function subscribe(l: Listener): () => void {
  listeners.add(l)
  const onStorage = (e: StorageEvent): void => { if (e.key === KEY) l() }
  try { globalThis.addEventListener?.('storage', onStorage) } catch { /* ignore */ }
  return () => { listeners.delete(l); try { globalThis.removeEventListener?.('storage', onStorage) } catch { /* ignore */ } }
}
