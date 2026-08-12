// [REQ-018/019] 拡張制約フレームワークの中核: evaluateConstraints / レジストリ拡張 の RED テスト
// テスト規約: AAA / 「対象_条件_期待」 / 境界値 / 純粋・決定論
// 検証観点: 組込み評価器 / カテゴリ拡張(国・保険・会社・その他・自由文字列) / hard-soft分離 / totalPenalty /
//           レジストリ拡張(独自kind) / 未知kindの安全スキップ / active無効化
import { describe, it, expect } from 'vitest'
import {
  evaluateConstraints,
  registerConstraintEvaluator,
  getRegisteredKinds,
  getShiftTime,
  parseHm,
  restIntervalHours,
  DEFAULT_SHIFT_TIMES,
} from '../index.js'
import type { ConstraintDef, ConstraintViolation } from '../types.js'
import {
  context,
  da,
  cell,
  assignRange,
  WEEK,
  C_HEADCOUNT_SEKININSHA,
  C_QUALIFICATION,
  C_MAX_CONSECUTIVE,
  C_MIN_REST,
  C_DAYOFF_S2_0812,
  C_MAX_WEEKLY_HOURS,
  C_INSURANCE,
  C_CUSTOM_COMPANY,
} from './s3_fixtures.js'

describe('evaluateConstraints [REQ-018] 組込み評価器', () => {
  it('evaluateConstraints_required_headcount未充足_hard違反を出す', () => {
    // Arrange: 責任者スロットが欠員(null)
    const assignments = [da('2026-08-10', '責任者', null)]
    const ctx = context({ workDates: ['2026-08-10'], constraints: [C_HEADCOUNT_SEKININSHA] })
    // Act
    const result = evaluateConstraints(assignments, ctx)
    // Assert
    expect(result.hardViolations.length).toBeGreaterThanOrEqual(1)
    expect(result.hardViolations[0].kind).toBe('required_headcount')
    expect(result.feasible).toBe(false)
  })

  it('evaluateConstraints_required_headcount充足_違反なし（境界）', () => {
    // Arrange
    const assignments = [da('2026-08-10', '責任者', 's1')]
    const ctx = context({ workDates: ['2026-08-10'], constraints: [C_HEADCOUNT_SEKININSHA] })
    // Act
    const result = evaluateConstraints(assignments, ctx)
    // Assert
    expect(result.hardViolations).toHaveLength(0)
    expect(result.feasible).toBe(true)
  })

  it('evaluateConstraints_qualification_required_無資格者割当_staffId付きhard違反を出す', () => {
    // Arrange: s3 は無資格
    const assignments = [da('2026-08-10', '責任者', 's3')]
    const ctx = context({ workDates: ['2026-08-10'], constraints: [C_QUALIFICATION] })
    // Act
    const result = evaluateConstraints(assignments, ctx)
    // Assert
    const v = result.hardViolations.find((x) => x.kind === 'qualification_required')
    expect(v).toBeDefined()
    expect(v?.staffId).toBe('s3')
    expect(v?.position).toBe('責任者')
    expect(v?.date).toBe('2026-08-10')
  })

  it('evaluateConstraints_qualification_required_有資格者割当_違反なし', () => {
    // Arrange: s1 は 施設警備2級 保持
    const assignments = [da('2026-08-10', '責任者', 's1')]
    const ctx = context({ workDates: ['2026-08-10'], constraints: [C_QUALIFICATION] })
    // Act
    const result = evaluateConstraints(assignments, ctx)
    // Assert
    expect(result.hardViolations).toHaveLength(0)
  })

  it('evaluateConstraints_max_consecutive_days_連勤超過_hard違反を出す', () => {
    // Arrange: 7連勤(days=6 を超える)
    const assignments = assignRange('s1', '日勤A', WEEK)
    const ctx = context({ workDates: [...WEEK], constraints: [C_MAX_CONSECUTIVE] })
    // Act
    const result = evaluateConstraints(assignments, ctx)
    // Assert
    expect(result.hardViolations.some((v) => v.kind === 'max_consecutive_days' && v.staffId === 's1')).toBe(true)
  })

  it('evaluateConstraints_max_consecutive_days_ちょうど上限_違反なし（境界）', () => {
    // Arrange: 6連勤(days=6 は超えない)
    const assignments = assignRange('s1', '日勤A', WEEK.slice(0, 6))
    const ctx = context({ workDates: WEEK.slice(0, 6), constraints: [C_MAX_CONSECUTIVE] })
    // Act
    const result = evaluateConstraints(assignments, ctx)
    // Assert
    expect(result.hardViolations.filter((v) => v.kind === 'max_consecutive_days')).toHaveLength(0)
  })

  it('evaluateConstraints_day_off_request_希望休日に割当_hard違反を出す', () => {
    // Arrange: s2 の希望休 08-12 に s2 を割当
    const assignments = [da('2026-08-12', '日勤A', 's2')]
    const ctx = context({ workDates: ['2026-08-12'], constraints: [C_DAYOFF_S2_0812] })
    // Act
    const result = evaluateConstraints(assignments, ctx)
    // Assert
    const v = result.hardViolations.find((x) => x.kind === 'day_off_request')
    expect(v?.staffId).toBe('s2')
    expect(v?.date).toBe('2026-08-12')
  })

  it('evaluateConstraints_day_off_request_希望休日に別スタッフ_違反なし', () => {
    // Arrange
    const assignments = [da('2026-08-12', '日勤A', 's1')]
    const ctx = context({ workDates: ['2026-08-12'], constraints: [C_DAYOFF_S2_0812] })
    // Act
    const result = evaluateConstraints(assignments, ctx)
    // Assert
    expect(result.hardViolations).toHaveLength(0)
  })

  it('evaluateConstraints_max_weekly_hours_週上限超過_hard違反を出す', () => {
    // Arrange: 同一ISO週に6勤務=48h > 40h
    const assignments = assignRange('s1', '日勤A', WEEK.slice(0, 6))
    const ctx = context({ workDates: WEEK.slice(0, 6), constraints: [C_MAX_WEEKLY_HOURS] })
    // Act
    const result = evaluateConstraints(assignments, ctx)
    // Assert
    expect(result.hardViolations.some((v) => v.kind === 'max_weekly_hours' && v.staffId === 's1')).toBe(true)
  })

  it('evaluateConstraints_max_weekly_hours_ちょうど40時間_違反なし（境界）', () => {
    // Arrange: 5勤務=40h（>40 ではない）
    const assignments = assignRange('s1', '日勤A', WEEK.slice(0, 5))
    const ctx = context({ workDates: WEEK.slice(0, 5), constraints: [C_MAX_WEEKLY_HOURS] })
    // Act
    const result = evaluateConstraints(assignments, ctx)
    // Assert
    expect(result.hardViolations.filter((v) => v.kind === 'max_weekly_hours')).toHaveLength(0)
  })
})

