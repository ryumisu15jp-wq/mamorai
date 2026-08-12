// [REQ-019/021] 貪欲ヒューリスティックによる下案生成＋説明 generateDraft の RED テスト
// テスト規約: AAA / 「対象_条件_期待」 / 充足可能・充足不能の境界 / 純粋・決定論
import { describe, it, expect } from 'vitest'
import { generateDraft } from '../index.js'
import type { Staff, ConstraintDef } from '../types.js'
import {
  context,
  STAFF_ALL,
  POS_SEKININSHA,
  POS_NIKKIN_A,
  s1,
  s3,
  cell,
  WEEK,
  QUAL,
  C_HEADCOUNT_SEKININSHA,
  C_QUALIFICATION,
  C_DAYOFF_S2_0812,
  C_MAX_CONSECUTIVE,
  C_MAX_WEEKLY_HOURS,
  C_MIN_REST,
} from './s3_fixtures.js'

const RUN_ID = 'run-0001'

describe('generateDraft [REQ-019] 充足可能ケース', () => {
  it('generateDraft_十分な有資格スタッフ_全ハード制約違反ゼロで下案を返す', () => {
    // Arrange: 責任者1 + 日勤A1、有資格者3名(s1,s2,s4)で充足可能
    const ctx = context({
      workDates: ['2026-08-10', '2026-08-11'],
      staff: STAFF_ALL,
      positions: [POS_SEKININSHA, POS_NIKKIN_A],
      constraints: [C_HEADCOUNT_SEKININSHA, C_QUALIFICATION, C_DAYOFF_S2_0812],
    })
    // Act
    const result = generateDraft(ctx, RUN_ID)
    // Assert
    expect(result.runId).toBe(RUN_ID)
    expect(result.status).toBe('下案')
    expect(result.feasible).toBe(true)
    expect(result.evaluation.hardViolations).toHaveLength(0)
    expect(result.unresolved).toHaveLength(0)
  })

  it('generateDraft_責任者スロット_資格を満たす最小staffId(s1)を貪欲選択する', () => {
    // Arrange
    const ctx = context({
      workDates: ['2026-08-10'],
      positions: [POS_SEKININSHA],
      constraints: [C_QUALIFICATION, C_HEADCOUNT_SEKININSHA],
    })
    // Act
    const result = generateDraft(ctx, RUN_ID)
    // Assert
    const sekininsha = result.draft.find((d) => d.position === '責任者' && d.date === '2026-08-10')
    expect(sekininsha?.staffId).toBe('s1')
  })

  it('generateDraft_希望休(hard)を持つ日_当該スタッフを割当てない', () => {
    // Arrange: s2 は 08-12 希望休。08-12 の割当に s2 は選ばれない
    const onlyS2: Staff[] = [{ id: 's2', qualifications: [] }, { id: 's5', qualifications: [] }]
    const ctx = context({
      workDates: ['2026-08-12'],
      staff: onlyS2,
      positions: [POS_NIKKIN_A],
      constraints: [C_DAYOFF_S2_0812, C_HEADCOUNT_SEKININSHA],
    })
    // Act
    const result = generateDraft(ctx, RUN_ID)
    // Assert
    const cell = result.draft.find((d) => d.date === '2026-08-12' && d.position === '日勤A')
    expect(cell?.staffId).not.toBe('s2')
  })
})

describe('generateDraft [REQ-021] 説明の付与', () => {
  it('generateDraft_全割付_explanationのreasonsが非空である', () => {
    // Arrange
    const ctx = context({
      workDates: ['2026-08-10', '2026-08-11'],
      positions: [POS_SEKININSHA, POS_NIKKIN_A],
      constraints: [C_QUALIFICATION, C_HEADCOUNT_SEKININSHA],
    })
    // Act
    const result = generateDraft(ctx, RUN_ID)
    // Assert
    expect(result.draft.length).toBeGreaterThan(0)
    expect(result.draft.every((d) => d.explanation.reasons.length > 0)).toBe(true)
    expect(result.draft.every((d) => Array.isArray(d.explanation.satisfied))).toBe(true)
  })

  it('generateDraft_workDates×positions×headcount_全スロット分の下案を生成する', () => {
    // Arrange: 2日 × (責任者1 + 日勤A1) = 4スロット
    const ctx = context({
      workDates: ['2026-08-10', '2026-08-11'],
      positions: [POS_SEKININSHA, POS_NIKKIN_A],
      constraints: [C_HEADCOUNT_SEKININSHA],
    })
    // Act
    const result = generateDraft(ctx, RUN_ID)
    // Assert
    expect(result.draft).toHaveLength(4)
  })
})

