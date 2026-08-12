// [REQ-023] 資格の更新間近分類・研修達成率（純粋・決定論／日付は 'YYYY-MM-DD' 文字列）
import type {
  Qualification,
  TrainingRecord,
  QualificationStatus,
  QualificationView,
} from '../types.js'

const MS_PER_DAY = 86_400_000

/** 'YYYY-MM-DD' を UTC 午前0時のエポックミリ秒へ（UTC固定の決定論計算） */
function toUtcDay(dateStr: string): number {
  const parts = dateStr.split('-')
  const y = Number(parts[0])
  const m = Number(parts[1])
  const d = Number(parts[2])
  return Date.UTC(y, m - 1, d)
}

/** expiresOn − referenceDate の日数差（負値=期限切れ） */
function diffDays(expiresOn: string, referenceDate: string): number {
  return Math.round((toUtcDay(expiresOn) - toUtcDay(referenceDate)) / MS_PER_DAY)
}

/**
 * [REQ-023] 期限と閾値で状態分類。
 * expiresOn<ref → 期限切れ / ref<=expiresOn<=ref+threshold → 更新間近 / それ以降 → 有効。
 */
export function classifyQualification(
  expiresOn: string,
  referenceDate: string,
  thresholdDays: number,
): QualificationStatus {
  const days = diffDays(expiresOn, referenceDate)
  if (days < 0) return '期限切れ'
  if (days <= thresholdDays) return '更新間近'
  return '有効'
}

/** [REQ-023] status と daysToExpiry を付与（入力順維持） */
export function listQualificationViews(
  quals: Qualification[],
  referenceDate: string,
  thresholdDays: number,
): QualificationView[] {
  return quals.map((q) => ({
    staffId: q.staffId,
    name: q.name,
    expiresOn: q.expiresOn,
    status: classifyQualification(q.expiresOn, referenceDate, thresholdDays),
    daysToExpiry: diffDays(q.expiresOn, referenceDate),
  }))
}

/** [REQ-023] 研修達成率を 0..1 にクランプ（required=0 は対象なし満了で 1） */
export function trainingAchievement(record: TrainingRecord): number {
  if (record.requiredHours === 0) return 1
  const ratio = record.completedHours / record.requiredHours
  if (ratio < 0) return 0
  if (ratio > 1) return 1
  return ratio
}
