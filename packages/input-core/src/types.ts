// [REQ-001][REQ-002] 共通入力ロジック層の型定義（UI/DB非依存・純粋）
// このファイルは packages/input-core の設計アンカー。React/Tauri/Supabase を一切 import しない。

/** 日報のステータス（状態遷移: 下書き → 提出済 → 承認済 | 差し戻し） */
export type ReportStatus = '下書き' | '提出済' | '承認済' | '差し戻し'

/** [REQ-002] 日報テンプレートのセクション型（5種） */
export type SectionKind = 'meta' | 'table' | 'counter' | 'check' | 'gate'

/** フィールドの入力値。1分日報は number/boolean/select 中心（自由入力textは任意）。 */
export type FieldValue = string | number | boolean | null

/** 数値レンジ制約（counter/table の数値項目） */
export interface NumberRange {
  min?: number
  max?: number
}

/** テンプレート上の1フィールド定義 */
export interface FieldDef {
  /** セクション内で一意なキー */
  key: string
  label: string
  /** 入力種別。text は自由入力（1分日報では必須にしない） */
  type: 'text' | 'number' | 'select' | 'check' | 'time'
  required?: boolean
  /** type==='number' の範囲制約 */
  range?: NumberRange
  /** type==='select' の選択肢 */
  options?: string[]
  /** 既定値（テンプレート由来のプリフィル値） */
  default?: FieldValue
  /** [REQ-006] type==='time' の開始側フィールドで、対になる終了フィールドの key を指す */
  pairWith?: string
  /** [REQ-006] time ペアで end<start を「翌日跨ぎ」として許容する（例: 夜勤 21:00→翌09:00） */
  allowOvernight?: boolean
}

/** [REQ-002] テンプレートのセクション定義 */
export interface SectionDef {
  id: string
  kind: SectionKind
  label: string
  fields: FieldDef[]
  /** そのセクション自体を有効にするか（現場ごとに切替） */
  enabled?: boolean
}

/** [REQ-002] 現場に紐づく日報テンプレート */
export interface ReportTemplate {
  id: string
  siteId: string
  name: string
  sections: SectionDef[]
}

/** 解決済みフォーム構造（UIが描画するための中間表現） */
export interface ResolvedForm {
  templateId: string
  siteId: string
  sections: SectionDef[]
  /** section.id -> (field.key -> value) のフラットな初期値 */
  values: Record<string, Record<string, FieldValue>>
}

/** [REQ-001] 日報レコード（永続化される値。DBアクセスはここでは行わない） */
export interface DailyReport {
  id: string
  siteId: string
  templateId: string
  reporterId: string
  reportDate: string // YYYY-MM-DD
  status: ReportStatus
  /** section.id -> (field.key -> value) */
  values: Record<string, Record<string, FieldValue>>
  submittedAt?: string | null
  approvedAt?: string | null
  approverId?: string | null
  /** 後方互換: 既存日報由来の未知フィールドを失わないための保管領域 [REQ-007] */
  legacyExtras?: Record<string, unknown>
}

/** [REQ-006] バリデーション違反 */
export interface Violation {
  sectionId: string
  fieldKey: string
  code:
    | 'required'
    | 'out_of_range'
    | 'time_order'
    | 'invalid_time'
    | 'invalid_type'
  message: string
}

/** [REQ-006] バリデーション結果 */
export interface ValidationResult {
  ok: boolean
  violations: Violation[]
}

/** [REQ-004] 1分日報の操作数見積り結果 */
export interface TapEstimate {
  taps: number
  withinBudget: boolean
  budget: number
}

// ───────────────────────────────────────────────────────
// [Sprint2] 承認ワークフロー / 一覧 / 集計 / リスク の型
// ───────────────────────────────────────────────────────

/** [REQ-008] 状態遷移アクション */
export type WorkflowAction = 'submit' | 'approve' | 'reject' | 'resubmit'

/** [REQ-008] 遷移操作者と時刻 */
export interface Actor {
  id: string
  at: string // ISO
}

