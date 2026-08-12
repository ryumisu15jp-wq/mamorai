// [S5-2] AI条件→予測入力ビルダー（純粋・決定論。未知業態throw・未知キー除外）
import type { BusinessType, PredictionInput, FieldValue } from '../types.js'
import { getBusinessMaster } from './masters.js'

/** [S5-2] 当該業態の conditionFields に定義された key のみを採用し正規化した予測入力を返す */
export function buildPredictionInput(
  bt: BusinessType,
  date: string,
  conditions: Record<string, FieldValue>,
): PredictionInput {
  const master = getBusinessMaster(bt)
  const allowed = new Set(master.conditionFields.map((f) => f.key))
  const normalized: Record<string, FieldValue> = {}
  for (const [key, value] of Object.entries(conditions)) {
    if (allowed.has(key)) {
      normalized[key] = value
    }
  }
  return { businessType: bt, date, conditions: normalized }
}
