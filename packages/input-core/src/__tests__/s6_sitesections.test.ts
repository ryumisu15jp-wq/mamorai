import { describe, it, expect } from 'vitest'
import { tallyResponsesByType, listSitePresetKinds, getSitePreset, applyTemplateConfig, resolveForm } from '../index.js'
import type { ReportTemplate } from '../types.js'

describe('[S6-あ] tallyResponsesByType', () => {
  it('種別ごとに件数集計し件数降順・種別昇順で返す', () => {
    const rows = tallyResponsesByType([
      { incidentType: '不審者/迷惑行為' }, { incidentType: '転倒/怪我' },
      { incidentType: '不審者/迷惑行為' }, { incidentType: '' }, {},
    ])
    expect(rows).toEqual([
      { type: '不審者/迷惑行為', count: 2 },
      { type: '転倒/怪我', count: 1 },
    ])
  })
  it('空配列は空', () => { expect(tallyResponsesByType([])).toEqual([]) })
})

describe('[S6-い] 現場セクションプリセット', () => {
  it('巡回/点検/特記/継続不具合 を含む', () => {
    const k = listSitePresetKinds()
    for (const x of ['巡回','点検','特記','継続不具合']) expect(k).toContain(x)
  })
  it('点検プリセットは check セクションで AED を含む', () => {
    const s = getSitePreset('点検')
    expect(s.kind).toBe('check')
    expect(s.fields.some(f => f.label.includes('AED'))).toBe(true)
  })
  it('未知kindはthrow', () => { expect(() => getSitePreset('未知')).toThrow() })
})

describe('[S6-い] applyTemplateConfig で現場セクションを追加（非破壊）', () => {
  const base: ReportTemplate = { id:'t', siteId:'s', name:'n', sections:[
    { id:'meta', kind:'meta', label:'基本情報', fields:[] },
  ]}
  it('extraSections が追加され resolveForm に現れる', () => {
    const configured = applyTemplateConfig(base, { siteId:'s', disabledSectionIds:[], extraSections:[getSitePreset('点検'), getSitePreset('特記')] })
    const ids = configured.sections.map(x => x.id)
    expect(ids).toContain('meta')
    expect(configured.sections.length).toBe(3)
    const form = resolveForm(configured)
    expect(form.values[getSitePreset('点検').id]).toBeDefined()
  })
  it('disabledSectionIds に追加セクションIDを入れると enabled=false', () => {
    const insp = getSitePreset('点検')
    const configured = applyTemplateConfig(base, { siteId:'s', disabledSectionIds:[insp.id], extraSections:[insp] })
    expect(configured.sections.find(x => x.id === insp.id)?.enabled).toBe(false)
  })
  it('元テンプレートは不変', () => {
    const before = base.sections.length
    applyTemplateConfig(base, { siteId:'s', disabledSectionIds:[], extraSections:[getSitePreset('特記')] })
    expect(base.sections.length).toBe(before)
  })
})
