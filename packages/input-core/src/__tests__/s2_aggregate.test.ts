// [REQ-010/011/012] 集計（counter合算 / 月報サマリー / インシデント内訳・日別推移）の RED テスト
// テスト規約: AAA / 「対象_条件_期待」 / 前月比±0・増・減・前月なし / 項目欠落 / 空配列
import { describe, it, expect } from 'vitest'
import { aggregateCounters, monthlySummary, incidentBreakdown } from '../index.js'
import type { DailyReport } from '../types.js'
import { makeReport } from './fixtures.js'

function rep(date: string, counter: Record<string, unknown>, extra: Partial<DailyReport> = {}): DailyReport {
  return makeReport({
    status: '承認済',
    reportDate: date,
    values: { counter: counter as DailyReport['values'][string] },
    ...extra,
  })
}

describe('aggregateCounters [REQ-010]', () => {
  it('aggregateCounters_複数日報_field.key単位で合算する', () => {
    // Arrange
    const reports = [
      rep('2026-07-01', { unlocked: 2, elvCall: 1, cardReg: 0 }),
      rep('2026-07-02', { unlocked: 3, elvCall: 4, cardReg: 5 }),
    ]
    // Act
    const res = aggregateCounters(reports)
    // Assert
    expect(res).toEqual({ unlocked: 5, elvCall: 5, cardReg: 5 })
  })

  it('aggregateCounters_項目欠落_存在分だけ加算し欠損扱いにしない', () => {
    // Arrange: 2件目に elvCall が無い
    const reports = [
      rep('2026-07-01', { unlocked: 2, elvCall: 1 }),
      rep('2026-07-02', { unlocked: 3 }),
    ]
    // Act
    const res = aggregateCounters(reports)
    // Assert
    expect(res).toEqual({ unlocked: 5, elvCall: 1 })
  })

  it('aggregateCounters_非数値の値_無視する', () => {
    // Arrange
    const reports = [rep('2026-07-01', { unlocked: 2, note: '文字列', flag: true, empty: null })]
    // Act
    const res = aggregateCounters(reports)
    // Assert
    expect(res).toEqual({ unlocked: 2 })
  })

  it('aggregateCounters_空配列_空オブジェクトを返す', () => {
    // Arrange & Act & Assert
    expect(aggregateCounters([])).toEqual({})
  })
})

describe('monthlySummary [REQ-011]', () => {
  it('monthlySummary_reportDays_reports件数を返す', () => {
    // Arrange
    const reports = [
      rep('2026-07-01', { unlocked: 1 }),
      rep('2026-07-02', { unlocked: 1 }),
      rep('2026-07-03', { unlocked: 1 }),
    ]
    // Act
    const res = monthlySummary(reports)
    // Assert
    expect(res.reportDays).toBe(3)
  })

  it('monthlySummary_totalResponses_全counter値の総和を返す', () => {
    // Arrange
    const reports = [
      rep('2026-07-01', { unlocked: 2, elvCall: 1 }),
      rep('2026-07-02', { unlocked: 3, cardReg: 4 }),
    ]
    // Act
    const res = monthlySummary(reports)
    // Assert: 2+1+3+4 = 10
    expect(res.totalResponses).toBe(10)
  })

  it('monthlySummary_incidentKeys指定_該当キーのcounter合計を返す', () => {
    // Arrange
    const reports = [
      rep('2026-07-01', { unlocked: 2, elvCall: 1 }),
      rep('2026-07-02', { unlocked: 3, elvCall: 4 }),
    ]
    // Act
    const res = monthlySummary(reports, { incidentKeys: ['unlocked'] })
    // Assert
    expect(res.incidentCount).toBe(5)
  })

  it('monthlySummary_incidentKeys未指定_incidentCountは0', () => {
    // Arrange
    const reports = [rep('2026-07-01', { unlocked: 2 })]
    // Act
    const res = monthlySummary(reports)
    // Assert
    expect(res.incidentCount).toBe(0)
  })

  it('monthlySummary_approvalRate_承認済/(提出済+承認済+差し戻し)を返す', () => {
    // Arrange: 承認済2 提出済1 差し戻し1 下書き1(分母外)
    const reports = [
      rep('2026-07-01', {}, { status: '承認済' }),
      rep('2026-07-02', {}, { status: '承認済' }),
      rep('2026-07-03', {}, { status: '提出済' }),
      rep('2026-07-04', {}, { status: '差し戻し' }),
      rep('2026-07-05', {}, { status: '下書き' }),
    ]
    // Act
    const res = monthlySummary(reports)
    // Assert: 2 / (1+2+1) = 0.5
    expect(res.approvalRate).toBe(0.5)
  })

  it('monthlySummary_分母0_approvalRateは0', () => {
    // Arrange: 下書きのみ
    const reports = [rep('2026-07-01', {}, { status: '下書き' })]
    // Act
    const res = monthlySummary(reports)
    // Assert
    expect(res.approvalRate).toBe(0)
  })

  it('monthlySummary_approvalRate_0以上1以下に収まる', () => {
    // Arrange: 全て承認済
    const reports = [
      rep('2026-07-01', {}, { status: '承認済' }),
      rep('2026-07-02', {}, { status: '承認済' }),
    ]
    // Act
    const res = monthlySummary(reports)
    // Assert
    expect(res.approvalRate).toBe(1)
    expect(res.approvalRate).toBeLessThanOrEqual(1)
    expect(res.approvalRate).toBeGreaterThanOrEqual(0)
  })
})