describe('shiftTimes [REQ-018/019] 勤務時刻マップ / インターバル算出（純粋）', () => {
  it('getShiftTime_既定マップ_日勤の勤務時刻を返す', () => {
    expect(getShiftTime('日勤')).toEqual({ start: '09:00', end: '18:00' })
    expect(DEFAULT_SHIFT_TIMES['夜勤'].crossesMidnight).toBe(true)
  })

  it('getShiftTime_上書き優先_上書きした時刻を返す', () => {
    const ov = { 日勤: { start: '08:00', end: '17:00' } }
    expect(getShiftTime('日勤', ov)).toEqual({ start: '08:00', end: '17:00' })
  })

  it('getShiftTime_勤務なし区分_undefinedを返す', () => {
    expect(getShiftTime('公休')).toBeUndefined()
    // 上書きに無い区分は既定へフォールバックし、既定にも無ければ undefined。
    expect(getShiftTime('欠勤', { 日勤: { start: '09:00', end: '18:00' } })).toBeUndefined()
  })

  it('parseHm_正常/不正_時の小数値とNaNを返す', () => {
    expect(parseHm('21:30')).toBe(21.5)
    expect(Number.isNaN(parseHm('aa:bb'))).toBe(true)
  })

  it('restIntervalHours_逆順の日付_早い日→遅い日で正規化して算出する', () => {
    // a=遅い日(08-11 日勤), b=早い日(08-10 夜勤) を渡しても内部で正規化=0h。
    expect(restIntervalHours('2026-08-11', '日勤', '2026-08-10', '夜勤')).toBe(0)
  })

  it('restIntervalHours_非隣接日_undefinedを返す', () => {
    expect(restIntervalHours('2026-08-10', '日勤', '2026-08-12', '日勤')).toBeUndefined()
  })

  it('restIntervalHours_勤務なし区分_undefinedを返す', () => {
    expect(restIntervalHours('2026-08-10', '公休', '2026-08-11', '日勤')).toBeUndefined()
  })

  it('restIntervalHours_不正時刻の上書き_undefinedを返す', () => {
    const ov = { 日勤: { start: 'zz:zz', end: '18:00' } }
    expect(restIntervalHours('2026-08-10', '日勤', '2026-08-11', '日勤', ov)).toBeUndefined()
  })
})

