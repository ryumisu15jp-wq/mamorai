import { describe, it, expect } from 'vitest'
import { evaluateLaborAlerts, summarizeLaborAlerts, shiftDurationHours } from '../index.js'
import type { ShiftGrid, Staff, ConstraintDef } from '../index.js'

const staff: Staff[] = [{ id: 'u1', name: '三角', qualifications: [] }]

function grid(cells: { date: string; workType: string }[]): ShiftGrid {
  return { siteId: 's', month: '2026-08', cells: cells.map((c) => ({ staffId: 'u1', date: c.date, workType: c.workType })) }
}

const C = {
  consec: { id: 'c1', category: 'legal', severity: 'hard', kind: 'max_consecutive_days', params: { days: 6 }, label: '連勤上限' },
  rest: { id: 'c2', category: 'legal', severity: 'hard', kind: 'min_rest_hours', params: { hours: 11 }, label: '勤務間隔' },
  weekly: { id: 'c3', category: 'legal', severity: 'soft', kind: 'max_weekly_hours', params: { hours: 40 }, label: '週上限', weight: 5 },
  insurance: { id: 'c4', category: 'insurance', severity: 'soft', kind: 'insurance_weekly_hours', params: { hours: 20 }, label: '社保', weight: 1 },
  // 会社ルール（人事総務部）
  restAfterLong: { id: 'r1', category: 'company', severity: 'hard', kind: 'rest_day_after_long_shift', params: { minHours: 22, restDays: 1 }, label: '当務後1日空ける' },
  noWorkAfterNight: { id: 'r2', category: 'company', severity: 'hard', kind: 'no_work_after_night', params: {}, label: '夜勤後は休み' },
  rest9: { id: 'r3', category: 'company', severity: 'hard', kind: 'min_rest_hours', params: { hours: 9 }, label: '9hインターバル' },
  minOff: { id: 'r4', category: 'company', severity: 'soft', kind: 'min_days_off_per_week', params: { days: 1 }, label: '週休配慮', weight: 3 },
} as unknown as Record<string, ConstraintDef>

describe('[労務] shiftDurationHours', () => {
  it('日勤=9h, 夜勤(翌跨ぎ)=12h, 当務=25h, 公休=0', () => {
    expect(shiftDurationHours('日勤')).toBe(9)
    expect(shiftDurationHours('夜勤')).toBe(12)
    expect(shiftDurationHours('当務')).toBe(25)
    expect(shiftDurationHours('公休')).toBe(0)
  })
})

describe('[労務] 会社ルール（人事総務部）', () => {
  it('ルール1: 当務の翌日に勤務→違反 / 翌日休みならOK', () => {
    const bad = grid([{ date: '2026-08-01', workType: '当務' }, { date: '2026-08-02', workType: '日勤' }])
    expect(evaluateLaborAlerts(bad, staff, [C.restAfterLong]).filter((a) => a.kind === 'rest_day_after_long_shift').length).toBe(1)
    const ok = grid([{ date: '2026-08-01', workType: '当務' }, { date: '2026-08-02', workType: '明休' }])
    expect(evaluateLaborAlerts(ok, staff, [C.restAfterLong]).length).toBe(0)
  })
  it('ルール2: 夜勤の翌日に勤務→違反 / 翌日休みならOK', () => {
    const bad = grid([{ date: '2026-08-01', workType: '夜勤' }, { date: '2026-08-02', workType: '日勤' }])
    expect(evaluateLaborAlerts(bad, staff, [C.noWorkAfterNight]).filter((a) => a.kind === 'no_work_after_night').length).toBe(1)
    const ok = grid([{ date: '2026-08-01', workType: '夜勤' }, { date: '2026-08-02', workType: '公休' }])
    expect(evaluateLaborAlerts(ok, staff, [C.noWorkAfterNight]).length).toBe(0)
  })
  it('ルール3: 週7日すべて勤務→休日0で配慮違反', () => {
    const g = grid(['03','04','05','06','07','08','09'].map((d) => ({ date: `2026-08-${d}`, workType: '日勤' })))
    expect(evaluateLaborAlerts(g, staff, [C.minOff]).filter((a) => a.kind === 'min_days_off_per_week').length).toBe(1)
  })
  it('ルール4: 9hインターバル未満→違反（夜勤終09:00→翌日勤始09:00=0h）', () => {
    const g = grid([{ date: '2026-08-01', workType: '夜勤' }, { date: '2026-08-02', workType: '日勤' }])
    expect(evaluateLaborAlerts(g, staff, [C.rest9]).filter((a) => a.kind === 'min_rest_hours').length).toBe(1)
  })
})

