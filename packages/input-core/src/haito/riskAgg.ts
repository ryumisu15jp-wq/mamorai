// [S5-2] リスク集計: ランキング/ポジション別/時間帯別（純粋・決定論・非破壊）
import type { RiskItem, TimeslotRisk, PositionRisk } from '../types.js'

/** [S5-2] score降順・同点id昇順の安定ソートで先頭 topN 件を返す（非破壊） */
export function riskRanking(items: RiskItem[], topN = 5): RiskItem[] {
  const sorted = [...items].sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score
    }
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })
  return sorted.slice(0, Math.max(0, topN))
}

/** [S5-2] position 毎に最大scoreを level・件数を count とし、level降順→position昇順で返す */
export function positionRiskLevels(items: RiskItem[]): PositionRisk[] {
  const map = new Map<string, { level: number; count: number }>()
  for (const it of items) {
    const cur = map.get(it.position)
    if (cur === undefined) {
      map.set(it.position, { level: it.score, count: 1 })
    } else {
      cur.level = Math.max(cur.level, it.score)
      cur.count += 1
    }
  }
  const rows: PositionRisk[] = Array.from(map, ([position, v]) => ({
    position,
    level: v.level,
    count: v.count,
  }))
  return rows.sort((a, b) => {
    if (b.level !== a.level) {
      return b.level - a.level
    }
    return a.position < b.position ? -1 : a.position > b.position ? 1 : 0
  })
}

/** [S5-2] slots順に、該当timeslotの最大scoreを level・件数を count とし返す（timeslot未設定は除外・該当0はlevel0/count0） */
export function timeslotRiskLevels(items: RiskItem[], slots: string[]): TimeslotRisk[] {
  return slots.map((slot) => {
    let level = 0
    let count = 0
    for (const it of items) {
      if (it.timeslot === slot) {
        level = Math.max(level, it.score)
        count += 1
      }
    }
    return { slot, level, count }
  })
}
