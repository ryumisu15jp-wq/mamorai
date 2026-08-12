// [REQ-022] 通知の対象別配信・未確認集計: resolveRecipients / buildDelivery の RED テスト
// テスト規約: AAA / 「対象_条件_期待」 / 境界値 / 誤配信防止 / 純粋・決定論
import { describe, it, expect } from 'vitest'
import { resolveRecipients, buildDelivery } from '../index.js'
import { notification, USERS, SITE_A, SITE_B } from './s4_fixtures.js'

describe('resolveRecipients [REQ-022] 対象条件に一致する利用者のみ返す', () => {
  it('resolveRecipients_scopeall_全員を入力順で返す', () => {
    // Arrange
    const ntf = notification({ scope: 'all' })
    // Act
    const got = resolveRecipients(ntf, USERS)
    // Assert
    expect(got.map((u) => u.id)).toEqual(['u1', 'u2', 'u3', 'u4', 'u5'])
  })

  it('resolveRecipients_scopesite_該当現場のみで対象外を含まない', () => {
    // Arrange
    const ntf = notification({ scope: 'site', siteId: SITE_A })
    // Act
    const got = resolveRecipients(ntf, USERS)
    // Assert（site-B の u4,u5 が混ざらないこと=誤配信防止）
    expect(got.map((u) => u.id)).toEqual(['u1', 'u2', 'u3'])
    expect(got.some((u) => u.siteId === SITE_B)).toBe(false)
  })

  it('resolveRecipients_scopeworkType_勤務区分一致のみ返す', () => {
    // Arrange
    const ntf = notification({ scope: 'workType', workType: '夜勤' })
    // Act
    const got = resolveRecipients(ntf, USERS)
    // Assert
    expect(got.map((u) => u.id)).toEqual(['u2', 'u5'])
  })

  it('resolveRecipients_scopeworkTypeとsiteId併記_ANDで絞り込む', () => {
    // Arrange（夜勤 かつ site-A → u2 のみ、site-B の夜勤 u5 は除外）
    const ntf = notification({ scope: 'workType', workType: '夜勤', siteId: SITE_A })
    // Act
    const got = resolveRecipients(ntf, USERS)
    // Assert
    expect(got.map((u) => u.id)).toEqual(['u2'])
  })

  it('resolveRecipients_scoperole_役割一致のみ返す', () => {
    // Arrange
    const ntf = notification({ scope: 'role', role: '責任者' })
    // Act
    const got = resolveRecipients(ntf, USERS)
    // Assert
    expect(got.map((u) => u.id)).toEqual(['u3', 'u5'])
  })

  it('resolveRecipients_scoperoleとsiteId併記_ANDで絞り込む', () => {
    // Arrange（責任者 かつ site-B → u5 のみ）
    const ntf = notification({ scope: 'role', role: '責任者', siteId: SITE_B })
    // Act
    const got = resolveRecipients(ntf, USERS)
    // Assert
    expect(got.map((u) => u.id)).toEqual(['u5'])
  })

  it('resolveRecipients_一致者なし_空配列を返す', () => {
    // Arrange（境界: 存在しない現場は誰にも配信しない=誤配信防止）
    const ntf = notification({ scope: 'site', siteId: 'site-none' })
    // Act
    const got = resolveRecipients(ntf, USERS)
    // Assert
    expect(got).toEqual([])
  })

  it('resolveRecipients_利用者0件_空配列を返す', () => {
    // Arrange（境界: 名簿が空）
    const ntf = notification({ scope: 'all' })
    // Act
    const got = resolveRecipients(ntf, [])
    // Assert
    expect(got).toEqual([])
  })

  it('resolveRecipients_元配列を破壊しない', () => {
    // Arrange
    const ntf = notification({ scope: 'site', siteId: SITE_A })
    const before = USERS.map((u) => u.id)
    // Act
    resolveRecipients(ntf, USERS)
    // Assert（純粋性: 入力名簿は不変）
    expect(USERS.map((u) => u.id)).toEqual(before)
  })
})

describe('buildDelivery [REQ-022] recipient/confirmed/unconfirmed を集計', () => {
  it('buildDelivery_確認なし_unconfirmedはrecipient数と一致', () => {
    // Arrange
    const ntf = notification({ scope: 'site', siteId: SITE_A })
    // Act
    const d = buildDelivery(ntf, USERS)
    // Assert
    expect(d.notificationId).toBe('ntf-001')
    expect(d.recipientIds).toEqual(['u1', 'u2', 'u3'])
    expect(d.confirmedIds).toEqual([])
    expect(d.unconfirmed).toBe(3)
  })

  it('buildDelivery_一部確認_未確認は残りの数', () => {
    // Arrange（u1,u3 が確認 → 未確認は u2 の1名）
    const ntf = notification({ scope: 'site', siteId: SITE_A })
    // Act
    const d = buildDelivery(ntf, USERS, ['u1', 'u3'])
    // Assert
    expect(d.confirmedIds).toEqual(['u1', 'u3'])
    expect(d.unconfirmed).toBe(1)
  })

  it('buildDelivery_対象外idの確認は無視する', () => {
    // Arrange（u4 は site-B で recipient 外 → confirmed に含めない=誤配信/誤集計防止）
    const ntf = notification({ scope: 'site', siteId: SITE_A })
    // Act
    const d = buildDelivery(ntf, USERS, ['u1', 'u4', 'ghost'])
    // Assert
    expect(d.confirmedIds).toEqual(['u1'])
    expect(d.unconfirmed).toBe(2)
  })

  it('buildDelivery_全員確認_unconfirmedは0', () => {
    // Arrange（境界: recipient 全員が確認）
    const ntf = notification({ scope: 'site', siteId: SITE_A })
    // Act
    const d = buildDelivery(ntf, USERS, ['u1', 'u2', 'u3'])
    // Assert
    expect(d.confirmedIds).toEqual(['u1', 'u2', 'u3'])
    expect(d.unconfirmed).toBe(0)
  })

  it('buildDelivery_recipient0件_unconfirmedは0', () => {
    // Arrange（境界: 対象者なし。確認id指定があっても未確認は0）
    const ntf = notification({ scope: 'site', siteId: 'site-none' })
    // Act
    const d = buildDelivery(ntf, USERS, ['u1'])
    // Assert
    expect(d.recipientIds).toEqual([])
    expect(d.confirmedIds).toEqual([])
    expect(d.unconfirmed).toBe(0)
  })
})