describe('generateDraft [REQ-019] 充足不能ケース', () => {
  it('generateDraft_人員不足_feasibleがfalseでunresolvedに理由が入る', () => {
    // Arrange: 日勤A 3名必要だがスタッフ1名のみ
    const onlyOne: Staff[] = [s1]
    const ctx = context({
      workDates: ['2026-08-10'],
      staff: onlyOne,
      positions: [{ position: '日勤A', requiredHeadcount: 3 }],
      constraints: [{ ...C_HEADCOUNT_SEKININSHA, params: { position: '日勤A', count: 3 } }],
    })
    // Act
    const result = generateDraft(ctx, RUN_ID)
    // Assert
    expect(result.feasible).toBe(false)
    expect(result.unresolved.length).toBeGreaterThan(0)
    expect(result.status).toBe('下案')
  })

  it('generateDraft_全員資格無し_責任者を埋められずfeasibleがfalse', () => {
    // Arrange: 責任者(要資格) に対し全員無資格
    const noQual: Staff[] = [{ id: 's3', qualifications: [] }, { id: 's6', qualifications: [] }]
    const ctx = context({
      workDates: ['2026-08-10'],
      staff: noQual,
      positions: [POS_SEKININSHA],
      constraints: [C_QUALIFICATION, C_HEADCOUNT_SEKININSHA],
    })
    // Act
    const result = generateDraft(ctx, RUN_ID)
    // Assert
    const sekininsha = result.draft.find((d) => d.position === '責任者')
    expect(sekininsha?.staffId).toBeNull()
    expect(result.feasible).toBe(false)
    expect(result.unresolved.length).toBeGreaterThan(0)
  })

  it('generateDraft_充足不能スロット_null割付にも非空のexplanationを付与する', () => {
    // Arrange
    const noQual: Staff[] = [s3]
    const ctx = context({
      workDates: ['2026-08-10'],
      staff: noQual,
      positions: [POS_SEKININSHA],
      constraints: [C_QUALIFICATION, C_HEADCOUNT_SEKININSHA],
    })
    // Act
    const result = generateDraft(ctx, RUN_ID)
    // Assert
    expect(result.draft.every((d) => d.explanation.reasons.length > 0)).toBe(true)
  })
})

