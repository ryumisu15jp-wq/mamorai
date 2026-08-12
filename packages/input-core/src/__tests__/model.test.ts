// [REQ-005] createDraft / [REQ-004][REQ-006] createSubmittedReport
import { describe, it, expect } from 'vitest'
import { createDraft, createSubmittedReport } from '../index.js'
import { minuteTemplate } from './fixtures.js'

const baseArgs = {
  id: 'rep-001',
  siteId: 'site-m',
  templateId: 'tmpl-min',
  reporterId: 'user-1',
  reportDate: '2026-08-11',
}

describe('createDraft [REQ-005]', () => {
  it('createDraft_必須未充足でも_status下書きで生成する', () => {
    // Arrange 必須 shift を空にした部分入力
    const values = { meta: { shift: '', note: '' }, counter: {}, check: {} }
    // Act
    const report = createDraft({ ...baseArgs, values })
    // Assert
    expect(report.status).toBe('下書き')
    expect(report.values).toEqual(values)
  })

  it('createDraft_submittedAtとapprovedAt_nullである', () => {
    // Arrange
    const values = { meta: { shift: '夜勤' } }
    // Act
    const report = createDraft({ ...baseArgs, values })
    // Assert
    expect(report.submittedAt).toBeNull()
    expect(report.approvedAt).toBeNull()
  })

  it('createDraft_識別情報_引数を保持する', () => {
    // Arrange
    const values = { meta: { shift: '夜勤' } }
    // Act
    const report = createDraft({ ...baseArgs, values })
    // Assert
    expect(report.id).toBe('rep-001')
    expect(report.siteId).toBe('site-m')
    expect(report.reporterId).toBe('user-1')
    expect(report.reportDate).toBe('2026-08-11')
  })
})

describe('createSubmittedReport [REQ-004][REQ-006]', () => {
  it('createSubmittedReport_1分日報_textを空にしcounterselectcheckのみで成功する', () => {
    // Arrange 自由入力(note)は空、counter/select/check のみ設定
    const template = minuteTemplate()
    const values = { meta: { shift: '夜勤', note: '' }, counter: { unlocked: 3 }, check: { aed: true } }
    // Act
    const report = createSubmittedReport({ ...baseArgs, template, values })
    // Assert
    expect(report.status).toBe('提出済')
    expect(typeof report.submittedAt).toBe('string')
    expect(report.submittedAt).not.toBeNull()
  })

  it('createSubmittedReport_submittedAtがISO文字列_パース可能である', () => {
    // Arrange
    const template = minuteTemplate()
    const values = { meta: { shift: '夜勤', note: '' }, counter: { unlocked: 0 }, check: { aed: false } }
    // Act
    const report = createSubmittedReport({ ...baseArgs, template, values })
    // Assert
    expect(Number.isNaN(Date.parse(report.submittedAt as string))).toBe(false)
  })

  it('createSubmittedReport_必須欠落_violationsを載せてthrowする', () => {
    // Arrange 必須 shift を空に
    const template = minuteTemplate()
    const values = { meta: { shift: '', note: '' }, counter: { unlocked: 1 }, check: { aed: false } }
    // Act & Assert
    let caught: unknown
    try {
      createSubmittedReport({ ...baseArgs, template, values })
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(Error)
    const violations = (caught as { violations?: unknown }).violations as Array<{ code: string; fieldKey: string }>
    expect(Array.isArray(violations)).toBe(true)
    expect(violations.some((v) => v.code === 'required' && v.fieldKey === 'shift')).toBe(true)
  })
})
