// [REQ-018/019] 拡張制約フレームワーク: 評価器レジストリ + 評価（純粋・決定論）
import type {
  ConstraintDef, ConstraintViolation, ConstraintEvalResult, OptimizationContext, DraftAssignment, Staff, WorkType,
} from '../types.js'
import { restIntervalHours } from './shiftTimes.js'

/** 評価器の型: 1制約・割付案・コンテキストを受け取り違反配列を返す */
export type ConstraintEvaluator = (
  constraint: ConstraintDef,
  assignments: DraftAssignment[],
  context: OptimizationContext
) => ConstraintViolation[]

// ── 純粋な日付ユーティリティ（'YYYY-MM-DD' 文字列を UTC 固定で決定論的に扱う） ──

/** 'YYYY-MM-DD' → エポック日（1970-01-01=0）。UTC 固定・決定論 */
export function toEpochDay(date: string): number {
  const y = Number(date.slice(0, 4))
  const m = Number(date.slice(5, 7))
  const d = Number(date.slice(8, 10))
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000)
}

/** ISO 週キー（月曜始まりの週インデックス文字列）。UTC 固定・決定論 */
export function isoWeekKey(date: string): string {
  // エポック日0(1970-01-01)は木曜。+3 で月曜始まりの週境界に整列する。
  return String(Math.floor((toEpochDay(date) + 3) / 7))
}

/** 割付のうち非null・当該スタッフの (date) 一覧 */
function datesForStaff(assignments: DraftAssignment[], staffId: string): string[] {
  return assignments.filter((a) => a.staffId === staffId).map((a) => a.date)
}

/** ctx から staff を引く */
function findStaff(ctx: OptimizationContext, staffId: string): Staff | undefined {
  return ctx.staff.find((s) => s.id === staffId)
}

function num(params: Record<string, unknown>, key: string, fallback: number): number {
  const v = params[key]
  return typeof v === 'number' ? v : fallback
}

function str(params: Record<string, unknown>, key: string): string | undefined {
  const v = params[key]
  return typeof v === 'string' ? v : undefined
}

/** 違反ファクトリ（category/severity/kind を制約から引き継ぐ） */
function violation(
  c: ConstraintDef,
  extra: Partial<ConstraintViolation> & { message: string },
): ConstraintViolation {
  const base: ConstraintViolation = {
    constraintId: c.id,
    category: c.category,
    severity: c.severity,
    kind: c.kind,
    message: extra.message,
  }
  if (extra.staffId !== undefined) base.staffId = extra.staffId
  if (extra.date !== undefined) base.date = extra.date
  if (extra.position !== undefined) base.position = extra.position
  if (c.severity === 'soft') base.penalty = c.weight ?? 1
  return base
}

// ── 組込み評価器 ──

const evalRequiredHeadcount: ConstraintEvaluator = (c, assignments, ctx) => {
  const position = str(c.params, 'position')
  const count = num(c.params, 'count', 1)
  if (position === undefined) return []
  const out: ConstraintViolation[] = []
  for (const date of ctx.workDates) {
    const filled = assignments.filter(
      (a) => a.date === date && a.position === position && a.staffId !== null,
    ).length
    if (filled < count) {
      out.push(violation(c, { date, position, message: `${position} が ${date} に人数不足(${filled}/${count})` }))
    }
  }
  return out
}

const evalQualificationRequired: ConstraintEvaluator = (c, assignments, ctx) => {
  const position = str(c.params, 'position')
  const qualification = str(c.params, 'qualification')
  if (position === undefined || qualification === undefined) return []
  const out: ConstraintViolation[] = []
  for (const a of assignments) {
    if (a.position !== position || a.staffId === null) continue
    const staff = findStaff(ctx, a.staffId)
    const held = staff ? staff.qualifications : []
    if (!held.includes(qualification)) {
      out.push(violation(c, {
        staffId: a.staffId, position, date: a.date,
        message: `${a.staffId} は ${qualification} 未保持で ${position} に割当`,
      }))
    }
  }
  return out
}

