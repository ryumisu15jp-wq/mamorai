// 月報／日報一覧のデモ素材（DB未接続）。
// 集計・一覧ロジックは持たず、@mamorai/input-core へ渡す DailyReport 群だけを定義する。
// 現場感は MAMORAI_all_screens_v2.html の 月報(p-month)/ダッシュボード(p-dash) を反映。
import type { AggregateConfig, DailyReport, ReportStatus } from '@mamorai/input-core'

/** 当月（デモ基準）。today=2026-08 を想定。 */
export const DEMO_MONTH = '2026-08'
/** 前月（前月比の比較対象）。 */
export const DEMO_PREV_MONTH = '2026-07'

/** インシデントとして数える counter フィールドの key 群（現場テンプレート差異の吸収）。 */
export const DEMO_INCIDENT_KEYS = ['unlocked', 'suspicious', 'alarm'] as const

/** monthlySummary / incidentBreakdown に渡す集計設定。 */
export const demoAggregateConfig: AggregateConfig = {
  incidentKeys: [...DEMO_INCIDENT_KEYS],
}

/** counter セクションの値（巡回/未施錠/不審者/警報/遺失物）。 */
interface CounterVals {
  patrol: number
  unlocked: number
  suspicious: number
  alarm: number
  lost: number
}

/** 1件の日報を簡潔に組み立てる内部ヘルパ（デモ専用・ロジックなし）。 */
function mk(
  date: string,
  status: ReportStatus,
  reporterId: string,
  reporterName: string,
  c: CounterVals,
  note = ''
): DailyReport {
  return {
    id: `r-${date}-${reporterId}`,
    siteId: 'site-bht',
    templateId: 'tmpl-bht-night',
    reporterId,
    reportDate: date,
    status,
    values: {
      meta: { reporterName, shift: '夜勤', weather: '晴' },
      counter: { ...c },
      gate: { note },
    },
    submittedAt: `${date}T00:05:00.000Z`,
    approvedAt: status === '承認済' ? `${date}T02:00:00.000Z` : null,
    approverId: status === '承認済' ? 'mgr-1' : null,
  }
}

/**
 * 当月(2026-08)の日報群。複数日・複数状態・インシデントを含む現実的なデモ。
 * 空き日(12日以降など)は buildMonthlyList 側で '未作成' として補完される。
 */
export function demoMonthlyReports(): DailyReport[] {
  return [
    mk('2026-08-01', '承認済', 'user-1', '三角 龍彦', { patrol: 6, unlocked: 1, suspicious: 0, alarm: 0, lost: 1 }),
    mk('2026-08-02', '承認済', 'user-2', '佐藤 健', { patrol: 6, unlocked: 0, suspicious: 1, alarm: 0, lost: 0 }, '不審者を声掛けし退去確認'),
    mk('2026-08-03', '承認済', 'user-1', '三角 龍彦', { patrol: 5, unlocked: 2, suspicious: 0, alarm: 1, lost: 0 }, '防火扉の警報作動（誤報）'),
    mk('2026-08-04', '差し戻し', 'user-2', '佐藤 健', { patrol: 4, unlocked: 0, suspicious: 0, alarm: 0, lost: 0 }, '記載不備のため差し戻し'),
    mk('2026-08-05', '承認済', 'user-1', '三角 龍彦', { patrol: 6, unlocked: 0, suspicious: 0, alarm: 0, lost: 2 }),
    mk('2026-08-06', '承認済', 'user-3', '鈴木 花', { patrol: 6, unlocked: 1, suspicious: 1, alarm: 0, lost: 0 }),
    mk('2026-08-07', '提出済', 'user-2', '佐藤 健', { patrol: 5, unlocked: 0, suspicious: 0, alarm: 1, lost: 1 }, 'ELV前で警報、点検異常なし'),
    mk('2026-08-08', '承認済', 'user-1', '三角 龍彦', { patrol: 6, unlocked: 0, suspicious: 0, alarm: 0, lost: 0 }),
    mk('2026-08-09', '提出済', 'user-3', '鈴木 花', { patrol: 4, unlocked: 1, suspicious: 0, alarm: 0, lost: 0 }),
    mk('2026-08-10', '提出済', 'user-2', '佐藤 健', { patrol: 6, unlocked: 0, suspicious: 2, alarm: 0, lost: 1 }, '深夜に不審者2件、うち1件110番'),
    mk('2026-08-11', '下書き', 'user-1', '三角 龍彦', { patrol: 3, unlocked: 0, suspicious: 0, alarm: 0, lost: 0 }),
  ]
}

/** 前月(2026-07)の日報群（前月比のための比較材料。件数は当月よりやや多め）。 */
export function demoPrevMonthReports(): DailyReport[] {
  return [
    mk('2026-07-05', '承認済', 'user-1', '三角 龍彦', { patrol: 6, unlocked: 3, suspicious: 1, alarm: 1, lost: 0 }),
    mk('2026-07-10', '承認済', 'user-2', '佐藤 健', { patrol: 5, unlocked: 2, suspicious: 2, alarm: 0, lost: 1 }),
    mk('2026-07-15', '承認済', 'user-1', '三角 龍彦', { patrol: 6, unlocked: 1, suspicious: 1, alarm: 1, lost: 0 }),
    mk('2026-07-20', '承認済', 'user-3', '鈴木 花', { patrol: 6, unlocked: 2, suspicious: 0, alarm: 1, lost: 2 }),
    mk('2026-07-25', '承認済', 'user-2', '佐藤 健', { patrol: 5, unlocked: 1, suspicious: 2, alarm: 0, lost: 0 }),
  ]
}

/** counter key の日本語表示名（UI 表示専用の対応表）。 */
export const COUNTER_LABEL: Record<string, string> = {
  patrol: '巡回',
  unlocked: '未施錠',
  suspicious: '不審者対応',
  alarm: '警報対応',
  lost: '遺失物',
}
