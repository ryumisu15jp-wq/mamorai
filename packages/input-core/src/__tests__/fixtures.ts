// テストフィクスチャ（現場テンプレート等）— テストスイートではなく共有ヘルパ。
// MAMORAI_all_screens_v2.html の日報項目感（勤務時間ペア/対応件数counter/点検check/報告事項）を反映。
import type { ReportTemplate, DailyReport, ResolvedForm } from '../index.js'

/** 夜勤・現実的テンプレート: meta/table(time pair, allowOvernight)/counter(range)/check/gate + 無効セクション */
export function nightShiftTemplate(): ReportTemplate {
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
          { key: 'cardReg', label: 'カード登録', type: 'number', default: 0 },
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
      {
        id: 'archived',
        kind: 'table',
        label: '旧様式（無効セクション）',
        enabled: false,
        fields: [{ key: 'legacy', label: '旧項目', type: 'text', default: '旧' }],
      },
    ],
  }
}

/** 既定値の無いフィールドで型別空値を検証するためのテンプレート */
export function noDefaultTemplate(): ReportTemplate {
  return {
    id: 'tmpl-empty',
    siteId: 'site-x',
    name: '既定値なし',
    sections: [
      {
        id: 's1',
        kind: 'meta',
        label: 's1',
        fields: [
          { key: 't', label: 't', type: 'text' },
          { key: 'n', label: 'n', type: 'number' },
          { key: 'sel', label: 'sel', type: 'select', options: ['a', 'b'] },
          { key: 'c', label: 'c', type: 'check' },
          { key: 'tm', label: 'tm', type: 'time' },
        ],
      },
    ],
  }
}

/** 翌日跨ぎを許容しない日勤ペア（time_order 検証用） */
export function dayPairTemplate(): ReportTemplate {
  return {
    id: 'tmpl-day',
    siteId: 'site-d',
    name: '日勤ペア',
    sections: [
      {
        id: 'kinmu',
        kind: 'table',
        label: '勤務時間',
        fields: [
          { key: 'start', label: '開始', type: 'time', required: true, pairWith: 'end', allowOvernight: false, default: null },
          { key: 'end', label: '終了', type: 'time', required: true, default: null },
        ],
      },
    ],
  }
}

/** 1分日報テンプレート: 必須は select のみ。text/time を必須にしない */
export function minuteTemplate(): ReportTemplate {
  return {
    id: 'tmpl-min',
    siteId: 'site-m',
    name: '1分日報',
    sections: [
      {
        id: 'meta',
        kind: 'meta',
        label: 'メタ',
        fields: [
          { key: 'shift', label: '勤務区分', type: 'select', required: true, options: ['日勤', '夜勤'], default: '夜勤' },
          { key: 'note', label: '報告事項', type: 'text', required: false, default: '' },
        ],
      },
      {
        id: 'counter',
        kind: 'counter',
        label: '対応件数',
        fields: [{ key: 'unlocked', label: '未施錠', type: 'number', default: 0, range: { min: 0, max: 50 } }],
      },
      {
        id: 'check',
        kind: 'check',
        label: '点検',
        fields: [{ key: 'aed', label: 'AED', type: 'check', required: false, default: false }],
      },
    ],
  }
}

/** estimateTaps 境界用: counter 1項目のみ（select/check の混入なしで taps を厳密制御） */
export function counterOnlyTemplate(): ReportTemplate {
  return {
    id: 'tmpl-co',
    siteId: 'site-co',
    name: 'counterOnly',
    sections: [{ id: 'c', kind: 'counter', label: 'c', fields: [{ key: 'n', label: 'n', type: 'number', default: 0 }] }],
  }
}

/** estimateTaps シナリオ用: counter/select/check/text/time 混在 */
export function mixedTapTemplate(): ReportTemplate {
  return {
    id: 'tmpl-mix',
    siteId: 'site-mix',
    name: 'mixed',
    sections: [
      { id: 'c', kind: 'counter', label: 'c', fields: [{ key: 'n', label: 'n', type: 'number', default: 0 }] },
      {
        id: 's',
        kind: 'meta',
        label: 's',
        fields: [
          { key: 'sel', label: 'sel', type: 'select', options: ['a', 'b'], default: 'a' },
          { key: 'chk', label: 'chk', type: 'check', default: false },
          { key: 'txt', label: 'txt', type: 'text', default: '' },
          { key: 'tm', label: 'tm', type: 'time', default: null },
        ],
      },
    ],
  }
}

/** ResolvedForm リテラルを組み立てるヘルパ（resolveForm はまだ未実装のため手組み） */
export function makeForm(template: ReportTemplate, values: Record<string, Record<string, unknown>>): ResolvedForm {
  return {
    templateId: template.id,
    siteId: template.siteId,
    sections: template.sections.filter((s) => s.enabled !== false),
    values: values as ResolvedForm['values'],
  }
}

/** プリフィル用の日報レコード生成ヘルパ */
export function makeReport(partial: Partial<DailyReport> & Pick<DailyReport, 'status' | 'reportDate'>): DailyReport {
  return {
    id: partial.id ?? 'r-' + partial.reportDate + '-' + partial.status,
    siteId: partial.siteId ?? 'site-bht',
    templateId: partial.templateId ?? 'tmpl-bht-night',
    reporterId: partial.reporterId ?? 'user-1',
    reportDate: partial.reportDate,
    status: partial.status,
    values: partial.values ?? {},
    submittedAt: partial.submittedAt ?? null,
    approvedAt: partial.approvedAt ?? null,
    approverId: partial.approverId ?? null,
  }
}
