// [REQ-016..021] シフト／配置表／制約／AI最適化のデモ素材（DB未接続）。
// ロジックは一切持たず、@mamorai/input-core へ渡す純データだけを定義する（層分離厳守）。
// 現場感は MAMORAI_all_screens_v2.html の シフト(p-shift)/配置表(p-assign) を反映。
import type {
  ShiftCell,
  ShiftGrid,
  Staff,
  PositionRequirement,
  ConstraintDef,
  WorkType,
} from '@mamorai/input-core'

export const DEMO_SITE_ID = 'site-bht'
export const DEMO_MONTH = '2026-08'

/** ゲートウェイの既定ベースURL（env 未設定時）。キーはサーバ側のみ、フロントは URL しか持たない。 */
export const SHIFT_API_DEFAULT_BASE = 'http://localhost:3001'

/** デモ対象日（当月の前半7日ぶん。UI が短く収まる範囲）。 */
export const DEMO_WORK_DATES: string[] = [
  '2026-08-01', '2026-08-02', '2026-08-03', '2026-08-04',
  '2026-08-05', '2026-08-06', '2026-08-07',
]

/** スタッフ（資格つき）。責任者候補は施設警備2級を保持。 */
export const demoStaff: Staff[] = [
  { id: 'user-1', name: '三角 龍彦', qualifications: ['施設警備2級', '上級救命'] },
  { id: 'user-2', name: '佐藤 健', qualifications: ['施設警備2級'] },
  { id: 'user-3', name: '鈴木 花', qualifications: [] },
  { id: 'user-4', name: '田中 誠', qualifications: ['交通誘導2級'] },
]

/** 勤務区分の選択肢（既知＋現場独自も文字列で追加可能）。 */
export const WORK_TYPES: WorkType[] = ['日勤', '夜勤', '当務', '明休', '公休', '研修', '有給', '欠勤']

/** 現場ポジションの必要要件（配置表・必要人数制約の土台）。 */
export const demoPositions: PositionRequirement[] = [
  { position: '日勤', requiredHeadcount: 2, requiredQualifications: ['施設警備2級'] },
  { position: '夜勤', requiredHeadcount: 1, requiredQualifications: ['施設警備2級'] },
]

/** base シフト（実データ相当 source='base'）。手動編集はこの上に override される。 */
export function demoBaseCells(): ShiftCell[] {
  const cells: ShiftCell[] = []
  const plan: Record<string, WorkType[]> = {
    'user-1': ['日勤', '日勤', '夜勤', '明休', '公休', '日勤', '日勤'],
    // 夜勤(06)→日勤(07): ルール②「夜勤後は休み」に抵触する例
    'user-2': ['夜勤', '明休', '日勤', '日勤', '日勤', '夜勤', '日勤'],
    'user-3': ['公休', '日勤', '日勤', '夜勤', '明休', '日勤', '公休'],
    // 当務(04)→日勤(05): ルール①「当務後は1日空ける」に抵触する例
    'user-4': ['日勤', '日勤', '公休', '当務', '日勤', '夜勤', '明休'],
  }
  for (const s of demoStaff) {
    const row = plan[s.id] ?? []
    DEMO_WORK_DATES.forEach((date, i) => {
      cells.push({ staffId: s.id, date, workType: row[i] ?? '公休', source: 'base' })
    })
  }
  return cells
}

/** base の ShiftGrid（monthlyWorkTypeCounts へ渡す起点）。 */
export function demoShiftGrid(): ShiftGrid {
  return { siteId: DEMO_SITE_ID, month: DEMO_MONTH, cells: demoBaseCells() }
}

/**
 * 制約の初期例。国(労基)・保険・会社・勤務条件・その他 を1件ずつ含み、
 * 「ユーザーが後から自由に足せる」ことを体現する（データ駆動＝行を足すだけ）。
 */
export function demoConstraints(): ConstraintDef[] {
  return [
    {
      id: 'c-legal-consec', category: 'legal', severity: 'hard', kind: 'max_consecutive_days',
      params: { days: 6 }, label: '連勤は6日まで', source: '労働基準法第35条', active: true,
    },
    {
      id: 'c-legal-weekly', category: 'legal', severity: 'hard', kind: 'max_weekly_hours',
      params: { hours: 40, hoursPerShift: 8 }, label: '週労働40時間以内', source: '労働基準法第32条', active: true,
    },
    {
      id: 'c-insurance', category: 'insurance', severity: 'soft', kind: 'insurance_weekly_hours',
      params: { thresholdHours: 20, hoursPerShift: 8 }, weight: 3,
      label: '週20h以上は社保加入対象', source: '社会保険適用', active: true,
    },
    {
      id: 'c-company-qual', category: 'company', severity: 'hard', kind: 'qualification_required',
      params: { position: '夜勤', qualification: '施設警備2級' },
      label: '夜勤は施設警備2級が必須', source: '自社シフト規程 v3', active: true,
    },
    {
      id: 'c-shift-head', category: 'shift', severity: 'hard', kind: 'required_headcount',
      params: { position: '日勤', count: 2 }, label: '日勤は2名以上', source: '運用要望', active: true,
    },
    {
      id: 'c-shift-dayoff', category: 'shift', severity: 'soft', kind: 'day_off_request',
      params: { staffId: 'user-3', date: '2026-08-04' }, weight: 5,
      label: '鈴木の希望休(8/4)', source: '本人申請', active: true,
    },
    {
      id: 'c-other-forbid', category: 'other', severity: 'hard', kind: 'custom_flag',
      params: { rule: 'forbid_staff_position', staffId: 'user-4', position: '夜勤' },
      label: '田中は夜勤に入れない（本人事情）', source: 'その他配慮', active: false,
    },
    // ── 会社ルール（人事総務部・シフト作成ルール）。会社ごとに追加/調整できる ──
    {
      id: 'c-hr-touban-rest', category: 'company', severity: 'hard', kind: 'rest_day_after_long_shift',
      params: { minHours: 22, restDays: 1 },
      label: '当務(22〜25h)の後は1日空ける', source: '人事総務部 シフト作成ルール①', active: true,
    },
    {
      id: 'c-hr-after-night', category: 'company', severity: 'hard', kind: 'no_work_after_night',
      params: { nightTypes: ['夜勤'] },
      label: '夜勤の後は連続勤務しない（翌日は休み）', source: '人事総務部 シフト作成ルール②', active: true,
    },
    {
      id: 'c-hr-weekoff', category: 'company', severity: 'soft', kind: 'min_days_off_per_week',
      params: { days: 1 }, weight: 4,
      label: '勤務過密を避け休日配置に配慮', source: '人事総務部 シフト作成ルール③', active: true,
    },
    {
      id: 'c-hr-interval9', category: 'company', severity: 'hard', kind: 'min_rest_hours',
      params: { hours: 9 },
      label: '退勤〜翌始業まで9時間以上のインターバル', source: '人事総務部 シフト作成ルール④', active: true,
    },
  ]
}