describe('evaluateConstraints [REQ-018/019] min_rest_hours 勤務間隔(労基インターバル)', () => {
  it('evaluateConstraints_min_rest_hours_夜勤明けに翌日勤_インターバル不足でhard違反', () => {
    // Arrange: 夜勤(翌09:00終了)→翌日 日勤(09:00開始)=間隔0h < 11h
    const assignments = [da('2026-08-10', '夜勤', 's1'), da('2026-08-11', '日勤', 's1')]
    const ctx = context({ workDates: ['2026-08-10', '2026-08-11'], constraints: [C_MIN_REST] })
    // Act
    const result = evaluateConstraints(assignments, ctx)
    // Assert
    const v = result.hardViolations.find((x) => x.kind === 'min_rest_hours')
    expect(v).toBeDefined()
    expect(v?.staffId).toBe('s1')
    expect(v?.date).toBe('2026-08-11')
    expect(result.feasible).toBe(false)
  })

  it('evaluateConstraints_min_rest_hours_日勤→翌日勤_間隔15hで違反なし', () => {
    // Arrange: 日勤(18:00終了)→翌日 日勤(09:00開始)=15h >= 11h
    const assignments = [da('2026-08-10', '日勤', 's1'), da('2026-08-11', '日勤', 's1')]
    const ctx = context({ workDates: ['2026-08-10', '2026-08-11'], constraints: [C_MIN_REST] })
    // Act
    const result = evaluateConstraints(assignments, ctx)
    // Assert
    expect(result.hardViolations.filter((v) => v.kind === 'min_rest_hours')).toHaveLength(0)
  })

  it('evaluateConstraints_min_rest_hours_夜勤→翌夜勤_翌日跨ぎで間隔12hは違反なし（境界）', () => {
    // Arrange: 夜勤(翌09:00終了)→翌日 夜勤(21:00開始)=12h >= 11h（crossesMidnight 経路）
    const assignments = [da('2026-08-10', '夜勤', 's1'), da('2026-08-11', '夜勤', 's1')]
    const ctx = context({ workDates: ['2026-08-10', '2026-08-11'], constraints: [C_MIN_REST] })
    // Act
    const result = evaluateConstraints(assignments, ctx)
    // Assert
    expect(result.hardViolations.filter((v) => v.kind === 'min_rest_hours')).toHaveLength(0)
  })

  it('evaluateConstraints_min_rest_hours_非連続日_判定対象外で違反なし', () => {
    // Arrange: 08-10 夜勤 と 08-12 日勤（間に1日空き）は連続割当日ではない
    const assignments = [da('2026-08-10', '夜勤', 's1'), da('2026-08-12', '日勤', 's1')]
    const ctx = context({ workDates: ['2026-08-10', '2026-08-12'], constraints: [C_MIN_REST] })
    // Act
    const result = evaluateConstraints(assignments, ctx)
    // Assert
    expect(result.hardViolations.filter((v) => v.kind === 'min_rest_hours')).toHaveLength(0)
  })

  it('evaluateConstraints_min_rest_hours_priorShiftsの前日夜勤_翌日勤でhard違反', () => {
    // Arrange: 前日(priorShifts)夜勤 → 当日 日勤 = 0h < 11h
    const assignments = [da('2026-08-11', '日勤', 's1')]
    const ctx = context({
      workDates: ['2026-08-11'],
      constraints: [C_MIN_REST],
      priorShifts: [cell('s1', '2026-08-10', '夜勤')],
    })
    // Act
    const result = evaluateConstraints(assignments, ctx)
    // Assert
    expect(result.hardViolations.some((v) => v.kind === 'min_rest_hours' && v.date === '2026-08-11')).toBe(true)
  })

  it('evaluateConstraints_min_rest_hours_shiftTimes上書き_間隔ちょうど11hは違反なし（境界）', () => {
    // Arrange: 日勤を 09:00-22:00 に上書き → 22:00終了→翌09:00開始=11h（=下限、<ではない）
    const assignments = [da('2026-08-10', '日勤', 's1'), da('2026-08-11', '日勤', 's1')]
    const ctx = context({
      workDates: ['2026-08-10', '2026-08-11'],
      constraints: [C_MIN_REST],
      shiftTimes: { 日勤: { start: '09:00', end: '22:00' } },
    })
    // Act
    const result = evaluateConstraints(assignments, ctx)
    // Assert
    expect(result.hardViolations.filter((v) => v.kind === 'min_rest_hours')).toHaveLength(0)
  })

  it('evaluateConstraints_min_rest_hours_勤務なし区分(公休)は判定対象外', () => {
    // Arrange: 公休は既定マップに勤務時刻を持たない → インターバル判定外
    const assignments = [da('2026-08-10', '公休', 's1'), da('2026-08-11', '日勤', 's1')]
    const ctx = context({ workDates: ['2026-08-10', '2026-08-11'], constraints: [C_MIN_REST] })
    // Act
    const result = evaluateConstraints(assignments, ctx)
    // Assert
    expect(result.hardViolations.filter((v) => v.kind === 'min_rest_hours')).toHaveLength(0)
  })
})

