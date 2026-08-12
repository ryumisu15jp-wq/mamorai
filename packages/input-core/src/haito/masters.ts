// [S5-1] 業態マスタのアクセサ（純粋・決定論。BUSINESS_MASTERS をデータ源とする）
import type { BusinessType, BusinessMaster, ConditionField } from '../types.js'
import { BUSINESS_MASTERS } from './masters-data.js'

/** [S5-1] 指定業態の業態マスタを返す（未知業態は throw） */
export function getBusinessMaster(bt: BusinessType): BusinessMaster {
  const master = BUSINESS_MASTERS[bt]
  if (master === undefined) {
    throw new Error(`UnknownBusinessType: ${bt}`)
  }
  return master
}

/** [S5-1] 指定業態のインシデント一覧を返す（未知業態は throw） */
export function listIncidents(bt: BusinessType): string[] {
  return getBusinessMaster(bt).incidents
}

/** [S5-1] 指定業態のポジション一覧を返す（未知業態は throw） */
export function listPositions(bt: BusinessType): string[] {
  return getBusinessMaster(bt).positions
}

/** [S5-1] 指定業態のAI条件フィールド一覧を返す（未知業態は throw） */
export function listConditionFields(bt: BusinessType): ConditionField[] {
  return getBusinessMaster(bt).conditionFields
}

/** [S5-1] 登録済みの全業態キーを返す */
export function listBusinessTypes(): string[] {
  return Object.keys(BUSINESS_MASTERS)
}
