// [REQ-006] validateForSubmit: 提出時検証（必須/範囲/時刻形式/時刻整合）を境界値で検証
import { describe, it, expect } from 'vitest'
import { validateForSubmit } from '../index.js'
import { nightShiftTemplate, dayPairTemplate } from './fixtures.js'

/** nightShiftTemplate に対する正常系の値（overnight 許容） */
function validNightValues(): Record<string, Record<string, unknown>> {
  return {
    meta: { reporterName: '', shift: '夜勤' },
    kinmu: { start: '21:00', end: '09:00' },
    counter: { unlocked: 0, elvCall: 0, cardReg: 0 },
    check: { aed: false, fire: false },
    gate: { handover: false, note: '' },
  }
}

describe('validateForSubmit [REQ-006] 正常系', () => {
  it('validateForSubmit_全項目適正_ok_trueで違反ゼロ', () => {
    // Arrange
    const template = nightShiftTemplate()
    const values = validNightValues()
    // Act
    const result = validateForSubmit(template, values)
    // Assert
    expect(result.ok).toBe(true)
    expect(result.violations).toEqual([])
  })
})

describe('validateForSubmit [REQ-006] required', () => {
  it('validateForSubmit_必須select空文字_required違反', () => {
    // Arrange
    const template = nightShiftTemplate()
    const values = validNightValues()
    values.meta.shift = ''
    // Act
    const result = validateForSubmit(template, values)
    // Assert
    expect(result.ok).toBe(false)
    expect(result.violations).toContainEqual(
      expect.objectContaining({ sectionId: 'meta', fieldKey: 'shift', code: 'required' })
    )
  })

  it('validateForSubmit_必須time_null_required違反', () => {
    // Arrange
    const template = nightShiftTemplate()
    const values = validNightValues()
    values.kinmu.start = null
    // Act
    const result = validateForSubmit(template, values)
    // Assert
    expect(result.violations).toContainEqual(
      expect.objectContaining({ sectionId: 'kinmu', fieldKey: 'start', code: 'required' })
    )
  })

  it('validateForSubmit_必須undefined_required違反', () => {
    // Arrange
    const template = nightShiftTemplate()
    const values = validNightValues()
    delete (values.meta as Record<string, unknown>).shift
    // Act
    const result = validateForSubmit(template, values)
    // Assert
    expect(result.violations).toContainEqual(
      expect.objectContaining({ sectionId: 'meta', fieldKey: 'shift', code: 'required' })
    )
  })

  it('validateForSubmit_任意textが空_required違反にしない', () => {
    // Arrange note は required:false
    const template = nightShiftTemplate()
    const values = validNightValues()
    values.gate.note = ''
    // Act
    const result = validateForSubmit(template, values)
    // Assert
    expect(result.violations.some((v) => v.fieldKey === 'note')).toBe(false)
  })
})

describe('validateForSubmit [REQ-006] out_of_range（境界値）', () => {
  it('validateForSubmit_数値がmax超過_out_of_range違反', () => {
    // Arrange range max=99
    const template = nightShiftTemplate()
    const values = validNightValues()
    values.counter.unlocked = 100
    // Act
    const result = validateForSubmit(template, values)
    // Assert
    expect(result.violations).toContainEqual(
      expect.objectContaining({ sectionId: 'counter', fieldKey: 'unlocked', code: 'out_of_range' })
    )
  })

  it('validateForSubmit_数値がmax境界ちょうど_違反にしない', () => {
    // Arrange max=99 は許容
    const template = nightShiftTemplate()
    const values = validNightValues()
    values.counter.unlocked = 99
    // Act
    const result = validateForSubmit(template, values)
    // Assert
    expect(result.violations.some((v) => v.fieldKey === 'unlocked')).toBe(false)
  })

  it('validateForSubmit_数値がmin境界ちょうど_違反にしない', () => {
    // Arrange min=0 は許容
    const template = nightShiftTemplate()
    const values = validNightValues()
    values.counter.unlocked = 0
    // Act
    const result = validateForSubmit(template, values)
    // Assert
    expect(result.violations.some((v) => v.fieldKey === 'unlocked')).toBe(false)
  })
})

