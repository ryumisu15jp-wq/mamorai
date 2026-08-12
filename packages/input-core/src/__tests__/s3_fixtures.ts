// [Sprint3] シフト/配置表/拡張制約/AI最適化 の共有フィクスチャ
// 純粋・決定論（Date.now / Math.random / 引数なし new Date() を使わない）。日付は 'YYYY-MM-DD' 文字列で扱う。
import type {
  ShiftCell,
  ShiftGrid,
  Staff,
  PositionRequirement,
  ConstraintDef,
  OptimizationContext,
  DraftAssignment,
  AssignmentExplanation,
  WorkType,
} from '../types.js'

// ── 現場の基本設定（責任者 / 日勤A / 夜勤A、資格 '施設警備2級'） ──
export const SITE_ID = 'site-001'
export const MONTH = '2026-08'
export const QUAL = '施設警備2級'

/** 2026-08-10(月)〜08-16(日) は同一 ISO 週。08-17(月) から翌週。 */
export const WEEK = [
  '2026-08-10',
  '2026-08-11',
  '2026-08-12',
  '2026-08-13',
  '2026-08-14',
  '2026-08-15',
  '2026-08-16',
] as const
export const NEXT_MONDAY = '2026-08-17'

// ── スタッフ（資格つき） ──
export const s1: Staff = { id: 's1', name: '有資格1', qualifications: [QUAL] }
export const s2: Staff = { id: 's2', name: '有資格2', qualifications: [QUAL] }
export const s3: Staff = { id: 's3', name: '無資格3', qualifications: [] }
export const s4: Staff = { id: 's4', name: '有資格4', qualifications: [QUAL] }
export const STAFF_ALL: Staff[] = [s1, s2, s3, s4]

// ── ポジション必要要件 ──
export const POS_SEKININSHA: PositionRequirement = {
  position: '責任者',
  requiredHeadcount: 1,
  requiredQualifications: [QUAL],
}
export const POS_NIKKIN_A: PositionRequirement = { position: '日勤A', requiredHeadcount: 1 }
export const POS_YAKIN_A: PositionRequirement = { position: '夜勤A', requiredHeadcount: 1 }
export const POSITIONS_BASIC: PositionRequirement[] = [POS_SEKININSHA, POS_NIKKIN_A, POS_YAKIN_A]

// ── ファクトリ ──
export function cell(
  staffId: string,
  date: string,
  workType: WorkType,
  source?: ShiftCell['source'],
): ShiftCell {
  return source ? { staffId, date, workType, source } : { staffId, date, workType }
}

export function grid(cells: ShiftCell[], month = MONTH, siteId = SITE_ID): ShiftGrid {
  return { siteId, month, cells }
}

const EMPTY_EXPL: AssignmentExplanation = { satisfied: [], reasons: [] }

/** 下案の1割付（explanation 既定は空） */
export function da(
  date: string,
  position: string,
  staffId: string | null,
  explanation: AssignmentExplanation = EMPTY_EXPL,
): DraftAssignment {
  return { date, position, staffId, explanation }
}

/** 単一スタッフを連続する日付群へ同一ポジションで割付ける下案を生成 */
export function assignRange(staffId: string, position: string, dates: readonly string[]): DraftAssignment[] {
  return dates.map((d) => da(d, position, staffId))
}

/** OptimizationContext を組み立てる */
export function context(overrides: Partial<OptimizationContext> = {}): OptimizationContext {
  return {
    siteId: SITE_ID,
    month: MONTH,
    workDates: ['2026-08-10', '2026-08-11'],
    staff: STAFF_ALL,
    positions: POSITIONS_BASIC,
    constraints: [],
    ...overrides,
  }
}

// ── カテゴリ別 制約セット（国/保険/会社/その他 を後から追加できる担保用） ──
export const C_HEADCOUNT_SEKININSHA: ConstraintDef = {
  id: 'c-head-1',
  category: 'company',
  severity: 'hard',
  kind: 'required_headcount',
  params: { position: '責任者', count: 1 },
  label: '責任者は1名必須',
}
export const C_QUALIFICATION: ConstraintDef = {
  id: 'c-qual-1',
  category: 'legal',
  severity: 'hard',
  kind: 'qualification_required',
  params: { position: '責任者', qualification: QUAL },
  label: '責任者は施設警備2級保持者',
  source: '警備業法',
}
export const C_MAX_CONSECUTIVE: ConstraintDef = {
  id: 'c-consec-1',
  category: 'legal',
  severity: 'hard',
  kind: 'max_consecutive_days',
  params: { days: 6 },
  label: '連勤は6日まで',
  source: '労働基準法',
}
export const C_DAYOFF_S2_0812: ConstraintDef = {
  id: 'c-dayoff-1',
  category: 'other',
  severity: 'hard',
  kind: 'day_off_request',
  params: { staffId: 's2', date: '2026-08-12' },
  label: 's2 の希望休(08-12)',
}
export const C_MIN_REST: ConstraintDef = {
  id: 'c-rest-1',
  category: 'legal',
  severity: 'hard',
  kind: 'min_rest_hours',
  params: { hours: 11 },
  label: '勤務間隔は11時間以上',
  source: '労働基準法',
}
export const C_MAX_WEEKLY_HOURS: ConstraintDef = {
  id: 'c-week-1',
  category: 'legal',
  severity: 'hard',
  kind: 'max_weekly_hours',
  params: { hours: 40, hoursPerShift: 8 },
  label: '週40時間まで',
  source: '労働基準法',
}
export const C_INSURANCE: ConstraintDef = {
  id: 'c-ins-1',
  category: 'insurance',
  severity: 'soft',
  kind: 'insurance_weekly_hours',
  params: { thresholdHours: 20, hoursPerShift: 8 },
  label: '社会保険加入対象(週20時間以上)',
  source: '社会保険',
  weight: 3,
}
export const C_CUSTOM_COMPANY: ConstraintDef = {
  id: 'c-custom-1',
  category: 'company',
  severity: 'soft',
  kind: 'custom_flag',
  params: { rule: 'forbid_staff_position', staffId: 's3', position: '夜勤A' },
  label: '自社規程: s3 は夜勤A禁止',
  source: '自社シフト規程 v3',
  weight: 5,
}
