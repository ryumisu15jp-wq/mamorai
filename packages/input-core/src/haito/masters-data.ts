// [S5-1] HaiTO実仕様の業態マスタ（データ駆動・純粋）。出典: HaiTO資料(ヒトトヒトHD, 2025-05)。
import type { BusinessMaster, ConditionField } from '../types.js'

const COMMON: ConditionField[] = [
  { key: 'season', label: '季節', group: '共通', type: 'select', options: ['春','夏','秋','冬'] },
  { key: 'month', label: '月', group: '共通', type: 'number' },
  { key: 'weekday', label: '曜日', group: '共通', type: 'select', options: ['月','火','水','木','金','土','日'] },
  { key: 'weather', label: '天候', group: '共通', type: 'select', options: ['快晴','晴','薄曇','曇','雨','雪'] },
  { key: 'alert', label: '警報・注意報', group: '共通', type: 'text' },
  { key: 'wind', label: '風速(m/s)', group: '共通', type: 'number' },
  { key: 'temp', label: '気温(℃)', group: '共通', type: 'number' },
]
const TRAITS: ConditionField[] = [
  { key: 'station', label: '駅近/遠', group: '特性', type: 'select', options: ['近','遠'] },
  { key: 'busRotary', label: 'バスロータリー有無', group: '特性', type: 'check' },
  { key: 'security', label: '治安', group: '特性', type: 'select', options: ['良','普通','悪'] },
  { key: 'foreignVisitors', label: '外国人来場者数', group: '特性', type: 'select', options: ['少','中','多'] },
  { key: 'disasterRisk', label: '強風/水害リスク', group: '特性', type: 'select', options: ['低','中','高'] },
  { key: 'parking', label: '駐車場種別/料金', group: '特性', type: 'text' },
  { key: 'bicycle', label: '駐輪場', group: '特性', type: 'check' },
  { key: 'capacity', label: '収容人数', group: '特性', type: 'number' },
]
const SPECIAL_FACILITY: ConditionField[] = [
  { key: 'seasonEvent', label: '季節イベント', group: '特殊', type: 'text' },
  { key: 'facilityEvent', label: '施設イベント', group: '特殊', type: 'text' },
  { key: 'nearbyEvent', label: '周辺イベント', group: '特殊', type: 'text' },
  { key: 'openingPhase', label: '開業期/経常期', group: '特殊', type: 'select', options: ['開業期','経常期'] },
]
const SPECIAL_EVENT: ConditionField[] = [
  { key: 'matchTime', label: '試合時刻', group: '特殊', type: 'text' },
  { key: 'opponent', label: '対戦相手', group: '特殊', type: 'text' },
  { key: 'facilityEvent', label: '施設イベント', group: '特殊', type: 'text' },
  { key: 'specialNote', label: '特別試合備考', group: '特殊', type: 'text' },
  { key: 'attendanceForecast', label: '動員予測値', group: '特殊', type: 'number' },
  { key: 'securityLevel', label: '警備レベル', group: '特殊', type: 'select', options: ['S','A','B','C'] },
]

const SHOP_EVENT_INCIDENTS = ['喧嘩/傷害事件','建築/設備破壊','万引き/盗難','事件','不審者/迷惑行為','建造物侵入','不退去','不審物','交通事故','転倒/怪我','ESC/ELV故障・停止・事故','いる迷子','いない迷子','車両の異常・故障・放置','体調不良','非常押しボタン','火災/非火災','停電/漏電','浸水/冠水']

export const BUSINESS_MASTERS: Record<string, BusinessMaster> = {
  '商業施設': {
    businessType: '商業施設',
    incidents: SHOP_EVENT_INCIDENTS,
    positions: ['館内共用部','屋外','フードコート','テナント','映画館','ESC/ELV','トイレ','防災センター','総合案内所','屋内イベント広場','屋外イベント広場','平面駐車場','立体駐車場','屋上駐車場','駐車場発券・精算機','駐輪場/バイク置き場','喫煙所','交通広場','コインロッカー','授乳室/ベビー休憩室/オムツ替え室','ベビーカー置場/車いす置場','ATM','エントランス','バックヤード'],
    conditionFields: [...TRAITS, ...COMMON, ...SPECIAL_FACILITY],
  },
  '興行施設': {
    businessType: '興行施設',
    incidents: SHOP_EVENT_INCIDENTS,
    positions: ['座席/コンコース','場外/外周','飲食エリア/キッチンカー','テナント/物販エリア','ESC/ELV','トイレ','防災センター','総合案内所','屋内広場','屋外広場','平面駐車場','立体駐車場','屋上駐車場','駐車場発券・精算機','駐輪場/バイク置き場','喫煙所','交通広場','コインロッカー','授乳室/ベビー休憩室/オムツ替え室','ベビーカー置場/車いす置場','ATM','エントランス','関係者エリア'],
    conditionFields: [...TRAITS, ...COMMON, ...SPECIAL_FACILITY],
  },
  '興行運営': {
    businessType: '興行運営',
    incidents: ['観戦マナー違反','盗難/お客様同士トラブル','選手・ボールに当たる','設備故障','座席故障','試合撮影/盗聴/迷惑行為','体調不良','汚れ/嘔吐物','転倒/怪我','虫/動物','迷い人','落とし物対応','発報/火災/非火災'],
    positions: ['ホーム席','ビジター席','共通コア席','ホームコア席','ビジターコア席','企画席','個室席','ゲート/エントランス','コンコース','場外/外周','イベントスペース','トイレ','授乳室/ベビー休憩室/オムツ替え室','駐車場','駐輪場/バイク置き場','交通広場','飲食エリア/キッチンカー','テナント/物販エリア','チケット売り場','喫煙所','総合案内所','ミックスゾーン','ESC/ELV','関係者エリア','救護室/防災センター','その他'],
    conditionFields: [...TRAITS, ...COMMON, ...SPECIAL_EVENT],
  },
}
