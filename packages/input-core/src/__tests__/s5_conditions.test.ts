// [S5-2] AI条件→予測入力ビルダーの RED テスト（未知キー除外の正規化）
// テスト規約: AAA / 「対象_条件_期待」 / 境界(未知キー/未知業態) / 純粋・決定論
import { describe, it, expect } from 'vitest'
import { buildPredictionInput } from '../index.js'

describe('buildPredictionInput [S5-2]', () => {
  it('buildPredictionInput_既知キー_保持する', () => {
    // Arrange
    const conditions = { season: '夏', weather: '晴', capacity: 3000 }
    // Act
    const input = buildPredictionInput('商業施設', '2026-08-11', conditions)
    // Assert
    expect(input.conditions.season).toBe('夏')
    expect(input.conditions.weather).toBe('晴')
    expect(input.conditions.capacity).toBe(3000)
  })

  it('buildPredictionInput_未知キー_除外する', () => {
    // Arrange: matchTime は商業施設の conditionFields に存在しない特殊キー
    const conditions = { season: '冬', matchTime: '18:00', foo: 'bar' }
    // Act
    const input = buildPredictionInput('商業施設', '2026-01-15', conditions)
    // Assert
    expect(input.conditions.season).toBe('冬')
    expect('matchTime' in input.conditions).toBe(false)
    expect('foo' in input.conditions).toBe(false)
  })

  it('buildPredictionInput_業態固有キー_採用する', () => {
    // Arrange: matchTime は興行運営には存在する
    const conditions = { matchTime: '18:00', season: '秋' }
    // Act
    const input = buildPredictionInput('興行運営', '2026-10-01', conditions)
    // Assert
    expect(input.conditions.matchTime).toBe('18:00')
    expect(input.conditions.season).toBe('秋')
  })

  it('buildPredictionInput_businessTypeとdate_返り値に入る', () => {
    // Arrange & Act
    const input = buildPredictionInput('興行施設', '2026-12-24', { season: '冬' })
    // Assert
    expect(input.businessType).toBe('興行施設')
    expect(input.date).toBe('2026-12-24')
  })

  it('buildPredictionInput_空conditions_空の正規化を返す', () => {
    // Arrange & Act
    const input = buildPredictionInput('商業施設', '2026-08-11', {})
    // Assert
    expect(input.conditions).toEqual({})
  })

  it('buildPredictionInput_未知業態_throwする', () => {
    // Arrange & Act & Assert
    expect(() => buildPredictionInput('未知業態', '2026-08-11', { season: '夏' })).toThrow()
  })
})
