// [REQ-016] シフト表モデル: mergeShiftCells / monthlyWorkTypeCounts の RED テスト
// テスト規約: AAA / 「対象_条件_期待」 / 境界値 / 純粋・決定論
import { describe, it, expect } from 'vitest'
import { mergeShiftCells, monthlyWorkTypeCounts } from '../index.js'
import { cell, grid } from './s3_fixtures.js'

describe('mergeShiftCells [REQ-016] override が base を上書き', () => {
  it('mergeShiftCells_同一staffと日付のoverride_baseを上書きする', () => {
    // Arrange
    const base = [cell('s1', '2026-08-10', '日勤', 'base')]
    const overrides = [cell('s1', '2026-08-10', '夜勤', 'manual')]
    // Act
    const merged = mergeShiftCells(base, overrides)
    // Assert
    expect(merged).toHaveLength(1)
    expect(merged[0].workType).toBe('夜勤')
    expect(merged[0].source).toBe('manual')
  })

  it('mergeShiftCells_overrideに無いbase_保持する', () => {
    // Arrange
    const base = [cell('s1', '2026-08-10', '日勤'), cell('s2', '2026-08-10', '夜勤')]
    const overrides = [cell('s1', '2026-08-10', '公休', 'manual')]
    // Act
    const merged = mergeShiftCells(base, overrides)
    // Assert
    expect(merged).toHaveLength(2)
    const s2cell = merged.find((c) => c.staffId === 's2')
    expect(s2cell?.workType).toBe('夜勤')
  })

  it('mergeShiftCells_結果_date昇順そしてstaffId昇順で安定ソートされる', () => {
    // Arrange
    const base = [
      cell('s2', '2026-08-11', '日勤'),
      cell('s1', '2026-08-11', '日勤'),
      cell('s2', '2026-08-10', '夜勤'),
    ]
    const overrides = [cell('s1', '2026-08-10', '研修', 'manual')]
    // Act
    const merged = mergeShiftCells(base, overrides)
    // Assert
    const keys = merged.map((c) => `${c.date}#${c.staffId}`)
    expect(keys).toEqual([
      '2026-08-10#s1',
      '2026-08-10#s2',
      '2026-08-11#s1',
      '2026-08-11#s2',
    ])
  })

  it('mergeShiftCells_空のoverride_baseをそのまま安定ソートで返す', () => {
    // Arrange
    const base = [cell('s1', '2026-08-10', '日勤')]
    // Act
    const merged = mergeShiftCells(base, [])
    // Assert
    expect(merged).toHaveLength(1)
    expect(merged[0].staffId).toBe('s1')
  })

  it('mergeShiftCells_baseもoverrideも空_空配列を返す（境界）', () => {
    // Arrange & Act
    const merged = mergeShiftCells([], [])
    // Assert
    expect(merged).toEqual([])
  })
})

describe('monthlyWorkTypeCounts [REQ-016] スタッフ別・勤務区分別件数', () => {
  it('monthlyWorkTypeCounts_複数スタッフの勤務区分_区分別に件数を集計する', () => {
    // Arrange
    const g = grid([
      cell('s1', '2026-08-10', '日勤'),
      cell('s1', '2026-08-11', '日勤'),
      cell('s1', '2026-08-12', '夜勤'),
      cell('s2', '2026-08-10', '公休'),
    ])
    // Act
    const counts = monthlyWorkTypeCounts(g)
    // Assert
    expect(counts['s1']['日勤']).toBe(2)
    expect(counts['s1']['夜勤']).toBe(1)
    expect(counts['s2']['公休']).toBe(1)
  })

  it('monthlyWorkTypeCounts_セル無しのグリッド_空オブジェクトを返す（境界）', () => {
    // Arrange & Act
    const counts = monthlyWorkTypeCounts(grid([]))
    // Assert
    expect(counts).toEqual({})
  })
})