const evalMaxConsecutiveDays: ConstraintEvaluator = (c, assignments, ctx) => {
  const days = num(c.params, 'days', Infinity)
  const out: ConstraintViolation[] = []
  for (const s of ctx.staff) {
    const eds = datesForStaff(assignments, s.id).map(toEpochDay).sort((a, b) => a - b)
    let run = 0
    let prev = Number.NEGATIVE_INFINITY
    let flagged = false
    for (const e of eds) {
      run = e === prev + 1 ? run + 1 : 1
      prev = e
      if (run > days && !flagged) {
        out.push(violation(c, { staffId: s.id, message: `${s.id} が連勤上限(${days})を超過` }))
        flagged = true
      }
    }
  }
  return out
}

const evalDayOffRequest: ConstraintEvaluator = (c, assignments) => {
  const staffId = str(c.params, 'staffId')
  const date = str(c.params, 'date')
  if (staffId === undefined || date === undefined) return []
  const hit = assignments.some((a) => a.staffId === staffId && a.date === date)
  return hit
    ? [violation(c, { staffId, date, message: `${staffId} の希望休(${date})に割当` })]
    : []
}

/** スタッフ別・週別のシフト数を集計 */
function weeklyShiftCounts(assignments: DraftAssignment[], staffId: string): Map<string, number> {
  const m = new Map<string, number>()
  for (const d of datesForStaff(assignments, staffId)) {
    const k = isoWeekKey(d)
    m.set(k, (m.get(k) ?? 0) + 1)
  }
  return m
}

const evalMaxWeeklyHours: ConstraintEvaluator = (c, assignments, ctx) => {
  const hours = num(c.params, 'hours', Infinity)
  const hoursPerShift = num(c.params, 'hoursPerShift', 8)
  const out: ConstraintViolation[] = []
  for (const s of ctx.staff) {
    for (const [, shifts] of weeklyShiftCounts(assignments, s.id)) {
      if (shifts * hoursPerShift > hours) {
        out.push(violation(c, { staffId: s.id, message: `${s.id} が週労働時間上限(${hours}h)を超過` }))
        break
      }
    }
  }
  return out
}

const evalInsuranceWeeklyHours: ConstraintEvaluator = (c, assignments, ctx) => {
  const threshold = num(c.params, 'thresholdHours', 20)
  const hoursPerShift = num(c.params, 'hoursPerShift', 8)
  const out: ConstraintViolation[] = []
  for (const s of ctx.staff) {
    for (const [, shifts] of weeklyShiftCounts(assignments, s.id)) {
      if (shifts * hoursPerShift >= threshold) {
        out.push(violation(c, { staffId: s.id, message: `${s.id} が社会保険加入対象(週${threshold}h以上)` }))
        break
      }
    }
  }
  return out
}

const evalCustomFlag: ConstraintEvaluator = (c, assignments) => {
  const rule = str(c.params, 'rule')
  if (rule !== 'forbid_staff_position') return []
  const staffId = str(c.params, 'staffId')
  const position = str(c.params, 'position')
  if (staffId === undefined || position === undefined) return []
  const out: ConstraintViolation[] = []
  for (const a of assignments) {
    if (a.staffId === staffId && a.position === position) {
      out.push(violation(c, { staffId, position, date: a.date, message: `禁止組合せ ${staffId}×${position}` }))
    }
  }
  return out
}

/** スタッフの日付→WorkType マップ（割付=position を WorkType とみなす。priorShifts も併合） */
function workTypeByDate(
  assignments: DraftAssignment[],
  ctx: OptimizationContext,
  staffId: string,
): Map<string, WorkType> {
  const m = new Map<string, WorkType>()
  for (const p of ctx.priorShifts ?? []) {
    if (p.staffId === staffId) m.set(p.date, p.workType)
  }
  // 割付（position===workType 前提）を優先で上書きする。
  for (const a of assignments) {
    if (a.staffId === staffId && a.position !== undefined) m.set(a.date, a.position)
  }
  return m
}