describe('validateForSubmit [REQ-006] invalid_time', () => {
  it('validateForSubmit_時刻が時範囲外_invalid_time違反', () => {
    // Arrange 25:00 は 00:00-23:59 外
    const template = nightShiftTemplate()
    const values = validNightValues()
    values.kinmu.end = '25:00'
    // Act
    const result = validateForSubmit(template, values)
    // Assert
    expect(result.violations).toContainEqual(
      expect.objectContaining({ sectionId: 'kinmu', fieldKey: 'end', code: 'invalid_time' })
    )
  })

  it('validateForSubmit_時刻が分範囲外_invalid_time違反', () => {
    // Arrange 09:60 は分が不正
    const template = nightShiftTemplate()
    const values = validNightValues()
    values.kinmu.end = '09:60'
    // Act
    const result = validateForSubmit(template, values)
    // Assert
    expect(result.violations.some((v) => v.fieldKey === 'end' && v.code === 'invalid_time')).toBe(true)
  })

  it('validateForSubmit_時刻が非HHMM形式_invalid_time違反', () => {
    // Arrange
    const template = nightShiftTemplate()
    const values = validNightValues()
    values.kinmu.end = 'あさ'
    // Act
    const result = validateForSubmit(template, values)
    // Assert
    expect(result.violations.some((v) => v.fieldKey === 'end' && v.code === 'invalid_time')).toBe(true)
  })

  it('validateForSubmit_時刻境界0000と2359_invalid_timeにしない', () => {
    // Arrange dayPair(overnight不可)で 00:00→23:59 は形式的に正しく順序も正
    const template = dayPairTemplate()
    const values = { kinmu: { start: '00:00', end: '23:59' } }
    // Act
    const result = validateForSubmit(template, values)
    // Assert
    expect(result.violations.some((v) => v.code === 'invalid_time')).toBe(false)
    expect(result.ok).toBe(true)
  })
})

describe('validateForSubmit [REQ-006] time_order（ペア整合）', () => {
  it('validateForSubmit_日勤で終了が開始より前_time_order違反', () => {
    // Arrange allowOvernight=false, end(09:00) < start(18:00)
    const template = dayPairTemplate()
    const values = { kinmu: { start: '18:00', end: '09:00' } }
    // Act
    const result = validateForSubmit(template, values)
    // Assert
    expect(result.violations).toContainEqual(
      expect.objectContaining({ sectionId: 'kinmu', fieldKey: 'start', code: 'time_order' })
    )
  })

  it('validateForSubmit_日勤で終了が開始より後_time_order違反にしない', () => {
    // Arrange 正順
    const template = dayPairTemplate()
    const values = { kinmu: { start: '09:00', end: '18:00' } }
    // Act
    const result = validateForSubmit(template, values)
    // Assert
    expect(result.violations.some((v) => v.code === 'time_order')).toBe(false)
    expect(result.ok).toBe(true)
  })

  it('validateForSubmit_夜勤allowOvernightで翌日跨ぎ_time_order違反にしない', () => {
    // Arrange allowOvernight=true, 21:00→09:00
    const template = nightShiftTemplate()
    const values = validNightValues()
    // Act
    const result = validateForSubmit(template, values)
    // Assert
    expect(result.violations.some((v) => v.code === 'time_order')).toBe(false)
  })

  it('validateForSubmit_開始と終了が同一_overnight許容でもtime_order違反', () => {
    // Arrange end===start は常に違反
    const template = nightShiftTemplate()
    const values = validNightValues()
    values.kinmu.start = '21:00'
    values.kinmu.end = '21:00'
    // Act
    const result = validateForSubmit(template, values)
    // Assert
    expect(result.violations).toContainEqual(
      expect.objectContaining({ sectionId: 'kinmu', fieldKey: 'start', code: 'time_order' })
    )
  })

  it('validateForSubmit_開始と終了が同一_日勤でもtime_order違反', () => {
    // Arrange
    const template = dayPairTemplate()
    const values = { kinmu: { start: '09:00', end: '09:00' } }
    // Act
    const result = validateForSubmit(template, values)
    // Assert
    expect(result.violations.some((v) => v.code === 'time_order')).toBe(true)
  })
})
