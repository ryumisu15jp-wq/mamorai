import { describe, it, expect } from 'vitest'
import { buildBusinessReportTemplate, listConditionFields, resolveForm } from '../index.js'

describe('buildBusinessReportTemplate [S5-5]', () => {
  it('商業施設_テンプレを生成_siteId/名称/条件グループを含む', () => {
    const t = buildBusinessReportTemplate('商業施設', 'siteA')
    expect(t.siteId).toBe('siteA')
    expect(t.name).toContain('商業施設')
    const ids = t.sections.map(s => s.id)
    expect(ids).toContain('meta')
    expect(ids).toContain('特性'); expect(ids).toContain('共通'); expect(ids).toContain('特殊')
  })
  it('条件フィールド総数がマスタと一致する', () => {
    const t = buildBusinessReportTemplate('興行運営', 'sB')
    const condCount = t.sections.filter(s => ['特性','共通','特殊'].includes(s.id))
      .reduce((a, s) => a + s.fields.length, 0)
    expect(condCount).toBe(listConditionFields('興行運営').length)
  })
  it('resolveFormに渡すと条件フィールドの初期値が生成される', () => {
    const t = buildBusinessReportTemplate('商業施設', 'sC')
    const form = resolveForm(t)
    expect(form.values['共通']).toBeDefined()
    expect(Object.keys(form.values['特性']).length).toBeGreaterThan(0)
  })
  it('未知業態はthrow', () => {
    expect(() => buildBusinessReportTemplate('未知業態', 's')).toThrow()
  })
})