/** [REQ-009] 月次一覧の1行（レコード非存在日は '未作成'） */
export interface ReportListRow {
  reportDate: string // YYYY-MM-DD
  status: ReportStatus | '未作成'
  report: DailyReport | null
  reporterId: string | null
}

/** [REQ-009] 一覧フィルタ条件 */
export interface ReportFilter {
  status?: ReportStatus
  reporterId?: string
  /** values 内の文字列を対象にした部分一致 */
  keyword?: string
}

/** [REQ-010..012] 集計設定（現場テンプレート差異を吸収） */
export interface AggregateConfig {
  /** インシデントとして数える counter フィールドの key 群 */
  incidentKeys?: string[]
}

/** [REQ-011] 月報サマリー4指標 */
export interface MonthlySummary {
  reportDays: number
  totalResponses: number
  incidentCount: number
  /** 承認率 = 承認済 / (提出済+承認済+差し戻し)。0..1。分母0なら0（OQ-04）。 */
  approvalRate: number
}

/** [REQ-012] インシデント種別内訳の1行（前月比つき） */
export interface IncidentTypeStat {
  type: string
  count: number
  prevCount: number | null // 前月データ無しは null
  delta: number | null // count-prevCount、前月無しは null
}

/** [REQ-012] 日別対応件数 */
export interface DailyCount {
  date: string // YYYY-MM-DD
  count: number
}

/** [REQ-012] インシデント内訳＋日別推移 */
export interface IncidentBreakdown {
  byType: IncidentTypeStat[]
  dailyTrend: DailyCount[]
}

/** [REQ-013] 出力用中間データ（行・列・ヘッダ） */
export interface ExportTable {
  title: string
  headers: string[]
  rows: (string | number)[][]
}

/** [REQ-014] リスク度分類 */
export type RiskLevel = 'High' | 'Mid' | 'Low'

/** [REQ-014] リスク項目 */
export interface RiskItem {
  id: string
  type: string
  position: string
  score: number // 0..100
  probability: number // 0..1
  level: RiskLevel
  factors: string[]
  /** [S5-2] 時間帯（早朝/午前/午後/夕方/深夜 等） */
  timeslot?: string
}

/** [REQ-015] リスク絞り込み条件 */
export interface RiskFilter {
  type?: string
  position?: string
  sortBy?: 'score' | 'probability'
  order?: 'asc' | 'desc'
}

// ───────────────────────────────────────────────────────
// [Sprint3] シフト / 配置表 / 拡張制約フレームワーク / AI最適化
// ───────────────────────────────────────────────────────

/** [REQ-016] 勤務区分（既知値＋現場独自の文字列も許容） */
export type WorkType = '日勤' | '夜勤' | '明休' | '公休' | '研修' | '有給' | '欠勤' | (string & {})

/** [REQ-016] シフト1セル（スタッフ×日付）。source で 実データ/手動/AI反映 を区別 */
export interface ShiftCell {
  staffId: string
  date: string // YYYY-MM-DD
  workType: WorkType
  source?: 'base' | 'manual' | 'ai_apply'
}

/** [REQ-016] 月次シフト表 */
export interface ShiftGrid {
  siteId: string
  month: string // YYYY-MM
  cells: ShiftCell[]
}

/** [REQ-018/019] スタッフ（資格つき） */
export interface Staff {
  id: string
  name?: string
  qualifications: string[]
}

/** [REQ-017/019] ポジション必要要件 */
export interface PositionRequirement {
  position: string // 責任者 / 日勤A / 夜勤A ...
  requiredHeadcount: number
  requiredQualifications?: string[]
}

/** [REQ-017] 配置表の1割当 */
export interface AssignmentCell {
  position: string
  staffId: string | null // null=欠員
}

/** [REQ-017] 日次配置表（欠員つき） */
export interface DailyAssignment {
  siteId: string
  date: string
  cells: AssignmentCell[]
  vacancies: { position: string; shortBy: number }[]
}