const evalMinRestHours: ConstraintEvaluator = (c, assignments, ctx) => {
  const hours = num(c.params, 'hours', 0)
  const out: ConstraintViolation[] = []
  for (const s of ctx.staff) {
    const byDate = workTypeByDate(assignments, ctx, s.id)
    const dates = Array.from(byDate.keys()).sort((a, b) => toEpochDay(a) - toEpochDay(b))
    let prev: string | undefined
    for (const cur of dates) {
      const d = prev
      prev = cur
      if (d === undefined || toEpochDay(cur) - toEpochDay(d) !== 1) continue
      const wt = byDate.get(d)
      const nwt = byDate.get(cur)
      if (wt === undefined || nwt === undefined) continue
      const interval = restIntervalHours(d, wt, cur, nwt, ctx.shiftTimes)
      if (interval !== undefined && interval < hours) {
        out.push(violation(c, {
          staffId: s.id, date: cur,
          message: `${s.id} の勤務間隔が ${d}→${cur} で ${interval}h（下限${hours}h未満）`,
        }))
      }
    }
  }
  return out
}

// ── レジストリ ──

const registry = new Map<string, ConstraintEvaluator>([
  ['required_headcount', evalRequiredHeadcount],
  ['qualification_required', evalQualificationRequired],
  ['max_consecutive_days', evalMaxConsecutiveDays],
  ['min_rest_hours', evalMinRestHours],
  ['day_off_request', evalDayOffRequest],
  ['max_weekly_hours', evalMaxWeeklyHours],
  ['insurance_weekly_hours', evalInsuranceWeeklyHours],
  ['custom_flag', evalCustomFlag],
])

/** [REQ-018] 独自 kind の評価器を登録（拡張フレームワーク） */
export function registerConstraintEvaluator(kind: string, evaluator: ConstraintEvaluator): void {
  registry.set(kind, evaluator)
}

/** [REQ-018] 登録済み kind の一覧を返す */
export function getRegisteredKinds(): string[] {
  return Array.from(registry.keys())
}

/**
 * [REQ-018/019] 割付案を全制約で評価する。
 * active!==false の制約のみ評価。
 * 未登録 kind の扱い（フェイルセーフ）:
 *   - severity==='hard' → 評価不能を hard 違反(code:'unevaluable')として計上し feasible を落とす
 *     （評価器が無い＝充足を保証できないため、危険な配置を"合格"にしない）。
 *   - severity==='soft' → 従来どおりスキップ（安全側。ペナルティも計上しない）。
 * 違反は severity で hard/soft に分離し、totalPenalty は soft の penalty 合計。
 */
export function evaluateConstraints(
  assignments: DraftAssignment[],
  context: OptimizationContext,
): ConstraintEvalResult {
  const hardViolations: ConstraintViolation[] = []
  const softViolations: ConstraintViolation[] = []
  let totalPenalty = 0

  for (const c of context.constraints) {
    if (c.active === false) continue
    const evaluator = registry.get(c.kind)
    if (evaluator === undefined) {
      // 未登録 kind: hard は評価不能として feasible を落とす（fail-safe）。soft はスキップ。
      if (c.severity === 'hard') {
        hardViolations.push({
          constraintId: c.id,
          category: c.category,
          severity: 'hard',
          kind: c.kind,
          message: `評価器未登録のため充足を保証できません（kind=${c.kind}）`,
          code: 'unevaluable',
        })
      }
      continue
    }
    for (const v of evaluator(c, assignments, context)) {
      if (v.severity === 'hard') {
        hardViolations.push(v)
      } else {
        softViolations.push(v)
        totalPenalty += v.penalty ?? 1
      }
    }
  }

  return { hardViolations, softViolations, totalPenalty, feasible: hardViolations.length === 0 }
}