describe('[労務] evaluateLaborAlerts', () => {
  it('連勤7日で上限6超過アラート', () => {
    const g = grid(['01','02','03','04','05','06','07'].map((d) => ({ date: `2026-08-${d}`, workType: '日勤' })))
    const a = evaluateLaborAlerts(g, staff, [C.consec])
    const consec = a.filter((x) => x.kind === 'max_consecutive_days')
    expect(consec.length).toBe(1)
    expect(consec[0]!.value).toBe(7)
    expect(consec[0]!.date).toBe('2026-08-07')
  })
  it('日勤(終18:00)→翌日勤(始09:00) は間隔15hで11h基準を満たす（アラート無し）', () => {
    const g = grid([{ date: '2026-08-01', workType: '日勤' }, { date: '2026-08-02', workType: '日勤' }])
    expect(evaluateLaborAlerts(g, staff, [C.rest]).filter((x) => x.kind === 'min_rest_hours').length).toBe(0)
  })
  it('夜勤(終09:00)→翌日勤(始09:00) は間隔0hで11h未満→アラート', () => {
    const g = grid([{ date: '2026-08-01', workType: '夜勤' }, { date: '2026-08-02', workType: '日勤' }])
    const a = evaluateLaborAlerts(g, staff, [C.rest]).filter((x) => x.kind === 'min_rest_hours')
    expect(a.length).toBe(1)
    expect(a[0]!.value).toBe(0)
  })
  it('公休を挟めば連勤はリセット', () => {
    const g = grid([
      { date: '2026-08-01', workType: '日勤' }, { date: '2026-08-02', workType: '日勤' },
      { date: '2026-08-03', workType: '公休' }, { date: '2026-08-04', workType: '日勤' },
    ])
    expect(evaluateLaborAlerts(g, staff, [C.consec]).length).toBe(0)
  })
  it('週労働 上限超過と社保目安を検出', () => {
    // 月-金 日勤(9h*5=45h) → 週上限40h超過 + 社保20h以上
    const g = grid(['03','04','05','06','07'].map((d) => ({ date: `2026-08-${d}`, workType: '日勤' })))
    const a = evaluateLaborAlerts(g, staff, [C.weekly, C.insurance])
    expect(a.find((x) => x.kind === 'max_weekly_hours')?.value).toBe(45)
    expect(a.find((x) => x.kind === 'insurance_weekly_hours')).toBeDefined()
  })
  it('active=false の制約は無視', () => {
    const g = grid(['01','02','03','04','05','06','07'].map((d) => ({ date: `2026-08-${d}`, workType: '日勤' })))
    const off = { ...C.consec, active: false }
    expect(evaluateLaborAlerts(g, staff, [off]).length).toBe(0)
  })
})

describe('[労務] summarizeLaborAlerts', () => {
  it('hard/soft/カテゴリ別を集計', () => {
    const g = grid(['01','02','03','04','05','06','07','08'].map((d) => ({ date: `2026-08-${d}`, workType: '日勤' })))
    const a = evaluateLaborAlerts(g, staff, [C.consec, C.weekly, C.insurance])
    const s = summarizeLaborAlerts(a)
    expect(s.total).toBe(a.length)
    expect(s.hard + s.soft).toBe(a.length)
    expect(s.byCategory['legal']).toBeGreaterThan(0)
  })
})
