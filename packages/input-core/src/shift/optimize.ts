// [REQ-019/021] 制約付き貪欲ヒューリスティックによる下案生成＋説明（純粋・決定論）
import type {
  OptimizationContext, OptimizationResult, DraftAssignment, ConstraintDef, Staff,
} from '../types.js'
import { evaluateConstraints, toEpochDay, isoWeekKey } from './constraints.js'
import { restIntervalHours } from './shiftTimes.js'

/** staffId が qualification を保持するか */
function hasQualification(ctx: OptimizationContext, staffId: string, qualification: string): boolean {
  const s = ctx.staff.find((x) => x.id === staffId)
  return s ? s.qualifications.includes(qualification) : false
}

function paramStr(c: ConstraintDef, key: string): string | undefined {
  const v = c.params[key]
  return typeof v === 'string' ? v : undefined
}

function paramNum(c: ConstraintDef, key: string, fallback: number): number {
  const v = c.params[key]
  return typeof v === 'number' ? v : fallback
}

interface Committed {
  staffId: string
  date: string
  position: string
}

/** 同一 staff の、date に隣接（前後1日）する既存勤務（committed の position / priorShifts の workType）を返す。 */
function neighborShifts(
  staffId: string,
  date: string,
  committed: Committed[],
  ctx: OptimizationContext,
): { date: string; workType: string }[] {
  const e = toEpochDay(date)
  const out: { date: string; workType: string }[] = []
  for (const x of committed) {
    if (x.staffId === staffId && Math.abs(toEpochDay(x.date) - e) === 1) {
      out.push({ date: x.date, workType: x.position })
    }
  }
  for (const p of ctx.priorShifts ?? []) {
    if (p.staffId === staffId && Math.abs(toEpochDay(p.date) - e) === 1) {
      out.push({ date: p.date, workType: p.workType })
    }
  }
  return out
}

/** 候補 staff をこのスロットに割当てると hard 制約へ抵触するか */
function candidateHardConflict(
  staffId: string,
  date: string,
  position: string,
  committed: Committed[],
  ctx: OptimizationContext,
): boolean {
  for (const c of ctx.constraints) {
    if (c.active === false || c.severity !== 'hard') continue
    switch (c.kind) {
      case 'qualification_required': {
        const pos = paramStr(c, 'position')
        const qual = paramStr(c, 'qualification')
        if (pos === position && qual !== undefined && !hasQualification(ctx, staffId, qual)) return true
        break
      }
      case 'day_off_request': {
        if (paramStr(c, 'staffId') === staffId && paramStr(c, 'date') === date) return true
        break
      }
      case 'custom_flag': {
        if (
          paramStr(c, 'rule') === 'forbid_staff_position' &&
          paramStr(c, 'staffId') === staffId &&
          paramStr(c, 'position') === position
        ) return true
        break
      }
      case 'max_consecutive_days': {
        const days = paramNum(c, 'days', Infinity)
        const eds = [...committed.filter((x) => x.staffId === staffId).map((x) => x.date), date]
          .map(toEpochDay).sort((a, b) => a - b)
        let run = 0
        let prev = Number.NEGATIVE_INFINITY
        for (const e of eds) {
          run = e === prev + 1 ? run + 1 : 1
          prev = e
          if (run > days) return true
        }
        break
      }
      case 'max_weekly_hours': {
        const hours = paramNum(c, 'hours', Infinity)
        const hps = paramNum(c, 'hoursPerShift', 8)
        const wk = isoWeekKey(date)
        const shifts = committed.filter((x) => x.staffId === staffId && isoWeekKey(x.date) === wk).length + 1
        if (shifts * hps > hours) return true
        break
      }
      case 'min_rest_hours': {
        const minHours = paramNum(c, 'hours', 0)
        // 候補 (date, position=workType) と、同一 staff の隣接日勤務(committed / priorShifts)の
        // 勤務間隔を算出し、下限未満なら抵触。
        for (const nb of neighborShifts(staffId, date, committed, ctx)) {
          const interval = restIntervalHours(date, position, nb.date, nb.workType, ctx.shiftTimes)
          if (interval !== undefined && interval < minHours) return true
        }
        break
      }
      default:
        break
    }
  }
  return false
}

/** staffId 昇順 */
function sortStaff(staff: Staff[]): Staff[] {
  return [...staff].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

/**
 * [REQ-021] この割付で実際に検証・充足した hard 制約ラベルのみを返す。
 * candidateHardConflict が false（=抵触なし）を返した後に呼ぶ前提のため、
 * 「この割付に関連する hard 制約」は全て充足済み。関連判定は評価器と同じ観点で行う
 * （未評価/未登録/無関係な hard を"充足"と偽装しない）。
 */
function verifiedSatisfiedLabels(
  staffId: string,
  position: string,
  ctx: OptimizationContext,
): string[] {
  const labels: string[] = []
  for (const c of ctx.constraints) {
    if (c.active === false || c.severity !== 'hard') continue
    switch (c.kind) {
      case 'qualification_required':
        if (paramStr(c, 'position') === position) labels.push(c.label)
        break
      case 'day_off_request':
        if (paramStr(c, 'staffId') === staffId) labels.push(c.label)
        break
      case 'max_consecutive_days':
      case 'max_weekly_hours':
      case 'min_rest_hours':
        labels.push(c.label)
        break
      default:
        // required_headcount は集約判定・custom_flag/未登録は本割付単体で充足断定不可 → satisfied に載せない。
        break
    }
  }
  return labels
}

/**
 * [REQ-019/021] workDates×positions×requiredHeadcount の各スロットに、
 * hard 制約非抵触の eligible なスタッフを staffId 昇順で貪欲割当する下案を生成する。
 */
export function generateDraft(context: OptimizationContext, runId: string): OptimizationResult {
  const draft: DraftAssignment[] = []
  const committed: Committed[] = []
  const sortedStaff = sortStaff(context.staff)

  for (const date of context.workDates) {
    const usedToday = new Set<string>()
    for (const pos of context.positions) {
      for (let slot = 0; slot < pos.requiredHeadcount; slot++) {
        let chosen: string | null = null
        for (const s of sortedStaff) {
          if (usedToday.has(s.id)) continue
          if (candidateHardConflict(s.id, date, pos.position, committed, context)) continue
          chosen = s.id
          break
        }
        if (chosen !== null) {
          usedToday.add(chosen)
          committed.push({ staffId: chosen, date, position: pos.position })
          draft.push({
            date, position: pos.position, staffId: chosen,
            explanation: {
              satisfied: verifiedSatisfiedLabels(chosen, pos.position, context),
              reasons: [`${pos.position} に ${chosen} を貪欲選択(最小staffId・ハード制約非抵触)`],
            },
          })
        } else {
          draft.push({
            date, position: pos.position, staffId: null,
            explanation: {
              satisfied: [],
              reasons: [`${pos.position}(${date}) は資格/希望休/人数などのハード制約により割当可能な候補が不在`],
            },
          })
        }
      }
    }
  }

  const evaluation = evaluateConstraints(draft, context)
  return {
    runId,
    draft,
    evaluation,
    feasible: evaluation.feasible,
    unresolved: evaluation.hardViolations,
    status: '下案',
  }
}
