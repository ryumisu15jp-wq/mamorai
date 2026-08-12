// [REQ-023] 教育・資格: classifyQualification / listQualificationViews / trainingAchievement の RED テスト
// テスト規約: AAA / 「対象_条件_期待」 / 境界値 / 純粋・決定論（日付は 'YYYY-MM-DD'）
import { describe, it, expect } from 'vitest'
import {
  classifyQualification,
  listQualificationViews,
  trainingAchievement,
} from '../index.js'
import { qual, training } from './s4_fixtures.js'

const REF = '2026-08-11'
const THRESHOLD = 30

describe('classifyQualification [REQ-023] 期限と閾値で状態分類', () => {
  it('classifyQualification_前日_期限切れ', () => {
    // Arrange（境界: referenceDate の前日 → 期限切れ）
    // Act
    const s = classifyQualification('2026-08-10', REF, THRESHOLD)
    // Assert
    expect(s).toBe('期限切れ')
  })

  it('classifyQualification_当日_更新間近', () => {
    // Arrange（境界: ちょうど referenceDate → 更新間近）
    // Act
    const s = classifyQualification('2026-08-11', REF, THRESHOLD)
    // Assert
    expect(s).toBe('更新間近')
  })

  it('classifyQualification_閾値ちょうど_更新間近', () => {
    // Arrange（境界: referenceDate+30日 = 2026-09-10 → 更新間近）
    // Act
    const s = classifyQualification('2026-09-10', REF, THRESHOLD)
    // Assert
    expect(s).toBe('更新間近')
  })

  it('classifyQualification_閾値プラス1日_有効', () => {
    // Arrange（境界: referenceDate+31日 = 2026-09-11 → 有効）
    // Act
    const s = classifyQualification('2026-09-11', REF, THRESHOLD)
    // Assert
    expect(s).toBe('有効')
  })

  it('classifyQualification_遠い将来_有効', () => {
    // Arrange
    // Act
    const s = classifyQualification('2027-08-11', REF, THRESHOLD)
    // Assert
    expect(s).toBe('有効')
  })
})

describe('listQualificationViews [REQ-023] status と daysToExpiry を付与', () => {
  it('listQualificationViews_混在資格_入力順でstatusとdaysToExpiryを付与', () => {
    // Arrange
    const quals = [
      qual('s1', '2026-08-10'), // 前日 → 期限切れ / -1
      qual('s2', '2026-09-10'), // +30日 → 更新間近 / 30
      qual('s3', '2026-09-11'), // +31日 → 有効 / 31
    ]
    // Act
    const views = listQualificationViews(quals, REF, THRESHOLD)
    // Assert（並び順維持）
    expect(views.map((v) => v.staffId)).toEqual(['s1', 's2', 's3'])
    expect(views.map((v) => v.status)).toEqual(['期限切れ', '更新間近', '有効'])
    expect(views.map((v) => v.daysToExpiry)).toEqual([-1, 30, 31])
  })

  it('listQualificationViews_当日_daysToExpiryは0で更新間近', () => {
    // Arrange（境界）
    const quals = [qual('s1', '2026-08-11')]
    // Act
    const views = listQualificationViews(quals, REF, THRESHOLD)
    // Assert
    expect(views[0].daysToExpiry).toBe(0)
    expect(views[0].status).toBe('更新間近')
  })

  it('listQualificationViews_空配列_空を返す', () => {
    // Arrange（境界）
    // Act
    const views = listQualificationViews([], REF, THRESHOLD)
    // Assert
    expect(views).toEqual([])
  })
})

describe('trainingAchievement [REQ-023] 達成率を0..1にクランプ', () => {
  it('trainingAchievement_32of45_比率を返す', () => {
    // Arrange（新任基本研修 45h のうち 32h 履修）
    const rec = training('s1', 32)
    // Act
    const r = trainingAchievement(rec)
    // Assert
    expect(r).toBeCloseTo(32 / 45, 10)
  })

  it('trainingAchievement_満了_1を返す', () => {
    // Arrange（境界: completed===required）
    const rec = training('s1', 45)
    // Act
    const r = trainingAchievement(rec)
    // Assert
    expect(r).toBe(1)
  })

  it('trainingAchievement_超過_1にクランプ', () => {
    // Arrange（境界: completed>required）
    const rec = training('s1', 60)
    // Act
    const r = trainingAchievement(rec)
    // Assert
    expect(r).toBe(1)
  })

  it('trainingAchievement_未履修_0を返す', () => {
    // Arrange（境界: completed===0）
    const rec = training('s1', 0)
    // Act
    const r = trainingAchievement(rec)
    // Assert
    expect(r).toBe(0)
  })

  it('trainingAchievement_required0_対象なし満了で1を返す', () => {
    // Arrange（境界: required===0 は 1(=対象なし満了) と定義）
    const rec = training('s1', 0, 0)
    // Act
    const r = trainingAchievement(rec)
    // Assert
    expect(r).toBe(1)
  })
})
