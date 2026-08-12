// [REQ-010..012] 集計（counter合算 / 月報サマリー / インシデント内訳・日別推移）（純粋）
import type { DailyReport, AggregateConfig, MonthlySummary, IncidentBreakdown, IncidentTypeStat, DailyCount } from '../types.js'
import { monthDates } from './monthDays.js'

/** [REQ-010] values 内の数値を field.key 単位で合算（非数値は無視・欠落許容） */
export function aggregateCounters(reports: DailyReport[]): Record<string, number> {
  const acc: Record<string, number> = {}
  for (const report of reports) {
    for (const section of Object.values(report.values)) {
      for (const [key, value] of Object.entries(section)) {
        if (typeof value === 'number' && Number.isFinite(value)) {
          acc[key] = (acc[key] ?? 0) + value
        }
      }
    }
  }
  return acc
}

/** counter 数値の総和（全 field.key 分） */
function sumAll(reports: DailyReport[]): number {
  const counters = aggregateCounters(reports)
  return Object.values(counters).reduce((a, b) => a + b, 0)
}

/** 指定 key 群の counter 合計 */
function sumKeys(reports: DailyReport[], keys: string[]): number {
  const counters = aggregateCounters(reports)
  return keys.reduce((a, k) => a + (counters[k] ?? 0), 0)
}

/**
 * [REQ-011] 月報サマリー4指標。
 * approvalRate = 承認済 / (提出済+承認済+差し戻し)。分母0なら0。
 */
export function monthlySummary(reports: DailyReport[], config?: AggregateConfig): MonthlySummary {
  const incidentKeys = config?.incidentKeys ?? []
  let approved = 0
  let denom = 0
  for (const r of reports) {
    if (r.status === '承認済') {
      approved++
      denom++
    } else if (r.status === '提出済' || r.status === '差し戻し') {
      denom++
    }
  }
  return {
    reportDays: reports.length,
    totalResponses: sumAll(reports),
    incidentCount: sumKeys(reports, incidentKeys),
    approvalRate: denom === 0 ? 0 : approved / denom,
  }
}

/**
 * [REQ-012] インシデント種別内訳（前月比つき）＋当月日別推移。
 * incidentKeys 未指定 → byType は空配列。prevReports 未指定 → prevCount/delta は null。
 */
export function incidentBreakdown(
  reports: DailyReport[],
  month: string,
  config?: AggregateConfig,
  prevReports?: DailyReport[]
): IncidentBreakdown {
  const incidentKeys = config?.incidentKeys ?? []
  const current = aggregateCounters(reports)
  const prev = prevReports === undefined ? null : aggregateCounters(prevReports)

  const byType: IncidentTypeStat[] = incidentKeys.map((key) => {
    const count = current[key] ?? 0
    const prevCount = prev === null ? null : prev[key] ?? 0
    const delta = prevCount === null ? null : count - prevCount
    return { type: key, count, prevCount, delta }
  })

  const dailyTrend: DailyCount[] = monthDates(month).map((date) => {
    const sameDay = reports.filter((r) => r.reportDate === date)
    return { date, count: sumAll(sameDay) }
  })

  return { byType, dailyTrend }
}
