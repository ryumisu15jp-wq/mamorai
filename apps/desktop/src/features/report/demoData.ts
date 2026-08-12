// デモ用の入力データ（テンプレート＋直近日報）。
// 入力ロジックは持たず、@mamorai/input-core に渡す「素材」だけを定義する。
// 現場感は MAMORAI_all_screens_v2.html の日報新規(p-rnew)を反映。
import type { ReportTemplate, DailyReport } from '@mamorai/input-core'

/** 1分日報デモテンプレート（meta/counter/check/gate + time ペア）。 */
export function demoTemplate(): ReportTemplate {
  return {
    id: 'tmpl-bht-night',
    siteId: 'site-bht',
    name: 'ブルガリホテル東京 夜勤日報',
    sections: [
      {
        id: 'meta',
        kind: 'meta',
        label: '勤務メタ',
        fields: [
          { key: 'reporterName', label: '報告者', type: 'text', required: false, default: '' },
          { key: 'shift', label: '勤務区分', type: 'select', required: true, options: ['日勤', '夜勤'], default: '夜勤' },
          { key: 'weather', label: '天候', type: 'select', required: false, options: ['晴', '曇', '雨', '雪'], default: '晴' },
        ],
      },
      {
        id: 'kinmu',
        kind: 'table',
        label: '勤務時間（21:00〜翌09:00）',
        fields: [
          { key: 'start', label: '開始', type: 'time', required: true, pairWith: 'end', allowOvernight: true, default: '21:00' },
          { key: 'end', label: '終了', type: 'time', required: true, default: '09:00' },
        ],
      },
      {
        id: 'counter',
        kind: 'counter',
        label: '業務対応件数',
        fields: [
          { key: 'unlocked', label: '巡回時未施錠', type: 'number', default: 0, range: { min: 0, max: 99 } },
          { key: 'elvCall', label: 'ELV呼出', type: 'number', default: 0, range: { min: 0, max: 99 } },
          { key: 'cardReg', label: 'カード登録', type: 'number', default: 0, range: { min: 0, max: 99 } },
        ],
      },
      {
        id: 'check',
        kind: 'check',
        label: '点検チェック',
        fields: [
          { key: 'aed', label: 'AED点検', type: 'check', default: false },
          { key: 'fire', label: '消火器点検', type: 'check', default: false },
        ],
      },
      {
        id: 'gate',
        kind: 'gate',
        label: '引継ぎ・報告事項',
        fields: [
          { key: 'handover', label: '引継ぎ確認', type: 'check', required: false, default: false },
          { key: 'note', label: '報告事項', type: 'text', required: false, default: '' },
        ],
      },
    ],
  }
}

/** 直近日報（承認済＝プリフィル最優先／提出済）。buildPrefilledForm に渡す。 */
export function demoRecentReports(): DailyReport[] {
  return [
    {
      id: 'r-2026-03-21-approved',
      siteId: 'site-bht',
      templateId: 'tmpl-bht-night',
      reporterId: 'user-1',
      reportDate: '2026-03-21',
      status: '承認済',
      values: {
        meta: { reporterName: '三角 龍彦', shift: '夜勤', weather: '曇' },
        kinmu: { start: '21:00', end: '09:00' },
        counter: { unlocked: 1, elvCall: 2, cardReg: 3 },
        check: { aed: true, fire: false },
        gate: { handover: true, note: '' },
      },
      submittedAt: '2026-03-21T00:10:00.000Z',
      approvedAt: '2026-03-21T02:00:00.000Z',
      approverId: 'mgr-1',
    },
    {
      id: 'r-2026-03-22-submitted',
      siteId: 'site-bht',
      templateId: 'tmpl-bht-night',
      reporterId: 'user-1',
      reportDate: '2026-03-22',
      status: '提出済',
      values: {
        meta: { reporterName: '三角 龍彦', shift: '夜勤', weather: '晴' },
        counter: { unlocked: 0, elvCall: 5, cardReg: 1 },
      },
      submittedAt: '2026-03-22T00:05:00.000Z',
      approvedAt: null,
      approverId: null,
    },
  ]
}

/** 現在のログインユーザ（スタブ）。実際は Supabase Auth から取得予定。 */
export const DEMO_REPORTER_ID = 'user-1'
