// Sprint1 Evaluator 指摘 H-1 / H-2 の回帰テスト
import { describe, it, expect } from 'vitest'
import {
  validateForSubmit,
  estimateTaps,
  resolveForm,
  SubmitValidationError,
  createSubmittedReport,
} from '../index.js'
import type { ReportTemplate } from '../types.js'

const numTemplate: ReportTemplate = {
  id: 't-num',
  siteId: 's1',
  name: 'num',
  sections: [
    {
      id: 'sec',
      kind: 'counter',
      label: 'カウンタ',
      fields: [
        { key: 'cnt', label: '件数', type: 'number', range: { min: 0, max: 5 }, default: 0 },
        { key: 'sel', label: '区分', type: 'select', options: ['A', 'B'], default: null },
        { key: 'chk', label: '確認', type: 'check', default: false },
      ],
    },
  ],
}

describe('H-2 validateForSubmit_非数値のnumberフィールド_invalid_typeを返す', () => {
  it('numberに文字列が入るとinvalid_typeでレンジを素通りしない', () => {
    // Arrange
    const values = { sec: { cnt: 'あ' as unknown as number, sel: 'A', chk: false } }
    // Act
    const res = validateForSubmit(numTemplate, values)
    // Assert
    expect(res.ok).toBe(false)
    expect(res.violations.some(v => v.fieldKey === 'cnt' && v.code === 'invalid_type')).toBe(true)
    expect(res.violations.some(v => v.code === 'out_of_range')).toBe(false)
  })

  it('numberにNaNが入るとinvalid_type', () => {
    const values = { sec: { cnt: Number.NaN, sel: 'A', chk: false } }
    const res = validateForSubmit(numTemplate, values)
    expect(res.violations.some(v => v.fieldKey === 'cnt' && v.code === 'invalid_type')).toBe(true)
  })

  it('正しい数値は違反なし', () => {
    const values = { sec: { cnt: 3, sel: 'A', chk: false } }
    const res = validateForSubmit(numTemplate, values)
    expect(res.ok).toBe(true)
  })
})

describe('H-1 estimateTaps_baseline指定_プリフィル値は操作数に数えない', () => {
  it('プリフィル済みフォームをbaselineに渡すと初期状態は0タップ', () => {
    // Arrange: default と異なる値でプリフィルされたフォーム
    const form = resolveForm(numTemplate)
    form.values.sec = { cnt: 3, sel: 'B', chk: true }
    const baseline = { sec: { cnt: 3, sel: 'B', chk: true } }
    // Act
    const tap = estimateTaps(form, numTemplate, baseline)
    // Assert
    expect(tap.taps).toBe(0)
    expect(tap.withinBudget).toBe(true)
  })

  it('baselineから1件カウンタを増やすと1タップ・budget内', () => {
    const form = resolveForm(numTemplate)
    form.values.sec = { cnt: 4, sel: 'B', chk: true }
    const baseline = { sec: { cnt: 3, sel: 'B', chk: true } }
    const tap = estimateTaps(form, numTemplate, baseline)
    expect(tap.taps).toBe(1)
    expect(tap.withinBudget).toBe(true)
  })

  it('baseline省略時は従来どおりdefault基準で数える（後方互換）', () => {
    const form = resolveForm(numTemplate)
    form.values.sec = { cnt: 2, sel: 'A', chk: false }
    const tap = estimateTaps(form, numTemplate)
    // counter:|2-0|=2 + select:+1(base省略) + check:false→0 = 3
    expect(tap.taps).toBe(3)
  })
})

describe('SubmitValidationError_export_instanceofで判別できる', () => {
  it('提出検証失敗時に throw され instanceof で捕捉できる', () => {
    // Arrange: 必須違反を起こすテンプレート
    const t: ReportTemplate = {
      id: 't',
      siteId: 's',
      name: 'n',
      sections: [
        { id: 'a', kind: 'meta', label: 'm', fields: [{ key: 'name', label: '氏名', type: 'text', required: true }] },
      ],
    }
    // Act / Assert
    try {
      createSubmittedReport({
        id: 'r', siteId: 's', templateId: 't', reporterId: 'u', reportDate: '2026-08-10',
        values: { a: { name: '' } }, template: t,
      })
      expect.unreachable('should throw')
    } catch (e) {
      expect(e).toBeInstanceOf(SubmitValidationError)
      expect((e as SubmitValidationError).violations.length).toBeGreaterThan(0)
    }
  })
})
