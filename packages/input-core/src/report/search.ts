// [REQ-009] 日報一覧の検索・フィルタ・未作成補完（純粋）
import type { DailyReport, ReportFilter, ReportListRow } from '../types.js'
import { monthDates } from './monthDays.js'

/** values 内の文字列値に keyword(大小無視) が部分一致するか */
function keywordHit(report: DailyReport, keyword: string): boolean {
  const needle = keyword.toLowerCase()
  for (const section of Object.values(report.values)) {
    for (const value of Object.values(section)) {
      if (typeof value === 'string' && value.toLowerCase().includes(needle)) {
        return true
      }
    }
  }
  return false
}

/** 1件の日報が filter を満たすか（status/reporterId 完全一致・keyword 部分一致の AND） */
function matches(report: DailyReport, filter: ReportFilter): boolean {
  if (filter.status !== undefined && report.status !== filter.status) return false
  if (filter.reporterId !== undefined && report.reporterId !== filter.reporterId) return false
  if (filter.keyword !== undefined && filter.keyword !== '' && !keywordHit(report, filter.keyword)) return false
  return true
}

/** [REQ-009] status/reporterId 完全一致・keyword 部分一致の複合 AND で絞り込む */
export function filterReports(reports: DailyReport[], filter: ReportFilter): DailyReport[] {
  return reports.filter((r) => matches(r, filter))
}

/**
 * [REQ-009] 当月全日を1行/日で返す（昇順、長さ=当月日数）。
 * 実レコードあり かつ filter 合致 → その status/report/reporterId。
 * 無い or filter 非合致 → '未作成'/null/null。
 */
export function buildMonthlyList(reports: DailyReport[], month: string, filter?: ReportFilter): ReportListRow[] {
  const cond = filter ?? {}
  return monthDates(month).map((date) => {
    const hit = reports.find((r) => r.reportDate === date && matches(r, cond))
    if (hit === undefined) {
      return { reportDate: date, status: '未作成', report: null, reporterId: null }
    }
    return { reportDate: date, status: hit.status, report: hit, reporterId: hit.reporterId }
  })
}
