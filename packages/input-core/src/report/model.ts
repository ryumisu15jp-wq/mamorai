// [REQ-004][REQ-005][REQ-006] 日報モデル: 下書き生成 / 提出生成 / 操作数見積り（純粋）
import type {
  ReportTemplate,
  DailyReport,
  TapEstimate,
  ResolvedForm,
  FieldValue,
  Violation,
} from '../types.js'
import { validateForSubmit } from './validation.js'

/** [REQ-005] 日報生成の共通引数 */
export interface CreateReportArgs {
  id: string
  siteId: string
  templateId: string
  reporterId: string
  reportDate: string
  values: Record<string, Record<string, FieldValue>>
}

/** [REQ-004] 提出生成の引数（検証にテンプレートを要する） */
export interface CreateSubmittedReportArgs extends CreateReportArgs {
  template: ReportTemplate
}

/** [REQ-006] 提出前検証エラー（違反配列を保持） */
export class SubmitValidationError extends Error {
  readonly violations: Violation[]
  constructor(violations: Violation[]) {
    super('提出前の検証に失敗しました')
    this.name = 'SubmitValidationError'
    this.violations = violations
  }
}

/**
 * [REQ-005] 未充足でも下書きとして生成する（status='下書き'）。
 * submittedAt / approvedAt は null。
 */
export function createDraft(args: CreateReportArgs): DailyReport {
  return {
    id: args.id,
    siteId: args.siteId,
    templateId: args.templateId,
    reporterId: args.reporterId,
    reportDate: args.reportDate,
    status: '下書き',
    values: args.values,
    submittedAt: null,
    approvedAt: null,
    approverId: null,
  }
}

/**
 * [REQ-004][REQ-006] 提出時検証を通過した日報を生成する（status='提出済'）。
 * 違反があれば violations を載せて throw。text 空でも counter/select/check だけで成立（1分日報）。
 */
export function createSubmittedReport(args: CreateSubmittedReportArgs): DailyReport {
  const result = validateForSubmit(args.template, args.values)
  if (!result.ok) throw new SubmitValidationError(result.violations)
  return {
    id: args.id,
    siteId: args.siteId,
    templateId: args.templateId,
    reporterId: args.reporterId,
    reportDate: args.reportDate,
    status: '提出済',
    values: args.values,
    submittedAt: new Date().toISOString(),
    approvedAt: null,
    approverId: null,
  }
}

/**
 * [REQ-004] 1分日報の操作数（ユーザーが行うタップ数）を見積る。
 * text・time は除外（自由入力を強要しない思想）。budget=10、withinBudget=taps<=budget。
 *
 * baseline を渡すと、その基準値（＝プリフィル済みの初期フォーム値）からの差分のみを
 * 操作数として数える。プリフィルで既に入っている値はユーザー操作ではないため 0 タップ。
 * baseline 省略時は従来どおり各 field.default を基準に数える（後方互換）。
 * - counter(number): |現在値 − 基準値| を加算
 * - select: 基準値と異なれば 1（baseline 省略時は常に 1）
 * - check: 真かつ基準値と異なれば 1（baseline 省略時は真で 1）
 */
export function estimateTaps(
  form: ResolvedForm,
  template: ReportTemplate,
  baseline?: ResolvedForm['values']
): TapEstimate {
  const budget = 10
  let taps = 0
  for (const section of template.sections) {
    if (section.enabled === false) continue
    const sectionValues = form.values[section.id]
    if (sectionValues === undefined) continue
    const baseValues = baseline?.[section.id]
    for (const field of section.fields) {
      const value = sectionValues[field.key]
      const hasBase = baseValues !== undefined && field.key in baseValues
      const baseValue: FieldValue | undefined = hasBase ? baseValues[field.key] : undefined
      switch (field.type) {
        case 'number': {
          const def = typeof field.default === 'number' ? field.default : 0
          const base = hasBase && typeof baseValue === 'number' ? baseValue : def
          const cur = typeof value === 'number' ? value : base
          taps += Math.abs(cur - base)
          break
        }
        case 'select':
          if (!hasBase) taps += 1
          else if (value !== baseValue) taps += 1
          break
        case 'check':
          if (value === true && (!hasBase || value !== baseValue)) taps += 1
          break
        case 'text':
        case 'time':
          break
      }
    }
  }
  return { taps, withinBudget: taps <= budget, budget }
}
