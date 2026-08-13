import { describe, it, expect } from 'vitest'
import { evaluateConstraints, getRegisteredKinds } from '../index.js'
import type { DraftAssignment, OptimizationContext, ConstraintDef } from '../index.js'

const staff = [{ id: 'u1', qualifications: [] as string[] }]
function ctx(constraints: ConstraintDef[]): OptimizationContext {
  return { siteId: 's', month: '2026-08', workDates: [], staff, positions: [], constraints }
}
function asg(date: string, position: string): DraftAssignment {
  return { date, position, staffId: 'u1', explanation: { satisfied: [], reasons: [] } }
}

describe('[会社ルール] 最適化レジストリ登録', () => {
  it('新kindが登録済み', () => {
    const k = getRegisteredKinds()
    for (const x of ['rest_day_after_long_shift', 'no_work_after_night', 'min_days_off_per_week']) {
      expect(k).toContain(x)
    }
  })

  it('夜勤の翌日に勤務→hard違反（feasible=false）', () => {
    const c: ConstraintDef = { id: 'r2', category: 'company', severity: 'hard', kind: 'no_work_after_night', params: {}, label: '夜勤後休み' }
    const r = evaluateConstraints([asg('2026-08-01', '夜勤'), asg('2026-08-02', '日勤')], ctx([c]))
    expect(r.hardViolations.some((v) => v.kind === 'no_work_after_night')).toBe(true)
    expect(r.feasible).toBe(false)
  })

  it('夜勤の翌日が非勤務なら違反なし（unevaluable化もされない）', () => {
    const c: ConstraintDef = { id: 'r2', category: 'company', severity: 'hard', kind: 'no_work_after_night', params: {}, label: '夜勤後休み' }
    const r = evaluateConstraints([asg('2026-08-01', '夜勤')], ctx([c]))
    expect(r.hardViolations.length).toBe(0)
    expect(r.feasible).toBe(true)
  })

  it('当務(25h)後に勤務→hard違反', () => {
    const c: ConstraintDef = { id: 'r1', category: 'company', severity: 'hard', kind: 'rest_day_after_long_shift', params: { minHours: 22, restDays: 1 }, label: '当務後休み' }
    const r = evaluateConstraints([asg('2026-08-01', '当務'), asg('2026-08-02', '日勤')], ctx([c]))
    expect(r.hardViolations.some((v) => v.kind === 'rest_day_after_long_shift')).toBe(true)
  })
})
