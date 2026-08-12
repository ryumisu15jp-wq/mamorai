// [REQ-009] 日報一覧の検索・フィルタ・未作成補完 の RED テスト
// テスト規約: AAA / 「対象_条件_期待」 / 月末日数の境界（うるう年含む）
import { describe, it, expect } from 'vitest'
import { filterReports, buildMonthlyList } from '../index.js'
import type { DailyReport } from '../types.js'
import { makeReport } from './fixtures.js'

function rep(date: string, extra: Partial<DailyReport> = {}): DailyReport {
  return makeReport({ status: '提出済', reportDate: date, ...extra })
}

describe('filterReports [REQ-009]', () => {
  const reports: DailyReport[] = [
    rep('2026-08-01', { status: '提出済', reporterId: 'u1', values: { gate: { note: '巡回異常なし' } } }),
    rep('2026-08-02', { status: '承認済', reporterId: 'u2', values: { gate: { note: 'ELV呼出対応' } } }),
    rep('2026-08-03', { status: '下書き', reporterId: 'u1', values: { gate: { note: 'カード登録3件' } } }),
  ]

  it('filterReports_status一致_該当statusのみ返す', () => {
    // Arrange & Act
    const res = filterReports(reports, { status: '承認済' })
    // Assert
    expect(res).toHaveLength(1)
    expect(res[0].reportDate).toBe('2026-08-02')
  })

  it('filterReports_reporterId一致_該当報告者のみ返す', () => {
    // Arrange & Act
    const res = filterReports(reports, { reporterId: 'u1' })
    // Assert
    expect(res.map((r) => r.reportDate)).toEqual(['2026-08-01', '2026-08-03'])
  })

  it('filterReports_keyword_values内文字列に部分一致する', () => {
    // Arrange & Act
    const res = filterReports(reports, { keyword: 'ELV' })
    // Assert
    expect(res).toHaveLength(1)
    expect(res[0].reportDate).toBe('2026-08-02')
  })

  it('filterReports_keyword_大文字小文字を区別しない', () => {
    // Arrange & Act
    const res = filterReports(reports, { keyword: 'elv' })
    // Assert
    expect(res).toHaveLength(1)
    expect(res[0].reportDate).toBe('2026-08-02')
  })

  it('filterReports_複合条件_ANDで絞り込む', () => {
    // Arrange & Act
    const res = filterReports(reports, { reporterId: 'u1', keyword: 'カード' })
    // Assert
    expect(res).toHaveLength(1)
    expect(res[0].reportDate).toBe('2026-08-03')
  })

  it('filterReports_空フィルタ_全件返す', () => {
    // Arrange & Act
    const res = filterReports(reports, {})
    // Assert
    expect(res).toHaveLength(3)
  })
})

describe('buildMonthlyList [REQ-009] 月末日数の境界', () => {
  it.each([
    ['2026-02', 28], // 非うるう年
    ['2024-02', 29], // うるう年
    ['2026-04', 30], // 30日月
    ['2026-07', 31], // 31日月
  ])('buildMonthlyList_%s_行数はその月の日数(%i)になる', (month, days) => {
    // Arrange & Act
    const rows = buildMonthlyList([], month)
    // Assert
    expect(rows).toHaveLength(days)
  })

  it('buildMonthlyList_reportDate昇順_1日から末日まで整列する', () => {
    // Arrange & Act
    const rows = buildMonthlyList([], '2026-07')
    // Assert
    expect(rows[0].reportDate).toBe('2026-07-01')
    expect(rows[rows.length - 1].reportDate).toBe('2026-07-31')
    const sorted = [...rows].sort((a, b) => a.reportDate.localeCompare(b.reportDate))
    expect(rows.map((r) => r.reportDate)).toEqual(sorted.map((r) => r.reportDate))
  })

  it('buildMonthlyList_日報あり_status_report_reporterIdを載せる', () => {
    // Arrange
    const r = rep('2026-07-05', { status: '承認済', reporterId: 'u9' })
    // Act
    const rows = buildMonthlyList([r], '2026-07')
    const row = rows.find((x) => x.reportDate === '2026-07-05')!
    // Assert
    expect(row.status).toBe('承認済')
    expect(row.reporterId).toBe('u9')
    expect(row.report).not.toBeNull()
    expect(row.report!.id).toBe(r.id)
  })

  it('buildMonthlyList_日報なしの日_未作成でnull補完する', () => {
    // Arrange
    const r = rep('2026-07-05', { status: '承認済', reporterId: 'u9' })
    // Act
    const rows = buildMonthlyList([r], '2026-07')
    const empty = rows.find((x) => x.reportDate === '2026-07-06')!
    // Assert
    expect(empty.status).toBe('未作成')
    expect(empty.report).toBeNull()
    expect(empty.reporterId).toBeNull()
  })

  it('buildMonthlyList_filter不一致の実レコード_未作成扱いになる', () => {
    // Arrange
    const r = rep('2026-07-05', { status: '提出済', reporterId: 'u9' })
    // Act: status=承認済 で絞ると 07-05 は条件外 → 未作成行
    const rows = buildMonthlyList([r], '2026-07', { status: '承認済' })
    const day = rows.find((x) => x.reportDate === '2026-07-05')!
    // Assert
    expect(day.status).toBe('未作成')
    expect(day.report).toBeNull()
    expect(day.reporterId).toBeNull()
  })
})
