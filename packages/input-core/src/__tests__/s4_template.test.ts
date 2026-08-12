// [REQ-024] テンプレートのセクションON/OFF適用: applyTemplateConfig の RED テスト
// テスト規約: AAA / 「対象_条件_期待」 / 境界値 / 非破壊 / resolveForm 併用
import { describe, it, expect } from 'vitest'
import { applyTemplateConfig, resolveForm } from '../index.js'
import { template, SITE_A } from './s4_fixtures.js'

describe('applyTemplateConfig [REQ-024] disabledSectionIds を enabled=false 化', () => {
  it('applyTemplateConfig_指定セクション_enabledをfalseにする', () => {
    // Arrange
    const t = template()
    const config = { siteId: SITE_A, disabledSectionIds: ['patrol'] }
    // Act
    const applied = applyTemplateConfig(t, config)
    // Assert
    const patrol = applied.sections.find((s) => s.id === 'patrol')
    expect(patrol?.enabled).toBe(false)
  })

  it('applyTemplateConfig_無関係セクション_そのまま維持', () => {
    // Arrange
    const t = template()
    const config = { siteId: SITE_A, disabledSectionIds: ['patrol'] }
    // Act
    const applied = applyTemplateConfig(t, config)
    // Assert（weather / incident は OFF にされない）
    const weather = applied.sections.find((s) => s.id === 'weather')
    const incident = applied.sections.find((s) => s.id === 'incident')
    expect(weather?.enabled).not.toBe(false)
    expect(incident?.enabled).not.toBe(false)
  })

  it('applyTemplateConfig_存在しないID_無視する', () => {
    // Arrange（境界: 存在しないセクションIDは影響しない）
    const t = template()
    const config = { siteId: SITE_A, disabledSectionIds: ['ghost'] }
    // Act
    const applied = applyTemplateConfig(t, config)
    // Assert
    expect(applied.sections.every((s) => s.enabled !== false)).toBe(true)
  })

  it('applyTemplateConfig_空のdisabled_全セクション有効のまま', () => {
    // Arrange（境界: 無効化指定なし）
    const t = template()
    const config = { siteId: SITE_A, disabledSectionIds: [] }
    // Act
    const applied = applyTemplateConfig(t, config)
    // Assert
    expect(applied.sections.every((s) => s.enabled !== false)).toBe(true)
  })

  it('applyTemplateConfig_元templateを破壊しない', () => {
    // Arrange（過去データへの非破壊: 元 template と元 section オブジェクトは不変）
    const t = template()
    const originalSection = t.sections.find((s) => s.id === 'patrol')!
    const config = { siteId: SITE_A, disabledSectionIds: ['patrol'] }
    // Act
    const applied = applyTemplateConfig(t, config)
    // Assert
    expect(t).not.toBe(applied)
    expect(originalSection.enabled).not.toBe(false)
    expect(t.sections.every((s) => s.enabled !== false)).toBe(true)
  })

  it('applyTemplateConfig_返り値をresolveForm_OFFセクションが除外される', () => {
    // Arrange（REQ-024 連携: OFF セクションは解決フォームから消える）
    const t = template()
    const config = { siteId: SITE_A, disabledSectionIds: ['patrol'] }
    // Act
    const form = resolveForm(applyTemplateConfig(t, config))
    // Assert
    expect(form.sections.map((s) => s.id)).toEqual(['weather', 'incident'])
    expect(form.values.patrol).toBeUndefined()
  })

  it('applyTemplateConfig_未適用時のresolveForm_全セクションを含む', () => {
    // Arrange（対照: 適用前は3セクション全て残る=OFF が確かに効いている証左）
    const t = template()
    // Act
    const form = resolveForm(t)
    // Assert
    expect(form.sections.map((s) => s.id)).toEqual(['weather', 'patrol', 'incident'])
  })
})
