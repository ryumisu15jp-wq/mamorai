// [REQ-006] 提出時検証: 必須 / 数値レンジ / 時刻形式 / 時刻ペア整合（純粋）
import type { ReportTemplate, ValidationResult, Violation, FieldDef } from '../types.js'

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

/** [REQ-006] 'HH:MM' を分数へ。形式不正は null */
function parseTime(value: unknown): number | null {
  if (typeof value !== 'string' || !TIME_RE.test(value)) return null
  const [h, m] = value.split(':')
  return Number(h) * 60 + Number(m)
}

/** [REQ-006] 必須未充足の判定（undefined / null / 空文字） */
function isEmpty(value: unknown): boolean {
  return value === undefined || value === null || value === ''
}

/**
 * [REQ-006] テンプレートと入力値を検証し違反配列を返す。
 * enabled!==false のセクションのみ対象。
 */
export function validateForSubmit(
  template: ReportTemplate,
  values: Record<string, Record<string, unknown>>
): ValidationResult {
  const violations: Violation[] = []

  for (const section of template.sections) {
    if (section.enabled === false) continue
    const sectionValues = values[section.id] ?? {}

    for (const field of section.fields) {
      const value = sectionValues[field.key]

      if (field.required === true && isEmpty(value)) {
        violations.push({
          sectionId: section.id,
          fieldKey: field.key,
          code: 'required',
          message: `${field.label}は必須です`,
        })
        continue
      }

      if (isEmpty(value)) continue

      if (field.type === 'number') {
        // [REQ-006] 非空だが有限数でない値は型不正（レンジ検証を素通りさせない）
        if (typeof value !== 'number' || !Number.isFinite(value)) {
          violations.push({
            sectionId: section.id,
            fieldKey: field.key,
            code: 'invalid_type',
            message: `${field.label}は数値で入力してください`,
          })
        } else if (field.range) {
          const { min, max } = field.range
          if ((min !== undefined && value < min) || (max !== undefined && value > max)) {
            violations.push({
              sectionId: section.id,
              fieldKey: field.key,
              code: 'out_of_range',
              message: `${field.label}が範囲外です`,
            })
          }
        }
      }

      if (field.type === 'time' && parseTime(value) === null) {
        violations.push({
          sectionId: section.id,
          fieldKey: field.key,
          code: 'invalid_time',
          message: `${field.label}は HH:MM 形式で入力してください`,
        })
      }

      if (field.type === 'time' && field.pairWith !== undefined) {
        pushPairViolation(section.id, field, sectionValues, violations)
      }
    }
  }

  return { ok: violations.length === 0, violations }
}

/** [REQ-006] 開始/終了ペアの順序整合（翌日跨ぎ許容ルールを含む） */
function pushPairViolation(
  sectionId: string,
  startField: FieldDef,
  sectionValues: Record<string, unknown>,
  violations: Violation[]
): void {
  if (startField.pairWith === undefined) return
  const startMin = parseTime(sectionValues[startField.key])
  const endMin = parseTime(sectionValues[startField.pairWith])
  if (startMin === null || endMin === null) return

  const invalidOrder =
    endMin === startMin || (startField.allowOvernight !== true && endMin < startMin)
  if (invalidOrder) {
    violations.push({
      sectionId,
      fieldKey: startField.key,
      code: 'time_order',
      message: '終了時刻は開始時刻より後にしてください',
    })
  }
}
