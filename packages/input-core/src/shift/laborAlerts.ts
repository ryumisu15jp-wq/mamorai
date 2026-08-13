// [労務] シフト表(ShiftGrid)から法令リスク/労務アラートを直接算出（純粋・決定論）。
// gulfnet 労務アラート系の中核。既存資産を再利用:
//   - getShiftTime/parseHm/restIntervalHours（勤務時刻・インターバル）
//   - toEpochDay/isoWeekKey（連勤・週集計）
// 拡張制約(ConstraintDef)の params から上限を読む。カテゴリ/severity は制約に従う。
import type {
  ShiftGrid, ShiftCell, Staff, ConstraintDef, ConstraintCategory, ConstraintSeverity, WorkType, ShiftTime,
} from '../types.js'
import { toEpochDay, isoWeekKey } from './constraints.js'
import { getShiftTime, parseHm, restIntervalHours } from './shiftTimes.js'

export interface LaborAlert {
  category: ConstraintCategory
  severity: ConstraintSeverity
  kind: string
  staffId: string
  staffName?: string
  date?: string
  week?: string
  message: string
  value: number
  limit: number
}

export interface LaborAlertSummary {
  hard: number
  soft: number
  total: number
  byCategory: Record<string, number>
}

/** WorkType の勤務時間(h)。勤務なし区分は0。 */
export function shiftDurationHours(wt: WorkType, overrides?: Record<WorkType, ShiftTime>): number {
  const st = getShiftTime(wt, overrides)
  if (st === undefined) return 0
  const d = parseHm(st.end) + (st.crossesMidnight === true ? 24 : 0) - parseHm(st.start)
  return Number.isFinite(d) && d > 0 ? d : 0
}

function num(v: unknown, dflt: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : dflt
}

function isWorking(wt: WorkType, overrides?: Record<WorkType, ShiftTime>): boolean {
  return getShiftTime(wt, overrides) !== undefined
}

/**
 * [労務] シフト表を法令/労務の観点で評価しアラート一覧を返す。
 * 対応: max_consecutive_days(連勤上限) / min_rest_hours(勤務間隔) / max_weekly_hours(週労働上限) /
 *       insurance_weekly_hours(社保加入目安)。active!==false の制約のみ。
 */
export function evaluateLaborAlerts(
  grid: ShiftGrid,
  staff: Staff[],
  constraints: ConstraintDef[],
  overrides?: Record<WorkType, ShiftTime>,
): LaborAlert[] {
  const alerts: LaborAlert[] = []
  const nameOf = new Map(staff.map((s) => [s.id, s.name]))
  const active = constraints.filter((c) => c.active !== false)
  const byKind = (k: string): ConstraintDef | undefined => active.find((c) => c.kind === k)

  // スタッフごとに日付昇順のセルを用意
  const byStaff = new Map<string, ShiftCell[]>()
  for (const cell of grid.cells) {
    const arr = byStaff.get(cell.staffId) ?? []
    arr.push(cell)
    byStaff.set(cell.staffId, arr)
  }

  const cMaxConsec = byKind('max_consecutive_days')
  const cMinRest = byKind('min_rest_hours')
  const cWeekly = byKind('max_weekly_hours')
  const cInsurance = byKind('insurance_weekly_hours')

  for (const [staffId, cellsRaw] of byStaff) {
    const cells = [...cellsRaw].sort((a, b) => toEpochDay(a.date) - toEpochDay(b.date))
    const name = nameOf.get(staffId)

    // 連勤上限
    if (cMaxConsec !== undefined) {
      const limit = num(cMaxConsec.params.days, 6)
      let run = 0
      let prevEpoch: number | null = null
      for (const c of cells) {
        const working = isWorking(c.workType, overrides)
        const e = toEpochDay(c.date)
        if (working && prevEpoch !== null && e - prevEpoch === 1) run += 1
        else if (working) run = 1
        else run = 0
        prevEpoch = working ? e : null
        if (working && run > limit) {
          alerts.push({
            category: cMaxConsec.category, severity: cMaxConsec.severity, kind: 'max_consecutive_days',
            staffId, staffName: name, date: c.date,
            message: `連勤 ${run}日目（上限${limit}日超過）`, value: run, limit,
          })
        }
      }
    }

    // 勤務間隔(労基インターバル)
    if (cMinRest !== undefined) {
      const limit = num(cMinRest.params.hours, 11)
      for (let i = 1; i < cells.length; i++) {
        const a = cells[i - 1]!
        const b = cells[i]!
        const gap = restIntervalHours(a.date, a.workType, b.date, b.workType, overrides)
        if (gap !== undefined && gap < limit) {
          alerts.push({
            category: cMinRest.category, severity: cMinRest.severity, kind: 'min_rest_hours',
            staffId, staffName: name, date: b.date,
            message: `勤務間隔 ${gap}h（基準${limit}h未満）`, value: gap, limit,
          })
        }
      }
    }

    // 週労働時間（上限 / 社保加入目安）。週ラベルは週内の最初の日付で可読化。
    if (cWeekly !== undefined || cInsurance !== undefined) {
      const weekHours = new Map<string, { hours: number; label: string }>()
      for (const c of cells) {
        const h = shiftDurationHours(c.workType, overrides)
        if (h <= 0) continue
        const wk = isoWeekKey(c.date)
        const cur = weekHours.get(wk)
        if (cur === undefined) weekHours.set(wk, { hours: h, label: `${c.date}の週` })
        else cur.hours += h
      }
      for (const [, wkData] of weekHours) {
        const hours = wkData.hours
        const wk = wkData.label
        if (cWeekly !== undefined) {
          const limit = num(cWeekly.params.hours, 40)
          if (hours > limit) {
            alerts.push({
              category: cWeekly.category, severity: cWeekly.severity, kind: 'max_weekly_hours',
              staffId, staffName: name, week: wk,
              message: `週労働 ${hours}h（上限${limit}h超過）`, value: hours, limit,
            })
          }
        }
        if (cInsurance !== undefined) {
          const th = num(cInsurance.params.thresholdHours ?? cInsurance.params.hours, 20)
          if (hours >= th) {
            alerts.push({
              category: cInsurance.category, severity: cInsurance.severity, kind: 'insurance_weekly_hours',
              staffId, staffName: name, week: wk,
              message: `週${hours}h（社保加入目安${th}h以上）`, value: hours, limit: th,
            })
          }
        }
      }
    }
  }

  // 安定した並び: hard→soft, 次にstaffId, date/week
  const rank = (a: LaborAlert): string => `${a.severity === 'hard' ? 0 : 1}|${a.staffId}|${a.date ?? a.week ?? ''}|${a.kind}`
  return alerts.sort((x, y) => rank(x).localeCompare(rank(y)))
}

/** アラートの集計（hard/soft件数・カテゴリ別件数）。 */
export function summarizeLaborAlerts(alerts: LaborAlert[]): LaborAlertSummary {
  const byCategory: Record<string, number> = {}
  let hard = 0
  let soft = 0
  for (const a of alerts) {
    if (a.severity === 'hard') hard += 1
    else soft += 1
    byCategory[a.category] = (byCategory[a.category] ?? 0) + 1
  }
  return { hard, soft, total: alerts.length, byCategory }
}
