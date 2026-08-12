// [REQ-002] resolveForm: テンプレート → 解決済みフォーム構造
// テスト名規則: 対象_条件_期待 / AAAパターン
import { describe, it, expect } from 'vitest'
import { resolveForm } from '../index.js'
import { nightShiftTemplate, noDefaultTemplate } from './fixtures.js'

describe('resolveForm [REQ-002]', () => {
  it('resolveForm_有効セクションのみ_無効セクションを除外する', () => {
    // Arrange
    const template = nightShiftTemplate()
    // Act
    const form = resolveForm(template)
    // Assert
    const ids = form.sections.map((s) => s.id)
    expect(ids).not.toContain('archived')
    expect(ids).toEqual(['meta', 'kinmu', 'counter', 'check', 'gate'])
    expect(form.values).not.toHaveProperty('archived')
  })

  it('resolveForm_enabled未指定セクション_含める', () => {
    // Arrange
    const template = nightShiftTemplate()
    // Act
    const form = resolveForm(template)
    // Assert (meta等は enabled 未指定 = 有効)
    expect(form.values).toHaveProperty('meta')
    expect(form.values).toHaveProperty('gate')
  })

  it('resolveForm_フィールドにdefaultあり_default値で初期化する', () => {
    // Arrange
    const template = nightShiftTemplate()
    // Act
    const form = resolveForm(template)
    // Assert
    expect(form.values.meta.shift).toBe('夜勤')
    expect(form.values.kinmu.start).toBe('21:00')
    expect(form.values.counter.unlocked).toBe(0)
    expect(form.values.check.aed).toBe(false)
  })

  it('resolveForm_defaultなし_型別の空値で初期化する', () => {
    // Arrange
    const template = noDefaultTemplate()
    // Act
    const form = resolveForm(template)
    // Assert 境界: text→'' number→null select→null check→false time→null
    expect(form.values.s1.t).toBe('')
    expect(form.values.s1.n).toBeNull()
    expect(form.values.s1.sel).toBeNull()
    expect(form.values.s1.c).toBe(false)
    expect(form.values.s1.tm).toBeNull()
  })

  it('resolveForm_templateId_siteIdを引き継ぐ', () => {
    // Arrange
    const template = nightShiftTemplate()
    // Act
    const form = resolveForm(template)
    // Assert
    expect(form.templateId).toBe('tmpl-bht-night')
    expect(form.siteId).toBe('site-bht')
  })

  it('resolveForm_純粋性_入力テンプレートを変更しない', () => {
    // Arrange
    const template = nightShiftTemplate()
    const snapshot = JSON.stringify(template)
    // Act
    resolveForm(template)
    // Assert
    expect(JSON.stringify(template)).toBe(snapshot)
  })
})