describe('generateDraft [REQ-019] 貪欲のハード回避（連勤/週上限/勤務間隔）', () => {
  it('generateDraft_max_consecutive_days_連勤上限日は候補不在でnull割付し違反ゼロ', () => {
    // Arrange: staff 1名・7日連続。days=6 のため7日目は連勤7となり回避→null。
    const onlyOne: Staff[] = [{ id: 's1', qualifications: [] }]
    const ctx = context({
      workDates: [...WEEK],
      staff: onlyOne,
      positions: [POS_NIKKIN_A],
      constraints: [C_MAX_CONSECUTIVE],
    })
    // Act
    const result = generateDraft(ctx, RUN_ID)
    // Assert: 7日目(08-16)は回避されnull、連勤ハード違反は出ない。
    const seventh = result.draft.find((d) => d.date === '2026-08-16' && d.position === '日勤A')
    expect(seventh?.staffId).toBeNull()
    expect(result.evaluation.hardViolations.filter((v) => v.kind === 'max_consecutive_days')).toHaveLength(0)
  })

  it('generateDraft_max_weekly_hours_週上限超過分は候補不在でnull割付し違反ゼロ', () => {
    // Arrange: staff 1名・同一ISO週6日。40h/8h=5シフトが上限、6日目は回避→null。
    const onlyOne: Staff[] = [{ id: 's1', qualifications: [] }]
    const ctx = context({
      workDates: WEEK.slice(0, 6),
      staff: onlyOne,
      positions: [POS_NIKKIN_A],
      constraints: [C_MAX_WEEKLY_HOURS],
    })
    // Act
    const result = generateDraft(ctx, RUN_ID)
    // Assert: 6日目(08-15)は回避されnull、週上限ハード違反は出ない。
    const sixth = result.draft.find((d) => d.date === '2026-08-15' && d.position === '日勤A')
    expect(sixth?.staffId).toBeNull()
    expect(result.evaluation.hardViolations.filter((v) => v.kind === 'max_weekly_hours')).toHaveLength(0)
  })

  it('generateDraft_min_rest_hours_committed隣接日の勤務間隔不足で当日をnull回避', () => {
    // Arrange: staff 1名・夜勤を2日連続。勤務間隔13h下限に対し夜勤→夜勤は12hのため2日目を回避。
    const onlyOne: Staff[] = [{ id: 's1', qualifications: [] }]
    const strictRest: ConstraintDef = { ...C_MIN_REST, id: 'c-rest-strict', params: { hours: 13 } }
    const ctx = context({
      workDates: ['2026-08-10', '2026-08-11'],
      staff: onlyOne,
      positions: [{ position: '夜勤', requiredHeadcount: 1 }],
      constraints: [strictRest],
    })
    // Act
    const result = generateDraft(ctx, RUN_ID)
    // Assert: 1日目は割当、2日目は committed 隣接夜勤との間隔12h<13h で回避→null。
    const day1 = result.draft.find((d) => d.date === '2026-08-10' && d.position === '夜勤')
    const day2 = result.draft.find((d) => d.date === '2026-08-11' && d.position === '夜勤')
    expect(day1?.staffId).toBe('s1')
    expect(day2?.staffId).toBeNull()
    expect(result.evaluation.hardViolations.filter((v) => v.kind === 'min_rest_hours')).toHaveLength(0)
  })

  it('generateDraft_min_rest_hours_前日夜勤者を回避し別スタッフを選ぶ', () => {
    // Arrange: s1 は前日(priorShifts)夜勤 → 当日日勤は間隔0hで抵触。s7 は制約なし。
    const staff: Staff[] = [
      { id: 's1', qualifications: [] },
      { id: 's7', qualifications: [] },
    ]
    const ctx = context({
      workDates: ['2026-08-11'],
      staff,
      positions: [{ position: '日勤', requiredHeadcount: 1 }],
      constraints: [C_MIN_REST],
      priorShifts: [cell('s1', '2026-08-10', '夜勤')],
    })
    // Act
    const result = generateDraft(ctx, RUN_ID)
    // Assert: 最小staffId の s1 ではなく s7 が選ばれる（勤務間隔ハードを貪欲回避）。
    const cellHit = result.draft.find((d) => d.date === '2026-08-11' && d.position === '日勤')
    expect(cellHit?.staffId).toBe('s7')
    expect(result.evaluation.hardViolations.filter((v) => v.kind === 'min_rest_hours')).toHaveLength(0)
  })
})

describe('generateDraft [REQ-019] 貪欲のハード回避（custom_flag 禁止組合せ）', () => {
  it('generateDraft_custom_flag_hard_禁止スタッフを回避し別スタッフを選ぶ', () => {
    // Arrange: s1×日勤A を hard で禁止 → 貪欲は s1 を避け s7 を選ぶ。
    const forbid: ConstraintDef = {
      id: 'c-forbid-hard',
      category: 'company',
      severity: 'hard',
      kind: 'custom_flag',
      params: { rule: 'forbid_staff_position', staffId: 's1', position: '日勤A' },
      label: 's1 は日勤A禁止(絶対)',
    }
    const staff: Staff[] = [
      { id: 's1', qualifications: [] },
      { id: 's7', qualifications: [] },
    ]
    const ctx = context({
      workDates: ['2026-08-10'],
      staff,
      positions: [POS_NIKKIN_A],
      constraints: [forbid],
    })
    // Act
    const result = generateDraft(ctx, RUN_ID)
    // Assert
    const cellHit = result.draft.find((d) => d.date === '2026-08-10' && d.position === '日勤A')
    expect(cellHit?.staffId).toBe('s7')
    expect(result.evaluation.hardViolations.filter((v) => v.kind === 'custom_flag')).toHaveLength(0)
  })
})

