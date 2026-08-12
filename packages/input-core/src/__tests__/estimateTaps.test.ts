// [REQ-004] estimateTaps: 操作回数の簡易モデルと budget 判定（NFR-02: budget=10）
import { describe, it, expect } from 'vitest'
import { estimateTaps } from '../index.js'
import { counterOnlyTemplate, mixedTapTemplate, makeForm } from './fixtures.js'

describe('estimateTaps [REQ-004]', () => {
  it('estimateTaps_budget既定値_10である', () => {
    // Arrange
    const template = counterOnlyTemplate()
    const form = makeForm(template, { c: { n: 0 } })
    // Act
    const est = estimateTaps(form, template)
    // Assert
    expect(est.budget).toBe(10)
  })

  it('estimateTaps_counterはdefaultからの差分絶対値をタップ換算', () => {
    // Arrange default 0 → 値 7 は 7 タップ
    const template = counterOnlyTemplate()
    const form = makeForm(template, { c: { n: 7 } })
    // Act
    const est = estimateTaps(form, template)
    // Assert
    expect(est.taps).toBe(7)
    expect(est.withinBudget).toBe(true)
  })

  it('estimateTaps_タップ数がbudget境界ちょうど_withinBudgetはtrue', () => {
    // Arrange 10 == budget
    const template = counterOnlyTemplate()
    const form = makeForm(template, { c: { n: 10 } })
    // Act
    const est = estimateTaps(form, template)
    // Assert 境界: taps <= budget
    expect(est.taps).toBe(10)
    expect(est.withinBudget).toBe(true)
  })

  it('estimateTaps_タップ数がbudget超過_withinBudgetはfalse', () => {
    // Arrange 11 > budget
    const template = counterOnlyTemplate()
    const form = makeForm(template, { c: { n: 11 } })
    // Act
    const est = estimateTaps(form, template)
    // Assert
    expect(est.taps).toBe(11)
    expect(est.withinBudget).toBe(false)
  })

  it('estimateTaps_text_timeは加算しない', () => {
    // Arrange counter=0 のみ、text/time に値があっても 0 タップ
    const template = mixedTapTemplate()
    const form = makeForm(template, { c: { n: 0 }, s: { sel: 'a', chk: false, txt: '長文の報告事項', tm: '09:00' } })
    // Act
    const est = estimateTaps(form, template)
    // Assert select=1 のみ（chk=false=0, txt/tm=0, counter=0）
    expect(est.taps).toBe(1)
  })

  it('estimateTaps_1分日報シナリオ_少数操作でwithinBudgetはtrue', () => {
    // Arrange counter 2 + select 1 + check true 1 = 4
    const template = mixedTapTemplate()
    const form = makeForm(template, { c: { n: 2 }, s: { sel: 'b', chk: true, txt: '', tm: null } })
    // Act
    const est = estimateTaps(form, template)
    // Assert
    expect(est.withinBudget).toBe(true)
    expect(est.taps).toBeLessThanOrEqual(10)
  })

  it('estimateTaps_過大操作シナリオ_withinBudgetはfalse', () => {
    // Arrange counter 15 だけで budget 超過
    const template = mixedTapTemplate()
    const form = makeForm(template, { c: { n: 15 }, s: { sel: 'b', chk: true, txt: '', tm: null } })
    // Act
    const est = estimateTaps(form, template)
    // Assert
    expect(est.withinBudget).toBe(false)
  })
})
