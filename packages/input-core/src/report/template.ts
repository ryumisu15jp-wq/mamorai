// [REQ-002] テンプレート解決: ReportTemplate → ResolvedForm（純粋・非破壊）
import type { ReportTemplate, ResolvedForm, FieldDef, FieldValue } from '../types.js'

/** [REQ-002] 型別の空値（default 未指定時の初期値） */
function emptyValueFor(type: FieldDef['type']): FieldValue {
  switch (type) {
    case 'text':
      return ''
    case 'check':
      return false
    case 'number':
    case 'select':
    case 'time':
      return null
  }
}

/**
 * [REQ-002] テンプレートを描画用フォームへ解決する。
 * enabled!==false のセクションのみを対象に、各フィールドを
 * default ?? 型別空値 で初期化する。入力テンプレートは変更しない。
 */
export function resolveForm(template: ReportTemplate): ResolvedForm {
  const sections = template.sections.filter((s) => s.enabled !== false)
  const values: Record<string, Record<string, FieldValue>> = {}
  for (const section of sections) {
    const sectionValues: Record<string, FieldValue> = {}
    for (const field of section.fields) {
      sectionValues[field.key] = field.default ?? emptyValueFor(field.type)
    }
    values[section.id] = sectionValues
  }
  return { templateId: template.id, siteId: template.siteId, sections, values }
}
