// [REQ-003] プリフィル: 直近日報から解決済みフォームの初期値を上書き（純粋）
import type { ReportTemplate, DailyReport, ResolvedForm } from '../types.js'
import { resolveForm } from './template.js'

/** [REQ-003] reportDate 最新の1件を選ぶ（同値時は先勝ち＝安定） */
function latestByDate(reports: DailyReport[]): DailyReport | undefined {
  let picked: DailyReport | undefined
  for (const r of reports) {
    if (picked === undefined || r.reportDate > picked.reportDate) {
      picked = r
    }
  }
  return picked
}

/**
 * [REQ-003] resolveForm を基に、recent から
 * 承認済（最優先・最新）→ 無ければ提出済（最新）の1件を選び、
 * その values に存在するキーのみをフォーム初期値へ上書きする。
 */
export function buildPrefilledForm(
  template: ReportTemplate,
  recent?: DailyReport[]
): ResolvedForm {
  const form = resolveForm(template)
  if (recent === undefined || recent.length === 0) return form

  const approved = latestByDate(recent.filter((r) => r.status === '承認済'))
  const submitted = latestByDate(recent.filter((r) => r.status === '提出済'))
  const source = approved ?? submitted
  if (source === undefined) return form

  for (const [sectionId, sectionValues] of Object.entries(source.values)) {
    const target = form.values[sectionId]
    if (target === undefined) continue
    for (const [key, value] of Object.entries(sectionValues)) {
      if (Object.prototype.hasOwnProperty.call(target, key)) {
        target[key] = value
      }
    }
  }
  return form
}