// ── 拡張制約フレームワーク（RYUGEN要望: 国/保険/会社/その他を後から追加可能） ──

/** 制約カテゴリ。既知＋任意文字列で拡張可能 */
export type ConstraintCategory = 'legal' | 'insurance' | 'company' | 'shift' | 'other' | (string & {})

/** ハード（絶対）/ ソフト（なるべく=重み付き） */
export type ConstraintSeverity = 'hard' | 'soft'

/** 評価器レジストリのキー（既知の評価可能ルール＋拡張文字列） */
export type ConstraintKind =
  | 'qualification_required' // 有資格者のみ配置
  | 'min_rest_hours'         // 勤務間隔（労基: 例11時間）
  | 'max_consecutive_days'   // 連勤上限
  | 'max_weekly_hours'       // 週労働時間上限（労基）
  | 'required_headcount'     // 必要人数
  | 'day_off_request'        // 希望休
  | 'insurance_weekly_hours' // 保険: 週所定労働時間による社保加入要否
  | 'custom_flag'            // 会社/その他: データ駆動の単純ルール
  | (string & {})

/** [REQ-018] 構造化された1制約（データ駆動＝行を足すだけで制約追加できる） */
export interface ConstraintDef {
  id: string
  category: ConstraintCategory
  severity: ConstraintSeverity
  kind: ConstraintKind
  /** kind ごとのパラメータ（例: {hours:11} / {qualification:'施設警備2級'} / {days:6}） */
  params: Record<string, unknown>
  label: string
  /** soft のときの重み（大きいほど回避したい）。hard では無視 */
  weight?: number
  /** 根拠（例: '労働基準法', '社会保険', '自社シフト規程 v3'） */
  source?: string
  /** 無効化フラグ（既定 true=有効） */
  active?: boolean
}

/** 制約違反 */
export interface ConstraintViolation {
  constraintId: string
  category: ConstraintCategory
  severity: ConstraintSeverity
  kind: ConstraintKind
  staffId?: string
  date?: string
  position?: string
  message: string
  penalty?: number // soft のみ
  /** [REQ-018] 追加識別子。'unevaluable'=評価器未登録で充足を保証できない等（安全側=hardなら feasible を落とす） */
  code?: string
}

/** [REQ-018/019] 勤務区分ごとの勤務時刻（労基インターバル=min_rest_hours 判定に使用） */
export interface ShiftTime {
  start: string // 'HH:MM'
  end: string // 'HH:MM'
  /** end が翌日にまたがる（例: 夜勤 21:00→翌09:00） */
  crossesMidnight?: boolean
}

/** 制約評価結果 */
export interface ConstraintEvalResult {
  hardViolations: ConstraintViolation[]
  softViolations: ConstraintViolation[]
  totalPenalty: number
  feasible: boolean // hardViolations.length === 0
}

/** [REQ-018/019] 最適化のコンテキスト */
export interface OptimizationContext {
  siteId: string
  month: string
  workDates: string[] // 対象日（YYYY-MM-DD）
  staff: Staff[]
  positions: PositionRequirement[]
  constraints: ConstraintDef[]
  /** 既存の割当（前日など、勤務間隔/連勤判定に使用） */
  priorShifts?: ShiftCell[]
  /** [REQ-018/019] WorkType→勤務時刻の上書きマップ。未指定なら既定マップ(shiftTimes.ts)を使う */
  shiftTimes?: Record<WorkType, ShiftTime>
}

/** [REQ-021] 各割付の説明（説明可能性） */
export interface AssignmentExplanation {
  satisfied: string[] // 充足した制約ラベル
  reasons: string[]   // 優先根拠テキスト
}

/** [REQ-019/021] 下案の1割付 */
export interface DraftAssignment {
  date: string
  position: string
  staffId: string | null // null=充足不能
  explanation: AssignmentExplanation
}