describe('evaluateConstraints [REQ-018] カテゴリ拡張(国/保険/会社/その他/自由文字列)', () => {
  it('evaluateConstraints_insurance_weekly_hours_週20時間以上_softの社保加入対象違反を出す', () => {
    // Arrange: 3勤務=24h >= 20h
    const assignments = assignRange('s1', '日勤A', WEEK.slice(0, 3))
    const ctx = context({ workDates: WEEK.slice(0, 3), constraints: [C_INSURANCE] })
    // Act
    const result = evaluateConstraints(assignments, ctx)
    // Assert
    const v = result.softViolations.find((x) => x.kind === 'insurance_weekly_hours')
    expect(v).toBeDefined()
    expect(v?.category).toBe('insurance')
    expect(v?.severity).toBe('soft')
  })

  it('evaluateConstraints_insurance_weekly_hours_閾値未満_違反なし（境界）', () => {
    // Arrange: 2勤務=16h < 20h
    const assignments = assignRange('s1', '日勤A', WEEK.slice(0, 2))
    const ctx = context({ workDates: WEEK.slice(0, 2), constraints: [C_INSURANCE] })
    // Act
    const result = evaluateConstraints(assignments, ctx)
    // Assert
    expect(result.softViolations.filter((v) => v.kind === 'insurance_weekly_hours')).toHaveLength(0)
  })

  it('evaluateConstraints_custom_flag_forbid_staff_position_禁止組合せ_company違反を出す', () => {
    // Arrange: s3 の夜勤A を禁止（会社/その他のデータ駆動ルール）
    const assignments = [da('2026-08-10', '夜勤A', 's3')]
    const ctx = context({ workDates: ['2026-08-10'], constraints: [C_CUSTOM_COMPANY] })
    // Act
    const result = evaluateConstraints(assignments, ctx)
    // Assert
    const v = result.softViolations.find((x) => x.kind === 'custom_flag')
    expect(v?.category).toBe('company')
    expect(v?.staffId).toBe('s3')
    expect(v?.position).toBe('夜勤A')
  })

  it('evaluateConstraints_違反_元制約のcategory_severity_kindを引き継ぐ', () => {
    // Arrange: 自由文字列カテゴリ(運輸局) が保持されることを検証（＝任意カテゴリを後から追加できる担保）
    const custom: ConstraintDef = {
      id: 'c-unyu-1',
      category: '運輸局',
      severity: 'soft',
      kind: 'custom_flag',
      params: { rule: 'forbid_staff_position', staffId: 's1', position: '日勤A' },
      label: '運輸局ルール',
    }
    const assignments = [da('2026-08-10', '日勤A', 's1')]
    const ctx = context({ workDates: ['2026-08-10'], constraints: [custom] })
    // Act
    const result = evaluateConstraints(assignments, ctx)
    // Assert
    const v = result.softViolations.find((x) => x.constraintId === 'c-unyu-1')
    expect(v?.category).toBe('運輸局')
    expect(v?.severity).toBe('soft')
    expect(v?.kind).toBe('custom_flag')
  })

  it('evaluateConstraints_hardとsoftが混在_分離しtotalPenaltyをweight合計で算出する', () => {
    // Arrange: hard(headcount欠員) + soft(insurance weight3) + soft(custom weight5)
    const assignments = [
      da('2026-08-10', '責任者', null), // headcount hard違反
      ...assignRange('s3', '日勤A', WEEK.slice(0, 3)), // insurance soft違反(24h) + custom? s3夜勤Aではないので custom無し
      da('2026-08-13', '夜勤A', 's3'), // custom_flag soft違反
    ]
    const ctx = context({
      workDates: [...WEEK.slice(0, 3), '2026-08-13', '2026-08-10'],
      constraints: [C_HEADCOUNT_SEKININSHA, C_INSURANCE, C_CUSTOM_COMPANY],
    })
    // Act
    const result = evaluateConstraints(assignments, ctx)
    // Assert
    expect(result.hardViolations.length).toBeGreaterThanOrEqual(1)
    expect(result.softViolations.length).toBeGreaterThanOrEqual(2)
    expect(result.feasible).toBe(false)
    // insurance(3) + custom(5) = 8 が totalPenalty に含まれる
    expect(result.totalPenalty).toBe(8)
  })

  it('evaluateConstraints_weight未指定のsoft違反_penalty既定1で加算する（境界）', () => {
    // Arrange: weight を持たない soft 制約
    const noWeight: ConstraintDef = {
      id: 'c-nw-1',
      category: 'other',
      severity: 'soft',
      kind: 'custom_flag',
      params: { rule: 'forbid_staff_position', staffId: 's1', position: '日勤A' },
      label: 'weight未指定',
    }
    const assignments = [da('2026-08-10', '日勤A', 's1')]
    const ctx = context({ workDates: ['2026-08-10'], constraints: [noWeight] })
    // Act
    const result = evaluateConstraints(assignments, ctx)
    // Assert
    expect(result.totalPenalty).toBe(1)
  })
})

