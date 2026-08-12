// [REQ-018] Claude構造化レスポンス → ConstraintDef[] へのパース（純粋・決定論）
import type { ConstraintDef, ConstraintCategory, ConstraintSeverity, ConstraintKind } from '../types.js'

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** raw を制約配列へ正規化。配列 or {constraints:[...]} 以外は throw */
function toRawArray(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw
  if (isObject(raw) && Array.isArray(raw.constraints)) return raw.constraints
  throw new Error('制約パース失敗: 配列または {constraints:[...]} 形式が必要です')
}

/** 1要素を ConstraintDef へ写像。必須欠落・型不正は throw */
function toConstraintDef(item: unknown, index: number): ConstraintDef {
  if (!isObject(item)) {
    throw new Error(`制約パース失敗: 要素[${index}] がオブジェクトではありません`)
  }
  const required = ['id', 'category', 'severity', 'kind', 'params', 'label'] as const
  for (const key of required) {
    if (!(key in item) || item[key] === undefined) {
      throw new Error(`制約パース失敗: 要素[${index}] に必須フィールド '${key}' がありません`)
    }
  }
  if (typeof item.id !== 'string' || typeof item.label !== 'string') {
    throw new Error(`制約パース失敗: 要素[${index}] の id/label は文字列である必要があります`)
  }
  if (typeof item.category !== 'string' || typeof item.kind !== 'string') {
    throw new Error(`制約パース失敗: 要素[${index}] の category/kind は文字列である必要があります`)
  }
  if (item.severity !== 'hard' && item.severity !== 'soft') {
    throw new Error(`制約パース失敗: 要素[${index}] の severity は 'hard'|'soft' である必要があります`)
  }
  if (!isObject(item.params)) {
    throw new Error(`制約パース失敗: 要素[${index}] の params はオブジェクトである必要があります`)
  }

  const def: ConstraintDef = {
    id: item.id,
    category: item.category as ConstraintCategory,
    severity: item.severity as ConstraintSeverity,
    kind: item.kind as ConstraintKind,
    params: item.params,
    label: item.label,
    active: typeof item.active === 'boolean' ? item.active : true,
  }
  if (typeof item.weight === 'number') def.weight = item.weight
  if (typeof item.source === 'string') def.source = item.source
  return def
}

/**
 * [REQ-018] LLM構造化出力(配列 or {constraints:[...]})を ConstraintDef[] へ写像する。
 * active 未指定は true 補完。必須欠落/非配列/非オブジェクトは検証エラーを throw。
 */
export function parseConstraintsFromLLM(raw: unknown): ConstraintDef[] {
  return toRawArray(raw).map((item, i) => toConstraintDef(item, i))
}
