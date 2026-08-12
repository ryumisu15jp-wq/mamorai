// [REQ-017] 日次配置表の生成と欠員検出 buildDailyAssignment の RED テスト
// テスト規約: AAA / 「対象_条件_期待」 / 欠員ゼロ・複数の境界 / 純粋・決定論
import { describe, it, expect } from 'vitest'
import { buildDailyAssignment } from '../index.js'
import {
  SITE_ID,
  cell,
  POS_SEKININSHA,
  POS_NIKKIN_A,
  POS_YAKIN_A,
  s1,
  s2,
  s3,
  STAFF_ALL,
} from './s3_fixtures.js'

const DATE = '2026-08-10'

describe('buildDailyAssignment [REQ-017] 稼働スタッフの割当', () => {
  it('buildDailyAssignment_workTypeがpositionと一致_当該スタッフを割当てる', () => {
    // Arrange
    const cells = [
      cell('s1', DATE, '責任者'),
      cell('s2', DATE, '日勤A'),
      cell('s4', DATE, '夜勤A'),
    ]
    // Act
    const result = buildDailyAssignment(SITE_ID, DATE, cells, [POS_SEKININSHA, POS_NIKKIN_A, POS_YAKIN_A], STAFF_ALL)
    // Assert
    expect(result.siteId).toBe(SITE_ID)
    expect(result.date).toBe(DATE)
    expect(result.cells.find((c) => c.position === '責任者')?.staffId).toBe('s1')
    expect(result.cells.find((c) => c.position === '日勤A')?.staffId).toBe('s2')
    expect(result.vacancies).toHaveLength(0)
  })

  it('buildDailyAssignment_別日付や別workType_割当対象から除外する', () => {
    // Arrange: DATE 以外 / position 不一致 の workType は稼働扱いしない
    const cells = [
      cell('s1', '2026-08-09', '日勤A'), // 別日
      cell('s2', DATE, '公休'), // position不一致
    ]
    // Act
    const result = buildDailyAssignment(SITE_ID, DATE, cells, [POS_NIKKIN_A], STAFF_ALL)
    // Assert
    expect(result.cells.find((c) => c.position === '日勤A')?.staffId).toBeNull()
    expect(result.vacancies).toEqual([{ position: '日勤A', shortBy: 1 }])
  })

  it('buildDailyAssignment_欠員ゼロ_vacanciesが空になる（境界）', () => {
    // Arrange
    const cells = [cell('s2', DATE, '日勤A')]
    // Act
    const result = buildDailyAssignment(SITE_ID, DATE, cells, [POS_NIKKIN_A], STAFF_ALL)
    // Assert
    expect(result.vacancies).toHaveLength(0)
    expect(result.cells.find((c) => c.position === '日勤A')?.staffId).toBe('s2')
  })

  it('buildDailyAssignment_稼働者不在_欠員セルをnullで表す（境界: 欠員1）', () => {
    // Arrange
    const cells: ReturnType<typeof cell>[] = []
    // Act
    const result = buildDailyAssignment(SITE_ID, DATE, cells, [POS_NIKKIN_A], STAFF_ALL)
    // Assert
    expect(result.cells).toHaveLength(1)
    expect(result.cells[0].staffId).toBeNull()
    expect(result.vacancies).toEqual([{ position: '日勤A', shortBy: 1 }])
  })

  it('buildDailyAssignment_必要人数複数で一部不足_欠員数をshortByで表す（境界: 欠員複数）', () => {
    // Arrange: 日勤A は3名必要だが1名しか稼働していない
    const pos3 = { position: '日勤A', requiredHeadcount: 3 }
    const cells = [cell('s2', DATE, '日勤A')]
    // Act
    const result = buildDailyAssignment(SITE_ID, DATE, cells, [pos3], STAFF_ALL)
    // Assert
    const filled = result.cells.filter((c) => c.staffId !== null)
    const empty = result.cells.filter((c) => c.staffId === null)
    expect(filled).toHaveLength(1)
    expect(empty).toHaveLength(2)
    expect(result.vacancies).toEqual([{ position: '日勤A', shortBy: 2 }])
  })

  it('buildDailyAssignment_資格要件を満たさない稼働者_割当てず欠員にする', () => {
    // Arrange: s3 は無資格。責任者(要 施設警備2級) には割当不可
    const cells = [cell('s3', DATE, '責任者')]
    // Act
    const result = buildDailyAssignment(SITE_ID, DATE, cells, [POS_SEKININSHA], STAFF_ALL)
    // Assert
    expect(result.cells.find((c) => c.position === '責任者')?.staffId).toBeNull()
    expect(result.vacancies).toEqual([{ position: '責任者', shortBy: 1 }])
  })

  it('buildDailyAssignment_資格保持の稼働者_資格要件positionへ割当てる', () => {
    // Arrange: s1 は 施設警備2級 保持
    const cells = [cell('s1', DATE, '責任者')]
    // Act
    const result = buildDailyAssignment(SITE_ID, DATE, cells, [POS_SEKININSHA], STAFF_ALL)
    // Assert
    expect(result.cells.find((c) => c.position === '責任者')?.staffId).toBe('s1')
    expect(result.vacancies).toHaveLength(0)
  })

  it('buildDailyAssignment_staff未指定_資格チェックを行わず割当てる', () => {
    // Arrange: staff を渡さない → 資格検証しない
    const cells = [cell('s3', DATE, '責任者')]
    // Act
    const result = buildDailyAssignment(SITE_ID, DATE, cells, [POS_SEKININSHA])
    // Assert
    expect(result.cells.find((c) => c.position === '責任者')?.staffId).toBe('s3')
    expect(result.vacancies).toHaveLength(0)
  })

  it('buildDailyAssignment_同一position複数割当_staffId昇順で安定ソートする', () => {
    // Arrange
    const pos2 = { position: '日勤A', requiredHeadcount: 2 }
    const cells = [cell('s2', DATE, '日勤A'), cell('s1', DATE, '日勤A')]
    // Act
    const result = buildDailyAssignment(SITE_ID, DATE, cells, [pos2], STAFF_ALL)
    // Assert
    const ids = result.cells.map((c) => c.staffId)
    expect(ids).toEqual(['s1', 's2'])
  })
})
