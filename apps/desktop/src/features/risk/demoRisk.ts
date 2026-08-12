// リスク予測のデモ素材（サーバ未起動時のフォールバック）。
// これは「予測エンジンの生レスポンス」を模した unknown 形。
// 整形は input-core の fromPredictionResponse に委譲する（UI側で再実装しない）。

/**
 * リスクゲートウェイ未起動 / fetch 失敗時に使う生レスポンス（デモ）。
 * 現場感は MAMORAI_all_screens_v2.html の リスク度ランキング(p-risk) を反映。
 * 種別: 巡回抜け / 未施錠 / 不審者 / 警報無視、ポジション: A〜D 立哨。
 */
export const demoRiskRaw: unknown = [
  { id: 'rk-01', type: '未施錠', position: 'A立哨', score: 88, probability: 0.82, factors: ['深夜帯の施錠漏れ増', '前月同ポジで2件', '新人配置'] },
  { id: 'rk-02', type: '不審者', position: 'C立哨', score: 74, probability: 0.68, factors: ['近隣で不審者情報', '死角の巡回間隔が長い'] },
  { id: 'rk-03', type: '巡回抜け', position: 'B立哨', score: 61, probability: 0.55, factors: ['夜勤後半の巡回遅延', '人員1名減'] },
  { id: 'rk-04', type: '警報無視', position: 'A立哨', score: 47, probability: 0.4, factors: ['誤報続きで警報疲れ'] },
  { id: 'rk-05', type: '未施錠', position: 'D立哨', score: 39, probability: 0.31, factors: ['対応マニュアル未更新'] },
  { id: 'rk-06', type: '不審者', position: 'B立哨', score: 22, probability: 0.18, factors: ['来訪者少ない時間帯'] },
  { id: 'rk-07', type: '巡回抜け', position: 'D立哨', score: 15, probability: 0.1, factors: [] },
]

/** ゲートウェイの既定ベースURL（env 未設定時）。実キーはサーバ側のみ、フロントは URL しか持たない。 */
export const RISK_API_DEFAULT_BASE = 'http://localhost:3001'
