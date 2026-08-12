// [S5-3] 改良ダッシュボードのデモ素材（集計・分類ロジックは持たない）。
// リスク集計は @mamorai/input-core（riskRanking/positionRiskLevels/timeslotRiskLevels）に委譲。
// インシデント種別・ポジションは 商業施設マスタ（listIncidents/listPositions '商業施設'）から採る。
import { classifyRisk, type RiskItem } from '@mamorai/input-core'

/** ダッシュボード対象業態（既定）。切替UIは listBusinessTypes() を用いる。 */
export const DEFAULT_BUSINESS_TYPE = '商業施設'

/** 時間帯軸（timeslotRiskLevels に渡す順序）。HaiTOダッシュボードの時間帯別リスクに対応。 */
export const TIMESLOTS = ['早朝', '午前', '午後', '夕方', '深夜'] as const

/** 上部バーの当日条件（デモ）。特殊条件チップと警備レベルの表示に使う。 */
export interface DashboardContext {
  date: string
  weather: string
  temp: number
  securityLevel: string
  /** 特殊条件チップ（種別×内容）。天災/季節イベント/施設イベント/周辺イベント/時期 */
  chips: { kind: string; label: string }[]
}

/** 当日コンテキスト（デモ）。実接続時は AI条件フォーム→buildPredictionInput で正規化。 */
export function demoContext(): DashboardContext {
  return {
    date: '2026-08-11',
    weather: '晴（にわか雨注意報）',
    temp: 34,
    securityLevel: 'A',
    chips: [
      { kind: '天災', label: '大雨・洪水注意報' },
      { kind: '季節イベント', label: 'お盆商戦' },
      { kind: '施設イベント', label: '屋上ビアガーデン' },
      { kind: '周辺イベント', label: '花火大会(近隣)' },
      { kind: '時期', label: '経常期' },
    ],
  }
}

/** AI条件（buildPredictionInput へ渡すデモ入力）。商業施設の conditionFields のキーに合わせる。 */
export function demoConditions(): Record<string, string | number | boolean | null> {
  return {
    season: '夏',
    month: 8,
    weekday: '火',
    weather: '晴',
    alert: '大雨・洪水注意報',
    temp: 34,
    seasonEvent: 'お盆商戦',
    facilityEvent: '屋上ビアガーデン',
    nearbyEvent: '花火大会',
    openingPhase: '経常期',
    foreignVisitors: '多',
  }
}

// 商業施設マスタのインシデント×ポジション×時間帯×スコアで十数件のデモ予測を用意。
// level は input-core の classifyRisk で付与（分類ロジックを UI で再実装しない）。
const SEED: Omit<RiskItem, 'level'>[] = [
  { id: 'dk-01', type: '転倒/怪我', position: '屋外', score: 91, probability: 0.86, factors: ['大雨で床面滑り', '来場者増', '屋外導線集中'], timeslot: '午後' },
  { id: 'dk-02', type: '万引き/盗難', position: 'テナント', score: 84, probability: 0.79, factors: ['お盆商戦で混雑', '死角の巡回間隔が長い'], timeslot: '夕方' },
  { id: 'dk-03', type: 'いる迷子', position: '屋内イベント広場', score: 77, probability: 0.71, factors: ['イベント動員増', '家族連れ多数'], timeslot: '午後' },
  { id: 'dk-04', type: 'ESC/ELV故障・停止・事故', position: 'ESC/ELV', score: 72, probability: 0.64, factors: ['稼働率上昇', '定期点検前'], timeslot: '午前' },
  { id: 'dk-05', type: '車両の異常・故障・放置', position: '立体駐車場', score: 68, probability: 0.6, factors: ['満車連続', '出庫待ち渋滞'], timeslot: '夕方' },
  { id: 'dk-06', type: '体調不良', position: 'フードコート', score: 63, probability: 0.55, factors: ['猛暑・気温34℃', '飲食滞留'], timeslot: '午後' },
  { id: 'dk-07', type: '不審者/迷惑行為', position: '交通広場', score: 58, probability: 0.5, factors: ['花火大会の通行増', '外部流入'], timeslot: '夕方' },
  { id: 'dk-08', type: '喧嘩/傷害事件', position: '喫煙所', score: 54, probability: 0.47, factors: ['混雑時の口論増'], timeslot: '深夜' },
  { id: 'dk-09', type: '非常押しボタン', position: 'トイレ', score: 49, probability: 0.42, factors: ['誤操作の通報'], timeslot: '午前' },
  { id: 'dk-10', type: '車両の異常・故障・放置', position: '平面駐車場', score: 46, probability: 0.39, factors: ['朝の入庫集中'], timeslot: '早朝' },
  { id: 'dk-11', type: 'いない迷子', position: '館内共用部', score: 41, probability: 0.35, factors: ['放送呼出の遅延'], timeslot: '午後' },
  { id: 'dk-12', type: '火災/非火災', position: '防災センター', score: 37, probability: 0.3, factors: ['厨房設備の誤報'], timeslot: '深夜' },
  { id: 'dk-13', type: '万引き/盗難', position: '駐輪場/バイク置き場', score: 33, probability: 0.27, factors: ['夜間の施錠漏れ'], timeslot: '深夜' },
  { id: 'dk-14', type: '体調不良', position: '映画館', score: 26, probability: 0.2, factors: ['長時間滞在'], timeslot: '夕方' },
  { id: 'dk-15', type: '不審物', position: 'エントランス', score: 18, probability: 0.13, factors: ['開店前の置き去り確認'], timeslot: '早朝' },
]

/** [S5-3] デモ予測リスク（RiskItem[]、level は classifyRisk 付与）。集計は input-core に委譲。 */
export function demoDashboardItems(): RiskItem[] {
  return SEED.map((s) => ({ ...s, level: classifyRisk(s.score) }))
}
