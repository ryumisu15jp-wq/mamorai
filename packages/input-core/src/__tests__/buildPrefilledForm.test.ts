// [REQ-003] buildPrefilledForm: 直近日報からのプリフィル（承認済優先ルールの分岐を境界テスト）
import { describe, it, expect } from 'vitest'
import { buildPrefilledForm } from '../index.js'
import { nightShiftTemplate, makeReport } from './fixtures.js'

describe('buildPrefilledForm [REQ-003]', () => {
  it('buildPrefilledForm_recent未指定_テンプレート既定値のまま', () => {
    // Arrange
    const template = nightShiftTemplate()
    // Act
    const form = buildPrefilledForm(template)
    // Assert
    expect(form.values.counter.unlocked).toBe(0)
    expect(form.values.meta.shift).toBe('夜勤')
  })

  it('buildPrefilledForm_承認済と提出済が混在_承認済を最優先で上書き', () => {
    // Arrange: 承認済は古い日付、提出済は新しい日付でも承認済を優先
    const template = nightShiftTemplate()
    const recent = [
      makeReport({ status: '提出済', reportDate: '2026-08-10', values: { counter: { unlocked: 7 } } }),
      makeReport({ status: '承認済', reportDate: '2026-08-01', values: { counter: { unlocked: 3 } } }),
    ]
    // Act
    const form = buildPrefilledForm(template, recent)
    // Assert 承認済(3)が採用され、提出済(7)は無視される
    expect(form.values.counter.unlocked).toBe(3)
  })

  it('buildPrefilledForm_承認済なし提出済のみ_reportDate最新を採用', () => {
    // Arrange
    const template = nightShiftTemplate()
    const recent = [
      makeReport({ status: '提出済', reportDate: '2026-08-05', values: { counter: { unlocked: 2 } } }),
      makeReport({ status: '提出済', reportDate: '2026-08-09', values: { counter: { unlocked: 9 } } }),
    ]
    // Act
    const form = buildPrefilledForm(template, recent)
    // Assert 最新(2026-08-09)の値
    expect(form.values.counter.unlocked).toBe(9)
  })

  it('buildPrefilledForm_承認済が複数_reportDate最新の承認済を採用', () => {
    // Arrange
    const template = nightShiftTemplate()
    const recent = [
      makeReport({ status: '承認済', reportDate: '2026-08-02', values: { counter: { unlocked: 4 } } }),
      makeReport({ status: '承認済', reportDate: '2026-08-08', values: { counter: { unlocked: 6 } } }),
    ]
    // Act
    const form = buildPrefilledForm(template, recent)
    // Assert
    expect(form.values.counter.unlocked).toBe(6)
  })

  it('buildPrefilledForm_下書きと差し戻しのみ_既定値のまま', () => {
    // Arrange 承認済/提出済が無い
    const template = nightShiftTemplate()
    const recent = [
      makeReport({ status: '下書き', reportDate: '2026-08-10', values: { counter: { unlocked: 11 } } }),
      makeReport({ status: '差し戻し', reportDate: '2026-08-09', values: { counter: { unlocked: 12 } } }),
    ]
    // Act
    const form = buildPrefilledForm(template, recent)
    // Assert
    expect(form.values.counter.unlocked).toBe(0)
  })

  it('buildPrefilledForm_report未収録フィールド_テンプレート既定値を保持', () => {
    // Arrange report は counter だけ持つ。meta.shift は既定値のまま
    const template = nightShiftTemplate()
    const recent = [makeReport({ status: '承認済', reportDate: '2026-08-01', values: { counter: { unlocked: 5 } } })]
    // Act
    const form = buildPrefilledForm(template, recent)
    // Assert
    expect(form.values.counter.unlocked).toBe(5)
    expect(form.values.meta.shift).toBe('夜勤')
    expect(form.values.check.aed).toBe(false)
  })

  it('buildPrefilledForm_recent空配列_既定値のまま', () => {
    // Arrange
    const template = nightShiftTemplate()
    // Act
    const form = buildPrefilledForm(template, [])
    // Assert
    expect(form.values.counter.unlocked).toBe(0)
  })
})
