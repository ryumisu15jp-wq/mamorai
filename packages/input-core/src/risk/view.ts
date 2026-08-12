// [REQ-014][REQ-015] リスク予測の分類・写像・ランキング・フィルタ（純粋・秘匿境界）
// 予測エンジンは直叩きしない。外部I/O・機密参照を持たない純粋写像に限定する。
import type { RiskItem, RiskFilter, RiskLevel } from '../types.js'

/** [REQ-014] score からリスク度を分類（>=70 High / >=40 Mid / それ以外 Low） */
export function classifyRisk(score: number): RiskLevel {
  if (score >= 70) return 'High'
  if (score >= 40) return 'Mid'
  return 'Low'
}

/** null でないプレーンオブジェクトか */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** unknown を文字列配列へ正規化（非配列・非文字列要素は除外） */
function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((v): v is string => typeof v === 'string')
}

/**
 * [REQ-014] 予測レスポンス（unknown）を RiskItem[] へ写像し level を付与する。
 * 配列以外は []。要素は id:string かつ score:number 必須（欠く要素は除外）。factors 欠落は []。
 */
export function fromPredictionResponse(raw: unknown): RiskItem[] {
  if (!Array.isArray(raw)) return []
  const items: RiskItem[] = []
  for (const el of raw) {
    if (!isRecord(el)) continue
    const id = el.id
    const score = el.score
    if (typeof id !== 'string' || typeof score !== 'number') continue
    const type = typeof el.type === 'string' ? el.type : ''
    const position = typeof el.position === 'string' ? el.position : ''
    const probability = typeof el.probability === 'number' ? el.probability : 0
    items.push({
      id,
      type,
      position,
      score,
      probability,
      level: classifyRisk(score),
      factors: toStringArray(el.factors),
    })
  }
  return items
}

/** [REQ-014] score 降順・同点 id 昇順で安定ソート（非破壊） */
export function rankRisks(items: RiskItem[]): RiskItem[] {
  return [...items].sort((a, b) => (b.score - a.score) || a.id.localeCompare(b.id))
}

/** [REQ-015] type/position 完全一致で絞り込み、sortBy×order（既定 score desc）で並べる（非破壊） */
export function filterRisks(items: RiskItem[], filter: RiskFilter): RiskItem[] {
  const sortBy = filter.sortBy ?? 'score'
  const order = filter.order ?? 'desc'
  const dir = order === 'asc' ? 1 : -1
  return items
    .filter((i) => (filter.type === undefined || i.type === filter.type) && (filter.position === undefined || i.position === filter.position))
    .sort((a, b) => (a[sortBy] - b[sortBy]) * dir)
}