describe('evaluateConstraints [REQ-018] active無効化 / 未知kindの安全スキップ', () => {
  it('evaluateConstraints_active_false_その制約を評価しない', () => {
    // Arrange
    const disabled: ConstraintDef = { ...C_HEADCOUNT_SEKININSHA, active: false }
    const assignments = [da('2026-08-10', '責任者', null)]
    const ctx = context({ workDates: ['2026-08-10'], constraints: [disabled] })
    // Act
    const result = evaluateConstraints(assignments, ctx)
    // Assert
    expect(result.hardViolations).toHaveLength(0)
    expect(result.feasible).toBe(true)
  })

  it('evaluateConstraints_未登録hard_kind_評価不能をhard違反に計上しfeasibleを落とす（fail-safe）', () => {
    // Arrange: 評価器未登録の hard 制約は「充足を保証できない」ため安全側で feasible を落とす。
    const unknownHard: ConstraintDef = {
      id: 'c-unknown-1',
      category: 'other',
      severity: 'hard',
      kind: 'totally_unknown_kind_xyz',
      params: {},
      label: '未知ルール',
    }
    const assignments = [da('2026-08-10', '責任者', 's1')]
    const ctx = context({ workDates: ['2026-08-10'], constraints: [unknownHard] })
    // Act
    const result = evaluateConstraints(assignments, ctx)
    // Assert: throw せず、hard 違反(code:'unevaluable')として計上し feasible=false。
    expect(result.hardViolations).toHaveLength(1)
    expect(result.hardViolations[0].code).toBe('unevaluable')
    expect(result.hardViolations[0].kind).toBe('totally_unknown_kind_xyz')
    expect(result.feasible).toBe(false)
  })

  it('evaluateConstraints_未登録soft_kind_従来どおり安全にスキップする', () => {
    // Arrange: soft の未登録は情報のみのため従来どおりスキップ（feasible には影響しない）。
    const unknownSoft: ConstraintDef = {
      id: 'c-unknown-soft-1',
      category: 'other',
      severity: 'soft',
      kind: 'totally_unknown_soft_kind_xyz',
      params: {},
      label: '未知ソフトルール',
      weight: 4,
    }
    const assignments = [da('2026-08-10', '責任者', 's1')]
    const ctx = context({ workDates: ['2026-08-10'], constraints: [unknownSoft] })
    // Act
    const result = evaluateConstraints(assignments, ctx)
    // Assert
    expect(result.hardViolations).toHaveLength(0)
    expect(result.softViolations).toHaveLength(0)
    expect(result.totalPenalty).toBe(0)
    expect(result.feasible).toBe(true)
  })
})