describe('generateDraft [REQ-018/019] 未登録hard制約は feasible を落とす（fail-safe）', () => {
  it('generateDraft_未登録hard_kind_下案は生成するがfeasibleがfalseでunresolvedにunevaluable', () => {
    // Arrange: 評価器未登録の hard 制約は貪欲で回避不能→評価で評価不能違反となる。
    const unknownHard: ConstraintDef = {
      id: 'c-unknown-opt-1',
      category: 'company',
      severity: 'hard',
      kind: 'company_absolute_rule_zzz',
      params: {},
      label: '会社独自の絶対制約',
    }
    const ctx = context({
      workDates: ['2026-08-10'],
      positions: [POS_NIKKIN_A],
      constraints: [unknownHard],
    })
    // Act
    const result = generateDraft(ctx, RUN_ID)
    // Assert
    expect(result.feasible).toBe(false)
    expect(result.unresolved.some((v) => v.code === 'unevaluable')).toBe(true)
  })
})

describe('generateDraft [REQ-021] satisfied は実検証した制約のみ（虚偽表示なし）', () => {
  it('generateDraft_satisfied_当該割付に関連し充足した制約ラベルのみ載せる', () => {
    // Arrange: 責任者=資格必須(責任者), 日勤A=資格必須(日勤A), 連勤上限, 責任者headcount。
    const qualNikkin: ConstraintDef = {
      id: 'c-qual-nikkin',
      category: 'legal',
      severity: 'hard',
      kind: 'qualification_required',
      params: { position: '日勤A', qualification: QUAL },
      label: '日勤Aは施設警備2級保持者',
    }
    const ctx = context({
      workDates: ['2026-08-10'],
      staff: STAFF_ALL,
      positions: [POS_SEKININSHA, POS_NIKKIN_A],
      constraints: [C_QUALIFICATION, qualNikkin, C_MAX_CONSECUTIVE, C_HEADCOUNT_SEKININSHA],
    })
    // Act
    const result = generateDraft(ctx, RUN_ID)
    // Assert
    const sekininsha = result.draft.find((d) => d.position === '責任者')
    expect(sekininsha?.staffId).not.toBeNull()
    const satisfied = sekininsha?.explanation.satisfied ?? []
    // 責任者資格(関連) と 連勤上限(当該staff) は載る。
    expect(satisfied).toContain('責任者は施設警備2級保持者')
    expect(satisfied).toContain('連勤は6日まで')
    // 日勤Aの資格要件は責任者割付には無関係 → 載せない（虚偽表示防止）。
    expect(satisfied).not.toContain('日勤Aは施設警備2級保持者')
    // 集約判定の headcount は単体割付では充足断定不可 → 載せない。
    expect(satisfied).not.toContain('責任者は1名必須')
  })

  it('generateDraft_satisfied_充足不能null割付は空配列', () => {
    // Arrange: 全員無資格→責任者は埋まらずnull。
    const noQual: Staff[] = [{ id: 's3', qualifications: [] }]
    const ctx = context({
      workDates: ['2026-08-10'],
      staff: noQual,
      positions: [POS_SEKININSHA],
      constraints: [C_QUALIFICATION, C_HEADCOUNT_SEKININSHA],
    })
    // Act
    const result = generateDraft(ctx, RUN_ID)
    // Assert
    const sekininsha = result.draft.find((d) => d.position === '責任者')
    expect(sekininsha?.staffId).toBeNull()
    expect(sekininsha?.explanation.satisfied).toEqual([])
  })
})