/** [REQ-019] 最適化結果（status は常に '下案'。自動確定しない） */
export interface OptimizationResult {
  runId: string
  draft: DraftAssignment[]
  evaluation: ConstraintEvalResult
  feasible: boolean
  unresolved: ConstraintViolation[] // 充足不能の理由
  status: '下案'
}

/** [REQ-020] 最適化ラン（HITL: 管制員確認を経てのみ確定） */
export interface OptimizationRun {
  runId: string
  siteId: string
  month: string
  result: OptimizationResult
  status: '下案' | '確認中' | '確定'
  confirmedBy?: string | null
  confirmedAt?: string | null
}

// ───────────────────────────────────────────────────────
// [Sprint4] 通知 / 教育・資格 / テンプレート設定
// ───────────────────────────────────────────────────────

/** [REQ-022] 通知種別 */
export type NotificationKind = '重要事項' | '業務指示' | '本部通知'

/** [REQ-022] 配信対象条件（誤配信防止のため明示的に絞り込む） */
export interface AudienceFilter {
  scope: 'all' | 'site' | 'workType' | 'role'
  siteId?: string
  workType?: WorkType
  role?: string
}

/** [REQ-022] 通知 */
export interface Notification {
  id: string
  kind: NotificationKind
  title: string
  body?: string
  target: AudienceFilter
  createdBy?: string
  createdAt?: string
}

/** [REQ-022] 配信対象になりうる利用者 */
export interface NotifyUser {
  id: string
  siteId: string
  role?: string
  workType?: WorkType
}

/** [REQ-022] 配信結果（対象・確認済・未確認件数） */
export interface NotificationDelivery {
  notificationId: string
  recipientIds: string[]
  confirmedIds: string[]
  unconfirmed: number
}

/** [REQ-023] 資格の状態 */
export type QualificationStatus = '有効' | '更新間近' | '期限切れ'

/** [REQ-023] 資格（有効期限つき） */
export interface Qualification {
  staffId: string
  name: string
  expiresOn: string // YYYY-MM-DD
}

/** [REQ-023] 教育・研修記録 */
export interface TrainingRecord {
  staffId: string
  type: string // 新任基本研修 等
  requiredHours: number
  completedHours: number
}

/** [REQ-023] 資格の可視化ビュー */
export interface QualificationView {
  staffId: string
  name: string
  expiresOn: string
  status: QualificationStatus
  daysToExpiry: number // 負値=期限切れ
}

/** [REQ-024] テンプレートのセクションON/OFF設定 */
export interface TemplateConfig {
  siteId: string
  disabledSectionIds: string[]
  /** [S6] 現場が設定で追加するセクション（巡回/点検/特記/継続不具合 等）。追加のみ・非破壊。 */
  extraSections?: SectionDef[]
}

// ───────────────────────────────────────────────────────
// [Sprint5] HaiTO統合: 業態マスタ / AI条件 / リスク集計
// ───────────────────────────────────────────────────────

/** 業態（HaiTO 3業態＋拡張可能: ホテル施設/交通誘導 等） */
export type BusinessType = '商業施設' | '興行施設' | '興行運営' | (string & {})

/** AI条件フィールド（特性=物件固定 / 共通=時期天気 / 特殊=業態別） */
export interface ConditionField {
  key: string
  label: string
  group: '特性' | '共通' | '特殊'
  type: 'text' | 'number' | 'select' | 'check'
  options?: string[]
}

/** 業態マスタ（インシデント・ポジション・AI条件） */
export interface BusinessMaster {
  businessType: BusinessType
  incidents: string[]
  positions: string[]
  conditionFields: ConditionField[]
}

/** 予測エンジンへの入力（AI条件を正規化） */
export interface PredictionInput {
  businessType: BusinessType
  date: string
  conditions: Record<string, FieldValue>
}

/** 時間帯別リスクレベル */
export interface TimeslotRisk { slot: string; level: number; count: number }
/** ポジション別リスクレベル */
export interface PositionRisk { position: string; level: number; count: number }
