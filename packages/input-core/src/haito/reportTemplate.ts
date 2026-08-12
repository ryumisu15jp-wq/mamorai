// [S5-5] 業態マスタ→構造化日報テンプレ生成（純粋）
// 業態のAI条件(特性/共通/特殊)をセクション化した日報テンプレを返す。
// インシデント×ポジションの記録はUI側で listIncidents/listPositions を用いた
// イベントログとして扱う（本テンプレは条件コンテキスト＋基本情報を担う）。
import type { BusinessType, ReportTemplate, SectionDef, FieldDef, ConditionField } from '../types.js'
import { getBusinessMaster } from './masters.js'

function toFieldDef(c: ConditionField): FieldDef {
  const base: FieldDef = { key: c.key, label: c.label, type: c.type }
  return c.type === 'select' && c.options ? { ...base, options: c.options } : base
}

/** [S5-5] 業態マスタから構造化日報テンプレ(基本情報＋特性/共通/特殊 条件)を生成 */
export function buildBusinessReportTemplate(bt: BusinessType, siteId: string): ReportTemplate {
  const master = getBusinessMaster(bt) // 未知業態はthrow
  const groups: Array<'特性' | '共通' | '特殊'> = ['特性', '共通', '特殊']
  const condSections: SectionDef[] = groups.map((g) => ({
    id: g,
    kind: 'meta',
    label: g === '特性' ? '物件特性' : g === '共通' ? '共通条件(時期・天気)' : '特殊条件',
    fields: master.conditionFields.filter((c) => c.group === g).map(toFieldDef),
  }))
  const meta: SectionDef = {
    id: 'meta',
    kind: 'meta',
    label: '基本情報',
    fields: [
      { key: 'reportDate', label: '日付', type: 'text' },
      { key: 'reporter', label: '報告者', type: 'text' },
    ],
  }
  return {
    id: `tpl-${bt}`,
    siteId,
    name: `${bt} 日報`,
    sections: [meta, ...condSections],
  }
}
