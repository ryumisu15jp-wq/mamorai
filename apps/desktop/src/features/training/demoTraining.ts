// [REQ-023] 教育・資格画面のデモ素材（分類・達成率ロジックは持たない）。
// 現場感は MAMORAI_all_screens_v2.html の p-comp（教育記録・資格者管理）を反映。
import type { Qualification, TrainingRecord } from '@mamorai/input-core'

/** 基準日の既定（デモ）。UI で変更可能。 */
export const DEFAULT_REFERENCE_DATE = '2026-08-11'

/** 「更新間近」しきい値の既定（日数）。OQ-10 未確定のため 90日を暫定採用。 */
export const DEFAULT_THRESHOLD_DAYS = 90

/** 有効期限つき資格のデモ（有効 / 更新間近 / 期限切れ が混在するよう設定）。 */
export function demoQualifications(): Qualification[] {
  return [
    { staffId: '三角 龍彦', name: '施設警備1級', expiresOn: '2027-04-15' },
    { staffId: '藤井 隆幸', name: '施設警備2級', expiresOn: '2026-10-20' },
    { staffId: '佐藤 健太', name: '上級救命講習', expiresOn: '2026-09-05' },
    { staffId: '松葉 眞', name: '自衛消防技術', expiresOn: '2026-06-30' },
    { staffId: '辻 嵐', name: '防災センター要員', expiresOn: '2028-01-10' },
  ]
}

/** 教育・研修記録のデモ（新任基本研修 32/45h 等）。 */
export function demoTrainingRecords(): TrainingRecord[] {
  return [
    { staffId: '佐藤 健太', type: '新任基本研修', requiredHours: 45, completedHours: 32 },
    { staffId: '辻 嵐', type: '現任研修', requiredHours: 10, completedHours: 10 },
    { staffId: '松葉 眞', type: '業務別研修（施設）', requiredHours: 12, completedHours: 12 },
    { staffId: '藤井 隆幸', type: '現任研修', requiredHours: 10, completedHours: 6 },
  ]
}
