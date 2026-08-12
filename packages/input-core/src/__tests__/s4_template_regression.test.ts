// [REQ-024] 回帰: セクションOFF が「過去日報の集計」を壊さないこと（Evaluator M2）
import { describe, it, expect } from 'vitest'
import { applyTemplateConfig, aggregateCounters, monthlySummary } from '../index.js'
import type { ReportTemplate, DailyReport, TemplateConfig } from '../types.js'

const template: ReportTemplate = {
  id: 'tpl-1',
  siteId: 'siteA',
  name: '施設警備 日報',
  sections: [
    {
      id: 'counter',
      kind: 'counter',
      label: '業務対応件数',
      fields: [
        { key: 'unlocked', label: '巡回時未施錠', type: 'number', default: 0 },
        { key: 'elv', label: 'ELV呼出', type: 'number', default: 0 },
      ],
    },
    {
      id: 'meta',
      kind: 'meta',
      label: '基本情報',
      fields: [{ key: 'note', label: '備考', type: 'text' }],
    },
  ],
}

const reports: DailyReport[] = [
  {
    id: 'r1', siteId: 'siteA', templateId: 'tpl-1', reporterId: 'u1',
    reportDate: '2026-08-01', status: '承認済',
    values: { counter: { unlocked: 2, elv: 1 }, meta: { note: 'x' } },
  },
  {
    id: 'r2', siteId: 'siteA', templateId: 'tpl-1', reporterId: 'u1',
    reportDate: '2026-08-02', status: '承認済',
    values: { counter: { unlocked: 3, elv: 0 }, meta: { note: 'y' } },
  },
]

describe('REQ-024回帰_セクションOFF_過去集計を破壊しない', () => {
  it('applyTemplateConfigでcounterをOFFにしても既存日報の集計値は不変', () => {
    // Arrange: OFF 前の集計を確定
    const before = aggregateCounters(reports)
    const beforeSummary = monthlySummary(reports)

    // Act: counter セクションを OFF にした新テンプレを適用
    const config: TemplateConfig = { siteId: 'siteA', disabledSectionIds: ['counter'] }
    const configured = applyTemplateConfig(template, config)
    const after = aggregateCounters(reports)
    const afterSummary = monthlySummary(reports)

    // Assert: 集計は日報の values を読むため template.enabled と独立＝不変
    expect(after).toEqual(before)
    expect(after).toEqual({ unlocked: 5, elv: 1 })
    expect(afterSummary).toEqual(beforeSummary)
    // 新テンプレでは counter が enabled=false
    expect(configured.sections.find(s => s.id === 'counter')?.enabled).toBe(false)
  })

  it('元テンプレート・元セクションは破壊されない（参照非共有）', () => {
    // Arrange
    const originalEnabled = template.sections.map(s => s.enabled)
    // Act
    applyTemplateConfig(template, { siteId: 'siteA', disabledSectionIds: ['counter', 'meta'] })
    // Assert: 元は未変更（enabled は元のまま undefined）
    expect(template.sections.map(s => s.enabled)).toEqual(originalEnabled)
    expect(template.sections[0]?.enabled).toBeUndefined()
  })
})
