// [Sprint4] 通知 / 教育・資格 / テンプレート設定 の共有フィクスチャ
// 純粋・決定論（Date.now / Math.random / 引数なし new Date() を使わない）。日付は 'YYYY-MM-DD' 文字列で扱う。
import type {
  Notification,
  NotifyUser,
  AudienceFilter,
  Qualification,
  TrainingRecord,
  ReportTemplate,
  SectionDef,
} from '../types.js'

// ── 現場・現実的な設定（施設警備2級 / 新任基本研修45h） ──
export const SITE_A = 'site-A'
export const SITE_B = 'site-B'
export const QUAL = '施設警備2級'

/** 通知を1件生成するヘルパ（対象条件を差し替えて使う）。 */
export function notification(target: AudienceFilter, id = 'ntf-001'): Notification {
  return {
    id,
    kind: '重要事項',
    title: '台風接近に伴う警戒配置の通知',
    body: '該当現場の隊員は警戒配置に就くこと。',
    target,
    createdBy: 'kanri-001',
    createdAt: '2026-08-11',
  }
}

/** 配信対象になりうる利用者ヘルパ。 */
export function user(
  id: string,
  siteId: string,
  role?: string,
  workType?: NotifyUser['workType'],
): NotifyUser {
  return { id, siteId, role, workType }
}

/**
 * 現実的な利用者名簿。
 * - u1: site-A / 隊員 / 日勤
 * - u2: site-A / 隊員 / 夜勤
 * - u3: site-A / 責任者 / 日勤
 * - u4: site-B / 隊員 / 日勤
 * - u5: site-B / 責任者 / 夜勤
 */
export const USERS: NotifyUser[] = [
  user('u1', SITE_A, '隊員', '日勤'),
  user('u2', SITE_A, '隊員', '夜勤'),
  user('u3', SITE_A, '責任者', '日勤'),
  user('u4', SITE_B, '隊員', '日勤'),
  user('u5', SITE_B, '責任者', '夜勤'),
]

/** 資格ヘルパ。 */
export function qual(staffId: string, expiresOn: string, name = QUAL): Qualification {
  return { staffId, name, expiresOn }
}

/** 研修記録ヘルパ（新任基本研修 required=45h）。 */
export function training(
  staffId: string,
  completedHours: number,
  requiredHours = 45,
  type = '新任基本研修',
): TrainingRecord {
  return { staffId, type, requiredHours, completedHours }
}

// ── テンプレート（3セクション: 気象/巡回/インシデント） ──
export function section(id: string, enabled?: boolean): SectionDef {
  return {
    id,
    kind: 'counter',
    label: id,
    fields: [{ key: `${id}_c`, label: id, type: 'number' }],
    ...(enabled === undefined ? {} : { enabled }),
  }
}

/** 現場テンプレート（weather / patrol / incident の3セクション）。 */
export function template(): ReportTemplate {
  return {
    id: 'tmpl-A',
    siteId: SITE_A,
    name: '施設警備 日報テンプレート',
    sections: [section('weather'), section('patrol'), section('incident')],
  }
}
