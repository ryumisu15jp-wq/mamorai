// Node/Express リスクゲートウェイ宛のデータアダプタ（ADR-002 の apiClient 相当）。
// AI/秘匿系は必ずこのサーバ経由（Claude APIキーはサーバ側にのみ存在）。
// UI コンポーネントはこのクライアントの返す unknown を input-core で整形する。
import { RISK_API_DEFAULT_BASE, demoRiskRaw } from './demoRisk.js'

export interface RiskFetchResult {
  /** 予測エンジン由来の生データ（整形前）。UI 側で fromPredictionResponse に渡す。 */
  raw: unknown
  /** デモフォールバックか（サーバ未起動 / fetch 失敗 / env 未設定）。 */
  fromFallback: boolean
  /** フォールバック理由（UI 表示用）。 */
  note: string
}

/** Vite env からゲートウェイのベース URL を読む（キー等の機密はフロントに置かない）。 */
function readBase(): string {
  const base = import.meta.env.VITE_RISK_API_BASE
  return typeof base === 'string' && base !== '' ? base : RISK_API_DEFAULT_BASE
}

/**
 * GET /api/risk?siteId=... を叩き、生レスポンスを返す。
 * サーバ未起動・ネットワーク失敗・非2xx はデモ生データにフォールバック（画面を止めない）。
 */
export async function fetchRisk(siteId: string): Promise<RiskFetchResult> {
  const url = `${readBase()}/api/risk?siteId=${encodeURIComponent(siteId)}`
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } })
    if (!res.ok) {
      return { raw: demoRiskRaw, fromFallback: true, note: `サーバ応答 ${res.status}。デモデータを表示中。` }
    }
    const raw: unknown = await res.json()
    return { raw, fromFallback: false, note: `ゲートウェイ（${readBase()}）から取得。` }
  } catch {
    return { raw: demoRiskRaw, fromFallback: true, note: 'サーバ未起動のためデモデータを表示中。' }
  }
}
