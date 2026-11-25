import { describe, expect, it } from 'vitest'
import {
  checkEducation, checkNewPin, checkWork, expiryStatus, fitSize, normalizeEmail, normalizePhone, normalizePostal, PREFECTURES, summarizeRequest,
} from './profileLogic.js'

describe('profileLogic', () => {
  it('電話番号を整え、形式が違えば理由を返す', () => {
    expect(normalizePhone('090-0000-0000')).toEqual({ value: '09000000000' })
    expect(normalizePhone('  ')).toEqual({ value: null })
    expect(normalizePhone('123').error).toBeTruthy()
  })
  it('郵便番号を 3-4 桁にそろえる', () => {
    expect(normalizePostal('1000001')).toEqual({ value: '100-0001' })
    expect(normalizePostal('100-0001')).toEqual({ value: '100-0001' })
    expect(normalizePostal('10').error).toBeTruthy()
  })
  it('期限の状態: 切れ・間近(30日)・有効・期限なし', () => {
    expect(expiryStatus('2026-01-01', '2026-02-01')).toBe('期限切れ')
    expect(expiryStatus('2026-02-20', '2026-02-01')).toBe('更新間近')
    expect(expiryStatus('2027-02-01', '2026-02-01')).toBe('有効')
    expect(expiryStatus(null, '2026-02-01')).toBeNull()
  })
  it('画像は長辺だけ縮小し、拡大しない', () => {
    expect(fitSize(4000, 3000, 1000)).toEqual({ w: 1000, h: 750 })
    expect(fitSize(800, 600, 1000)).toEqual({ w: 800, h: 600 })
  })
  it('PIN変更の入力チェック', () => {
    expect(checkNewPin('1234', '5678', '5678')).toBeNull()
    expect(checkNewPin('1234', '56', '56')).toBeTruthy()
    expect(checkNewPin('1234', '5678', '5679')).toBeTruthy()
    expect(checkNewPin('1234', '1234', '1234')).toBeTruthy()
    expect(checkNewPin('1234', 'abcd', 'abcd')).toBeTruthy()
  })
  it('メールの形式', () => {
    expect(normalizeEmail(' a@example.invalid ')).toEqual({ value: 'a@example.invalid' })
    expect(normalizeEmail('')).toEqual({ value: null })
    expect(normalizeEmail('abc').error).toBeTruthy()
  })
  it('学歴・業務経歴の入力チェック', () => {
    expect(checkEducation([{ school: '架空大学', entered: '2010', graduated: '2014' }])).toBeNull()
    expect(checkEducation([{ school: '', entered: '', graduated: '' }])).toBeTruthy()
    expect(checkEducation([{ school: 'A', entered: '1800', graduated: '' }])).toBeTruthy()
    expect(checkWork([{ company: '架空商事', from: '2015-04', to: '' }])).toBeNull()
    expect(checkWork([{ company: 'A', from: '2015/04', to: '' }])).toBeTruthy()
  })
  it('47都道府県で、東京都・北海道を含む', () => {
    expect(PREFECTURES).toHaveLength(47)
    expect(PREFECTURES).toContain('東京都')
    expect(PREFECTURES).toContain('北海道')
  })
  it('申請の要約（写真の中身は含まない）', () => {
    expect(summarizeRequest('name', { name: '試験 一郎', furigana: 'しけん' })).toBe('試験 一郎（しけん）')
    expect(summarizeRequest('id_doc', { doc_type: 'license' })).toBe('運転免許証の写真')
    expect(summarizeRequest('credential', { action: 'delete' })).toBe('記録を削除')
    expect(summarizeRequest('honseki', { pref: '東京都' })).toBe('東京都')
  })
})
