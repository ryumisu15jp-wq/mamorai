// [REQ-013] 月報出力用の中間データ構造 buildMonthlyExportTable の RED テスト
// テスト規約: AAA / 「対象_条件_期待」 / 行数・ヘッダ・セル値を具体的に検証（実ファイル生成はしない）
//
// 期待する ExportTable レイアウト（この契約に厳密一致）:
//   headers: ['項目', '値', '前月比']
//   rows（上から順）:
//     1. ['報告日数', summary.reportDays, '']
//     2. ['対応件数合計', summary.totalResponses, '']
//     3. ['インシデント件数', summary.incidentCount, '']
//     4. ['承認率', summary.approvalRate, '']
//     5..  breakdown.byType: [type, count, delta]  （delta が null の場合は ''）
//     ..   breakdown.dailyTrend: [date, count, '']
//   → 総行数 = 4 + byType.length + dailyTrend.length
import { describe, it, expect } from 'vitest'
import { buildMonthlyExportTable } from '../index.js'
import type { MonthlySummary, IncidentBreakdown } from '../types.js'

const summary: MonthlySummary = {
  reportDays: 20,
  totalResponses: 137,
  incidentCount: 5,
  approvalRate: 0.9,
}

const breakdown: IncidentBreakdown = {
  byType: [{ type: 'unlocked', count: 5, prevCount: 3, delta: 2 }],
  dailyTrend: [
    { date: '2026-07-01', count: 3 },
    { date: '2026-07-02', count: 0 },
  ],
}

describe('buildMonthlyExportTable [REQ-013]', () => {
  it('buildMonthlyExportTable_title_対象月を含む', () => {
    // Arrange & Act
    const table = buildMonthlyExportTable('2026-07', summary, breakdown)
    // Assert
    expect(table.title).toContain('2026-07')
  })

  it('buildMonthlyExportTable_headers_項目_値_前月比の3列', () => {
    // Arrange & Act
    const table = buildMonthlyExportTable('2026-07', summary, breakdown)
    // Assert
    expect(table.headers).toEqual(['項目', '値', '前月比'])
  })

  it('buildMonthlyExportTable_行数_サマリー4行+種別別+日別推移', () => {
    // Arrange & Act
    const table = buildMonthlyExportTable('2026-07', summary, breakdown)
    // Assert: 4 + 1 + 2 = 7
    expect(table.rows).toHaveLength(4 + breakdown.byType.length + breakdown.dailyTrend.length)
  })

  it('buildMonthlyExportTable_サマリー4指標_ラベルと値がセルに反映される', () => {
    // Arrange & Act
    const table = buildMonthlyExportTable('2026-07', summary, breakdown)
    // Assert
    expect(table.rows[0]).toEqual(['報告日数', 20, ''])
    expect(table.rows[1]).toEqual(['対応件数合計', 137, ''])
    expect(table.rows[2]).toEqual(['インシデント件数', 5, ''])
    expect(table.rows[3]).toEqual(['承認率', 0.9, ''])
  })

  it('buildMonthlyExportTable_種別別内訳_count/前月比を載せる', () => {
    // Arrange & Act
    const table = buildMonthlyExportTable('2026-07', summary, breakdown)
    // Assert: サマリー4行の次に byType 行
    expect(table.rows[4]).toEqual(['unlocked', 5, 2])
  })

  it('buildMonthlyExportTable_日別推移_日付とcountを載せる', () => {
    // Arrange & Act
    const table = buildMonthlyExportTable('2026-07', summary, breakdown)
    // Assert: byType 1行の後に dailyTrend
    expect(table.rows[5]).toEqual(['2026-07-01', 3, ''])
    expect(table.rows[6]).toEqual(['2026-07-02', 0, ''])
  })

  it('buildMonthlyExportTable_前月比null_前月比セルは空文字', () => {
    // Arrange
    const noPrev: IncidentBreakdown = {
      byType: [{ type: 'unlocked', count: 5, prevCount: null, delta: null }],
      dailyTrend: [],
    }
    // Act
    const table = buildMonthlyExportTable('2026-07', summary, noPrev)
    // Assert
    expect(table.rows[4]).toEqual(['unlocked', 5, ''])
  })
})
