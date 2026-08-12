// [S5-1] 業態マスタ アクセサの RED テスト（HaiTO 3業態: 商業施設/興行施設/興行運営）
// テスト規約: AAA / 「対象_条件_期待」 / 境界(未知業態throw) / 純粋・決定論
import { describe, it, expect } from 'vitest'
import {
  getBusinessMaster,
  listIncidents,
  listPositions,
  listConditionFields,
  listBusinessTypes,
} from '../index.js'
import type { ConditionField } from '../types.js'

describe('getBusinessMaster [S5-1]', () => {
  it('getBusinessMaster_商業施設_該当マスタを返す', () => {
    // Arrange & Act
    const m = getBusinessMaster('商業施設')
    // Assert
    expect(m.businessType).toBe('商業施設')
    expect(Array.isArray(m.incidents)).toBe(true)
    expect(Array.isArray(m.positions)).toBe(true)
    expect(Array.isArray(m.conditionFields)).toBe(true)
  })

  it('getBusinessMaster_興行運営_該当マスタを返す', () => {
    // Arrange & Act
    const m = getBusinessMaster('興行運営')
    // Assert
    expect(m.businessType).toBe('興行運営')
  })

  it('getBusinessMaster_未知業態_throwする', () => {
    // Arrange & Act & Assert
    expect(() => getBusinessMaster('未知業態')).toThrow()
  })
})

describe('listIncidents [S5-1]', () => {
  it('listIncidents_商業施設_万引き/盗難を含む', () => {
    // Arrange & Act
    const incidents = listIncidents('商業施設')
    // Assert
    expect(incidents).toContain('万引き/盗難')
  })

  it('listIncidents_興行運営_観戦マナー違反を含む', () => {
    // Arrange & Act
    const incidents = listIncidents('興行運営')
    // Assert
    expect(incidents).toContain('観戦マナー違反')
  })

  it('listIncidents_未知業態_throwする', () => {
    // Arrange & Act & Assert
    expect(() => listIncidents('ホテル施設')).toThrow()
  })
})

describe('listPositions [S5-1]', () => {
  it('listPositions_興行運営_ホーム席を含む', () => {
    // Arrange & Act
    const positions = listPositions('興行運営')
    // Assert
    expect(positions).toContain('ホーム席')
  })

  it('listPositions_商業施設_防災センターを含む', () => {
    // Arrange & Act
    const positions = listPositions('商業施設')
    // Assert
    expect(positions).toContain('防災センター')
  })

  it('listPositions_未知業態_throwする', () => {
    // Arrange & Act & Assert
    expect(() => listPositions('未知')).toThrow()
  })
})

describe('listConditionFields [S5-1]', () => {
  it('listConditionFields_興行運営_特殊groupの試合時刻(matchTime)を含む', () => {
    // Arrange & Act
    const fields = listConditionFields('興行運営')
    // Assert
    const matchTime = fields.find((f: ConditionField) => f.key === 'matchTime')
    expect(matchTime).toBeDefined()
    expect(matchTime?.label).toBe('試合時刻')
    expect(matchTime?.group).toBe('特殊')
  })

  it('listConditionFields_商業施設_特殊groupの季節イベントを含む', () => {
    // Arrange & Act
    const fields = listConditionFields('商業施設')
    // Assert
    const seasonEvent = fields.find((f: ConditionField) => f.label === '季節イベント')
    expect(seasonEvent).toBeDefined()
    expect(seasonEvent?.group).toBe('特殊')
  })

  it('listConditionFields_商業施設_共通groupの季節(season)を含む', () => {
    // Arrange & Act
    const fields = listConditionFields('商業施設')
    // Assert
    const season = fields.find((f: ConditionField) => f.key === 'season')
    expect(season?.group).toBe('共通')
  })

  it('listConditionFields_未知業態_throwする', () => {
    // Arrange & Act & Assert
    expect(() => listConditionFields('未知')).toThrow()
  })
})

describe('listBusinessTypes [S5-1]', () => {
  it('listBusinessTypes_3業態キーを含む', () => {
    // Arrange & Act
    const types = listBusinessTypes()
    // Assert
    expect(types).toContain('商業施設')
    expect(types).toContain('興行施設')
    expect(types).toContain('興行運営')
  })

  it('listBusinessTypes_未知業態は含まない', () => {
    // Arrange & Act
    const types = listBusinessTypes()
    // Assert
    expect(types).not.toContain('未知業態')
  })
})