describe('incidentBreakdown [REQ-012] byType 前月比', () => {
  const current = [
    rep('2026-07-01', { unlocked: 3 }),
    rep('2026-07-10', { unlocked: 2 }),
  ]

  it('incidentBreakdown_prevReports未指定_prevCountとdeltaはnull', () => {
    // Arrange & Act
    const res = incidentBreakdown(current, '2026-07', { incidentKeys: ['unlocked'] })
    // Assert
    const stat = res.byType.find((b) => b.type === 'unlocked')!
    expect(stat.count).toBe(5)
    expect(stat.prevCount).toBeNull()
    expect(stat.delta).toBeNull()
  })

  it('incidentBreakdown_前月増加_deltaは正の差分', () => {
    // Arrange: prev=3 → count=5
    const prev = [rep('2026-06-01', { unlocked: 3 })]
    // Act
    const res = incidentBreakdown(current, '2026-07', { incidentKeys: ['unlocked'] }, prev)
    // Assert
    const stat = res.byType.find((b) => b.type === 'unlocked')!
    expect(stat.prevCount).toBe(3)
    expect(stat.delta).toBe(2)
  })

  it('incidentBreakdown_前月減少_deltaは負の差分', () => {
    // Arrange: prev=8 → count=5
    const prev = [rep('2026-06-01', { unlocked: 8 })]
    // Act
    const res = incidentBreakdown(current, '2026-07', { incidentKeys: ['unlocked'] }, prev)
    // Assert
    const stat = res.byType.find((b) => b.type === 'unlocked')!
    expect(stat.delta).toBe(-3)
  })

  it('incidentBreakdown_前月同数_deltaは0', () => {
    // Arrange: prev=5 → count=5
    const prev = [rep('2026-06-01', { unlocked: 5 })]
    // Act
    const res = incidentBreakdown(current, '2026-07', { incidentKeys: ['unlocked'] }, prev)
    // Assert
    const stat = res.byType.find((b) => b.type === 'unlocked')!
    expect(stat.delta).toBe(0)
  })

  it('incidentBreakdown_incidentKeys未指定_byTypeは空配列', () => {
    // Arrange & Act
    const res = incidentBreakdown(current, '2026-07')
    // Assert
    expect(res.byType).toEqual([])
  })
})

describe('incidentBreakdown [REQ-012] dailyTrend', () => {
  it('incidentBreakdown_dailyTrend_当月日数分の配列を昇順で返す', () => {
    // Arrange & Act
    const res = incidentBreakdown([], '2026-02') // 非うるう年 28日
    // Assert
    expect(res.dailyTrend).toHaveLength(28)
    expect(res.dailyTrend[0].date).toBe('2026-02-01')
    expect(res.dailyTrend[27].date).toBe('2026-02-28')
  })

  it('incidentBreakdown_dailyTrend_その日の全counter合計をcountにする', () => {
    // Arrange
    const reports = [
      rep('2026-07-03', { unlocked: 2, elvCall: 1 }),
      rep('2026-07-03', { unlocked: 3 }),
    ]
    // Act
    const res = incidentBreakdown(reports, '2026-07')
    const day3 = res.dailyTrend.find((d) => d.date === '2026-07-03')!
    // Assert: 2+1+3 = 6
    expect(day3.count).toBe(6)
  })

  it('incidentBreakdown_dailyTrend_レコード無し日はcount0', () => {
    // Arrange
    const reports = [rep('2026-07-03', { unlocked: 2 })]
    // Act
    const res = incidentBreakdown(reports, '2026-07')
    const day4 = res.dailyTrend.find((d) => d.date === '2026-07-04')!
    // Assert
    expect(day4.count).toBe(0)
  })

  it('incidentBreakdown_空配列_全日count0', () => {
    // Arrange & Act
    const res = incidentBreakdown([], '2026-07')
    // Assert
    expect(res.dailyTrend.every((d) => d.count === 0)).toBe(true)
  })
})
