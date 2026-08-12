// [REQ-014/015] リスク予測の分類・写像・ランキング・フィルタ の RED テスト
// テスト規約: AAA / 「対象_条件_期待」 / 分類境界(70,40,39,100,0) / 安定ソート / 非破壊
import { describe, it, expect } from 'vitest'
import { classifyRisk, fromPredictionResponse, rankRisks, filterRisks } from '../index.js'
import type { RiskItem } from '../types.js'

function item(partial: Partial<RiskItem> & Pick<RiskItem, 'id' | 'score'>): RiskItem {
  return {
    id: partial.id,
    type: partial.type ?? 'trespass',
    position: partial.position ?? '正面',
    score: partial.score,
    probability: partial.probability ?? 0.5,
    level: partial.level ?? classifyRiskSafe(partial.score),
    factors: partial.factors ?? [],
  }
}
// classifyRisk はまだ未実装のため、フィクスチャ内では素の期待値でレベルを埋める
function classifyRiskSafe(score: number): RiskItem['level'] {
  return score >= 70 ? 'High' : score >= 40 ? 'Mid' : 'Low'
}

describe('classifyRisk [REQ-014] 境界値', () => {
  it.each([
    [100, 'High'],
    [70, 'High'],
    [69, 'Mid'],
    [40, 'Mid'],
    [39, 'Low'],
    [0, 'Low'],
  ])('classifyRisk_score%i_%sを返す', (score, expected) => {
    // Arrange & Act & Assert
    expect(classifyRisk(score)).toBe(expected)
  })
})

describe('fromPredictionResponse [REQ-014]', () => {
  it('fromPredictionResponse_正常レスポンス_RiskItem配列へ写像しlevelを付与する', () => {
    // Arrange
    const raw = [
      { id: 'r1', type: 'trespass', position: '正面', score: 80, probability: 0.7, factors: ['夜間', '死角'] },
    ]
    // Act
    const items = fromPredictionResponse(raw)
    // Assert
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ id: 'r1', type: 'trespass', position: '正面', score: 80, probability: 0.7 })
    expect(items[0].level).toBe('High')
    expect(items[0].factors).toEqual(['夜間', '死角'])
  })

  it('fromPredictionResponse_score別_levelがclassifyRiskで付与される', () => {
    // Arrange
    const raw = [
      { id: 'h', type: 't', position: 'p', score: 70, probability: 0.9, factors: [] },
      { id: 'm', type: 't', position: 'p', score: 40, probability: 0.5, factors: [] },
      { id: 'l', type: 't', position: 'p', score: 10, probability: 0.1, factors: [] },
    ]
    // Act
    const items = fromPredictionResponse(raw)
    // Assert
    expect(items.map((i) => i.level)).toEqual(['High', 'Mid', 'Low'])
  })

  it('fromPredictionResponse_配列以外_空配列を返す', () => {
    // Arrange & Act & Assert
    expect(fromPredictionResponse(null)).toEqual([])
    expect(fromPredictionResponse(undefined)).toEqual([])
    expect(fromPredictionResponse({ id: 'x', score: 50 })).toEqual([])
    expect(fromPredictionResponse('foo')).toEqual([])
  })

  it('fromPredictionResponse_不正要素_安全に無視する', () => {
    // Arrange: id欠落 / score非数値 / null / 非オブジェクト は除外
    const raw = [
      { id: 'ok', type: 't', position: 'p', score: 55, probability: 0.4, factors: [] },
      { type: 't', position: 'p', score: 55 }, // id 欠落
      { id: 'noscore', type: 't', position: 'p', score: 'high' }, // score 非数値
      null,
      42,
    ]
    // Act
    const items = fromPredictionResponse(raw)
    // Assert
    expect(items).toHaveLength(1)
    expect(items[0].id).toBe('ok')
  })

  it('fromPredictionResponse_factors欠落_空配列で既定化する', () => {
    // Arrange
    const raw = [{ id: 'r', type: 't', position: 'p', score: 50, probability: 0.5 }]
    // Act
    const items = fromPredictionResponse(raw)
    // Assert
    expect(items[0].factors).toEqual([])
  })
})

describe('rankRisks [REQ-014]', () => {
  it('rankRisks_score降順_高い順に並べる', () => {
    // Arrange
    const items = [item({ id: 'a', score: 30 }), item({ id: 'b', score: 90 }), item({ id: 'c', score: 60 })]
    // Act
    const ranked = rankRisks(items)
    // Assert
    expect(ranked.map((i) => i.id)).toEqual(['b', 'c', 'a'])
  })

  it('rankRisks_同点_id昇順で安定ソートする', () => {
    // Arrange
    const items = [item({ id: 'z', score: 50 }), item({ id: 'a', score: 50 }), item({ id: 'm', score: 50 })]
    // Act
    const ranked = rankRisks(items)
    // Assert
    expect(ranked.map((i) => i.id)).toEqual(['a', 'm', 'z'])
  })

  it('rankRisks_元配列を破壊しない', () => {
    // Arrange
    const items = [item({ id: 'a', score: 30 }), item({ id: 'b', score: 90 })]
    const before = items.map((i) => i.id)
    // Act
    rankRisks(items)
    // Assert
    expect(items.map((i) => i.id)).toEqual(before)
  })
})

describe('filterRisks [REQ-015]', () => {
  const items = [
    item({ id: 'a', type: 'trespass', position: '正面', score: 80, probability: 0.6 }),
    item({ id: 'b', type: 'fire', position: '裏口', score: 40, probability: 0.9 }),
    item({ id: 'c', type: 'trespass', position: '裏口', score: 60, probability: 0.3 }),
  ]

  it('filterRisks_type一致_該当種別のみ返す', () => {
    // Arrange & Act
    const res = filterRisks(items, { type: 'trespass' })
    // Assert
    expect(res.map((i) => i.id).sort()).toEqual(['a', 'c'])
  })

  it('filterRisks_position一致_該当ポジションのみ返す', () => {
    // Arrange & Act
    const res = filterRisks(items, { position: '裏口' })
    // Assert
    expect(res.map((i) => i.id).sort()).toEqual(['b', 'c'])
  })

  it('filterRisks_type_position複合_ANDで絞り込む', () => {
    // Arrange & Act
    const res = filterRisks(items, { type: 'trespass', position: '裏口' })
    // Assert
    expect(res.map((i) => i.id)).toEqual(['c'])
  })

  it('filterRisks_既定_scoreの降順で返す', () => {
    // Arrange & Act
    const res = filterRisks(items, {})
    // Assert
    expect(res.map((i) => i.id)).toEqual(['a', 'c', 'b'])
  })

  it('filterRisks_sortBy_probability_desc_確率降順で返す', () => {
    // Arrange & Act
    const res = filterRisks(items, { sortBy: 'probability', order: 'desc' })
    // Assert
    expect(res.map((i) => i.id)).toEqual(['b', 'a', 'c'])
  })

  it('filterRisks_sortBy_score_asc_リスク度昇順で返す', () => {
    // Arrange & Act
    const res = filterRisks(items, { sortBy: 'score', order: 'asc' })
    // Assert
    expect(res.map((i) => i.id)).toEqual(['b', 'c', 'a'])
  })
})
