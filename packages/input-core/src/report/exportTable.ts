// [REQ-013] 月報出力用の中間データ構造（純粋）
import type { MonthlySummary, IncidentBreakdown, ExportTable } from '../types.js'

/**
 * [REQ-013] 月報を ExportTable（title/headers/rows）へ変換する。
 * headers: ['項目','値','前月比']
 * rows: サマリー4行 → byType[type,count,delta] → dailyTrend[date,count,'']。
 * delta が null の前月比セルは空文字。
 */
export function buildMonthlyExportTable(
  month: string,
  summary: MonthlySummary,
  breakdown: IncidentBreakdown
): ExportTable {
  const rows: (string | number)[][] = [
    ['報告日数', summary.reportDays, ''],
    ['対応件数合計', summary.totalResponses, ''],
    ['インシデント件数', summary.incidentCount, ''],
    ['承認率', summary.approvalRate, ''],
  ]
  for (const stat of breakdown.byType) {
    rows.push([stat.type, stat.count, stat.delta === null ? '' : stat.delta])
  }
  for (const day of breakdown.dailyTrend) {
    rows.push([day.date, day.count, ''])
  }
  return {
    title: `月報サマリー ${month}`,
    headers: ['項目', '値', '前月比'],
    rows,
  }
}
