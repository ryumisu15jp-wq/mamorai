// [REQ-024][S6] テンプレートのセクションON/OFF＋現場追加セクションの適用（非破壊・過去集計に影響しない）
import type { ReportTemplate, TemplateConfig, SectionDef } from '../types.js'

/**
 * [REQ-024] disabledSectionIds のセクションを enabled=false にし、
 * [S6] config.extraSections（現場が設定で追加する巡回/点検/特記/継続不具合 等）を末尾に追加した
 * 新 ReportTemplate を返す。元 template・元 section は不変（非破壊コピー）。存在しない ID は無視。
 * extraSections も disabledSectionIds に含まれれば enabled=false で追加される。
 */
export function applyTemplateConfig(
  template: ReportTemplate,
  config: TemplateConfig,
): ReportTemplate {
  const disabled = new Set(config.disabledSectionIds)
  const existingIds = new Set(template.sections.map((s) => s.id))
  const base: SectionDef[] = template.sections.map((s) =>
    disabled.has(s.id) ? { ...s, enabled: false } : { ...s },
  )
  const extras: SectionDef[] = (config.extraSections ?? [])
    .filter((s) => !existingIds.has(s.id)) // 既存と重複するIDは追加しない（非破壊）
    .map((s) => ({ ...s, enabled: !disabled.has(s.id) }))
  return { ...template, sections: [...base, ...extras] }
}
