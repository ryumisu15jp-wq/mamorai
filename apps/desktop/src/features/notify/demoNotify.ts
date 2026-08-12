// [REQ-022] 通知画面のデモ素材（配信ロジックは持たない）。
// 現場感は MAMORAI_all_screens_v2.html の p-notify（重要事項/業務指示/本部通知）を反映。
import type { Notification, NotifyUser } from '@mamorai/input-core'

/** 配信対象になりうるデモ名簿（現場×役割×勤務種別）。実接続時は Supabase の職員テーブル。 */
export function demoUsers(): NotifyUser[] {
  return [
    { id: 'u-mikado', siteId: 'site-bht', role: '統括', workType: '日勤' },
    { id: 'u-fujii', siteId: 'site-bht', role: '隊長', workType: '日勤' },
    { id: 'u-sato', siteId: 'site-bht', role: '警備員', workType: '夜勤' },
    { id: 'u-tsuji', siteId: 'site-bht', role: '警備員', workType: '夜勤' },
    { id: 'u-matsuba', siteId: 'site-bht', role: '警備員', workType: '日勤' },
    { id: 'u-osaka1', siteId: 'site-osaka', role: '隊長', workType: '日勤' },
    { id: 'u-osaka2', siteId: 'site-osaka', role: '警備員', workType: '夜勤' },
    { id: 'u-hq', siteId: 'site-hq', role: '本社管理部', workType: '日勤' },
  ]
}

/** 確認済み（既読）のデモ ID 群。buildDelivery の未確認件数算出に使用。 */
export function demoConfirmedIds(): string[] {
  return ['u-mikado', 'u-fujii', 'u-sato']
}

/** 現場選択肢（scope=site 用）。 */
export const SITE_OPTIONS: { id: string; label: string }[] = [
  { id: 'site-bht', label: 'ブルガリホテル東京' },
  { id: 'site-osaka', label: '大阪本町ビル' },
  { id: 'site-hq', label: '本社' },
]

/** 役割選択肢（scope=role 用）。 */
export const ROLE_OPTIONS = ['統括', '隊長', '警備員', '本社管理部']

/** 勤務種別選択肢（scope=workType 用）。 */
export const WORKTYPE_OPTIONS = ['日勤', '夜勤']

/** 発信済み通知のデモ一覧（p-notify のカードを再現）。 */
export function demoNotifications(): Notification[] {
  return [
    {
      id: 'n-3',
      kind: '業務指示',
      title: '三井不動産 社長来館',
      body: '7/15 9:00〜、三井不動産社長が来館予定。ベビーカート類の空間整理を依頼。',
      target: { scope: 'all' },
      createdBy: '三角 龍彦',
      createdAt: '2026-03-22T09:00:00.000Z',
    },
    {
      id: 'n-2',
      kind: '業務指示',
      title: '事前精算機の釣銭確認',
      body: 'コイン回収50枚。事前精算機の釣銭金額確認をお願いします。',
      target: { scope: 'workType', workType: '夜勤', siteId: 'site-bht' },
      createdBy: '藤井 隆幸',
      createdAt: '2026-03-22T14:00:00.000Z',
    },
    {
      id: 'n-1',
      kind: '本部通知',
      title: '年度末棚卸に伴う搬入出増加',
      body: '3/25〜3/31は館内搬入出が増加見込み。荷捌場周辺の警戒を強化してください。',
      target: { scope: 'all' },
      createdBy: '本社管理部',
      createdAt: '2026-03-21T00:00:00.000Z',
    },
  ]
}
