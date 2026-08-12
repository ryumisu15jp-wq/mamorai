// [S6-い] 現場が設定で追加できる日報セクションのプリセット（純粋・UI/DB非依存）
// 現場ごとに巡回/点検/特記/継続不具合 等の有無・内容が異なるため、
// 設定でセクションを追加/切替できるようにするための「型付きプリセット」。追加のみ・非破壊。
import type { SectionDef } from '../types.js'

const NORMAL_ABNORMAL = ['異常なし', '異常あり']

/** 現場セクションプリセット（kind 名 → SectionDef）。id は現場設定で安定に扱えるよう固定。 */
const SITE_SECTION_PRESETS: Record<string, SectionDef> = {
  巡回: {
    id: 'site_patrol',
    kind: 'gate',
    label: '巡回',
    enabled: true,
    fields: [
      { key: 'patrol_day', label: '日勤巡回', type: 'select', options: NORMAL_ABNORMAL },
      { key: 'patrol_night', label: '夜勤巡回', type: 'select', options: NORMAL_ABNORMAL },
    ],
  },
  点検: {
    id: 'site_inspection',
    kind: 'check',
    label: '点検',
    enabled: true,
    fields: [
      { key: 'insp_aed', label: 'AED点検', type: 'check' },
      { key: 'insp_extinguisher', label: '消火器点検', type: 'check' },
      { key: 'insp_key', label: '鍵点検', type: 'check' },
      { key: 'insp_facp', label: 'FACP点検', type: 'check' },
      { key: 'insp_result', label: '異常有無', type: 'select', options: NORMAL_ABNORMAL },
    ],
  },
  特記: {
    id: 'site_note',
    kind: 'meta',
    label: '特記事項',
    enabled: true,
    fields: [{ key: 'note', label: '特記事項', type: 'text' }],
  },
  継続不具合: {
    id: 'site_ongoing_defect',
    kind: 'meta',
    label: '継続不具合事項',
    enabled: true,
    fields: [{ key: 'ongoing_defect', label: '継続不具合事項', type: 'text' }],
  },
}

/** 追加可能な現場セクションの種別一覧（巡回/点検/特記/継続不具合 …）。 */
export function listSitePresetKinds(): string[] {
  return Object.keys(SITE_SECTION_PRESETS)
}

/**
 * 指定 kind のプリセット SectionDef を（複製して）返す。
 * 呼び出し側が id を変えても元プリセットを壊さないよう deep copy する。未知 kind は throw。
 */
export function getSitePreset(kind: string): SectionDef {
  const preset = SITE_SECTION_PRESETS[kind]
  if (!preset) throw new Error(`Unknown site section preset: ${kind}`)
  return { ...preset, fields: preset.fields.map((f) => ({ ...f })) }
}
