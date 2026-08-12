// [S5-2] リスク集計: ランキング/ポジション別/時間帯別 の RED テスト
// テスト規約: AAA / 「対象_条件_期待」 / 境界(空/topN=0/同点/該当なし/timeslot未設定) / 安定ソート・非破壊
import { describe, it, expect } from 'vitest'
import { riskRanking, positionRiskLevels, timeslotRiskLevels } from '../index.js'
import type { RiskItem } from '../types.js'

function item(
  partial: Partial<RiskItem> & Pick<RiskItem, 'id' | 'score'>,
): RiskItem {
  return {
    id: partial.id,
    type: partial.type ?? 'trespass',
    position: partial.position ?? '正面',
    score: partial.score,
    probability: partial.probability ?? 0.5,
    level: partial.level ?? 'Mid',
    factors: partial.factors ?? [],
    timeslot: partial.timeslot,
  }
}

describe('riskRanking [S5-2]', () => {
  it('riskRanking_score降順_高い順にtopN件返す', () => {
    // Arrange
    const items = [
      item({ id: 'a', score: 30 }),
      item({ id: 'b', score: 90 }),
      item({ id: 'c', score: 60 }),
      item({ id: 'd', score: 10 }),
    ]
    // Act
    const ranked = riskRanking(items, 2)
    // Assert
    expect(ranked.map((i) => i.id)).toEqual(['b', 'c'])
  })

  it('riskRanking_同点_id昇順で安定ソートする', () => {
    // Arrange
    const items = [
      item({ id: 'z', score: 50 }),
      item({ id: 'a', score: 50 }),
      item({ id: 'm', score: 50 }),
    ]
    // Act
    const ranked = riskRanking(items, 5)
    // Assert
    expect(ranked.map((i) => i.id)).toEqual(['a', 'm', 'z'])
  })

  it('riskRanking_既定topN_先頭5件を返す', () => {
    // Arrange
    const items = Array.from({ length: 8 }, (_, i) =>
      item({ id: `r${i}`, score: 100 - i }),
    )
    // Act
    const ranked = riskRanking(items)
    // Assert
    expect(ranked).toHaveLength(5)
    expect(ranked[0].id).toBe('r0')
  })

  it('riskRanking_topN件数超過_全件返す', () => {
    // Arrange
    const items = [item({ id: 'a', score: 10 }), item({ id: 'b', score: 20 })]
    // Act
    const ranked = riskRanking(items, 10)
    // Assert
    expect(ranked).toHaveLength(2)
  })

  it('riskRanking_topN0_空配列を返す', () => {
    // Arrange
    const items = [item({ id: 'a', score: 10 })]
    // Act
    const ranked = riskRanking(items, 0)
    // Assert
    expect(ranked).toEqual([])
  })

  it('riskRanking_空items_空配列を返す', () => {
    // Arrange & Act & Assert
    expect(riskRanking([])).toEqual([])
  })

  it('riskRanking_元配列を破壊しない', () => {
    // Arrange
    const items = [item({ id: 'a', score: 30 }), item({ id: 'b', score: 90 })]
    const before = items.map((i) => i.id)
    // Act
    riskRanking(items, 1)
    // Assert
    expect(items.map((i) => i.id)).toEqual(before)
  })
})

describe('positionRiskLevels [S5-2]', () => {
  it('positionRiskLevels_position別_最大scoreと件数を集計する', () => {
    // Arrange
    const items = [
      item({ id: 'a', position: '正面', score: 30 }),
      item({ id: 'b', position: '正面', score: 80 }),
      item({ id: 'c', position: '裏口', score: 50 }),
    ]
    // Act
    const res = positionRiskLevels(items)
    // Assert
    expect(res).toEqual([
      { position: '正面', level: 80, count: 2 },
      { position: '裏口', level: 50, count: 1 },
    ])
  })

  it('positionRiskLevels_level降順_position昇順で安定ソートする', () => {
    // Arrange: level同点(50) の '裏口' と 'エントランス' は position昇順
    const items = [
      item({ id: 'a', position: '裏口', score: 50 }),
      item({ id: 'b', position: 'エントランス', score: 50 }),
      item({ id: 'c', position: '正面', score: 90 }),
    ]
    // Act
    const res = positionRiskLevels(items)
    // Assert
    expect(res.map((r) => r.position)).toEqual(['正面', 'エントランス', '裏口'])
  })

  it('positionRiskLevels_空items_空配列を返す', () => {
    // Arrange & Act & Assert
    expect(positionRiskLevels([])).toEqual([])
  })
})

describe('timeslotRiskLevels [S5-2]', () => {
  it('timeslotRiskLevels_slot順_各slotの最大scoreと件数を返す', () => {
    // Arrange
    const items = [
      item({ id: 'a', score: 30, timeslot: '午前' }),
      item({ id: 'b', score: 70, timeslot: '午前' }),
      item({ id: 'c', score: 50, timeslot: '深夜' }),
    ]
    const slots = ['午前', '午後', '深夜']
    // Act
    const res = timeslotRiskLevels(items, slots)
    // Assert
    expect(res).toEqual([
      { slot: '午前', level: 70, count: 2 },
      { slot: '午後', level: 0, count: 0 },
      { slot: '深夜', level: 50, count: 1 },
    ])
  })

  it('timeslotRiskLevels_該当なしslot_level0_count0を返す', () => {
    // Arrange
    const items = [item({ id: 'a', score: 40, timeslot: '午前' })]
    const slots = ['夕方']
    // Act
    const res = timeslotRiskLevels(items, slots)
    // Assert
    expect(res).toEqual([{ slot: '夕方', level: 0, count: 0 }])
  })

  it('timeslotRiskLevels_timeslot未設定item_対象外にする', () => {
    // Arrange: timeslot undefined の item は集計しない
    const items = [
      item({ id: 'a', score: 90 }),
      item({ id: 'b', score: 40, timeslot: '午前' }),
    ]
    const slots = ['午前']
    // Act
    const res = timeslotRiskLevels(items, slots)
    // Assert
    expect(res).toEqual([{ slot: '午前', level: 40, count: 1 }])
  })

  it('timeslotRiskLevels_slots順序を保持する', () => {
    // Arrange
    const items = [item({ id: 'a', score: 10, timeslot: '深夜' })]
    const slots = ['深夜', '早朝', '午前']
    // Act
    const res = timeslotRiskLevels(items, slots)
    // Assert
    expect(res.map((r) => r.slot)).toEqual(['深夜', '早朝', '午前'])
  })

  it('timeslotRiskLevels_空slots_空配列を返す', () => {
    // Arrange
    const items = [item({ id: 'a', score: 10, timeslot: '午前' })]
    // Act & Assert
    expect(timeslotRiskLevels(items, [])).toEqual([])
  })
})