describe('制約評価器レジストリ拡張 [REQ-018] registerConstraintEvaluator / getRegisteredKinds', () => {
  it('getRegisteredKinds_組込みkind群_登録済みとして列挙される', () => {
    // Arrange & Act
    const kinds = getRegisteredKinds()
    // Assert
    expect(kinds).toEqual(expect.arrayContaining([
      'required_headcount',
      'qualification_required',
      'max_consecutive_days',
      'min_rest_hours',
      'day_off_request',
      'max_weekly_hours',
      'insurance_weekly_hours',
      'custom_flag',
    ]))
  })

  it('registerConstraintEvaluator_独自kindを登録_getRegisteredKindsへ反映される', () => {
    // Arrange
    registerConstraintEvaluator('my_org_rule', () => [])
    // Act
    const kinds = getRegisteredKinds()
    // Assert
    expect(kinds).toContain('my_org_rule')
  })

  it('registerConstraintEvaluator_登録した評価器_evaluateConstraintsから呼ばれる', () => {
    // Arrange: 独自 kind の評価器が固定の違反を返す
    const violation: ConstraintViolation = {
      constraintId: 'c-myorg-1',
      category: 'company',
      severity: 'hard',
      kind: 'my_org_rule_2',
      message: '自組織ルール違反',
    }
    registerConstraintEvaluator('my_org_rule_2', (c) => [{ ...violation, constraintId: c.id }])
    const def: ConstraintDef = {
      id: 'c-myorg-1',
      category: 'company',
      severity: 'hard',
      kind: 'my_org_rule_2',
      params: {},
      label: '自組織ルール',
    }
    const ctx = context({ workDates: ['2026-08-10'], constraints: [def] })
    // Act
    const result = evaluateConstraints([da('2026-08-10', '日勤A', 's1')], ctx)
    // Assert
    expect(result.hardViolations.some((v) => v.kind === 'my_org_rule_2')).toBe(true)
  })
})
