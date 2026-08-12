// [REQ-014/015][ADR-003] リスク予測ゲートウェイ。
// 責務: 予測エンジンの生レスポンスを取得し、input-core の fromPredictionResponse で整形して返す。
// 秘匿境界: Claude APIキー・実エンドポイントはこの層にのみ存在し、レスポンス/フロントへは絶対に出さない。
// 整形ロジックは input-core を再利用（サーバに再実装しない＝層分離厳守）。
import { Router, type Request, type Response } from 'express'
import { fromPredictionResponse, type RiskItem } from '@mamorai/input-core'

/**
 * 予測エンジン呼び出しの抽象。生レスポンス(unknown)を返す。
 * テスト時はモックを注入し、本番は resolvePredictionEngine() が実/モックを選ぶ。
 */
export type PredictionEngine = (siteId: string) => Promise<unknown>

/**
 * 既定のモック予測エンジン。実キー/実エンドポイント未確認(OQ-05)のため、
 * env が無い環境ではこれが使われる。返却形は「予測エンジンの生レスポンス」を模した unknown。
 */
export function createMockPredictionEngine(): PredictionEngine {
  return async (siteId: string): Promise<unknown> => {
    return [
      { id: `${siteId}-rk-01`, type: '未施錠', position: 'A立哨', score: 86, probability: 0.8, factors: ['深夜帯の施錠漏れ増', '新人配置'] },
      { id: `${siteId}-rk-02`, type: '不審者', position: 'C立哨', score: 72, probability: 0.66, factors: ['近隣で不審者情報'] },
      { id: `${siteId}-rk-03`, type: '巡回抜け', position: 'B立哨', score: 58, probability: 0.5, factors: ['夜勤後半の巡回遅延'] },
      { id: `${siteId}-rk-04`, type: '警報無視', position: 'A立哨', score: 41, probability: 0.35, factors: ['誤報続きで警報疲れ'] },
      { id: `${siteId}-rk-05`, type: '未施錠', position: 'D立哨', score: 24, probability: 0.19, factors: [] },
    ]
  }
}

/**
 * 実エンジン呼び出し（CLAUDE_API_KEY / PREDICTION_ENDPOINT がある場合のみ）。
 * キーは Authorization ヘッダに載せるだけで、レスポンスやログには一切出さない。
 * env が無ければモックを返す（OQ-05 が解けるまでの既定動作）。
 */
export function resolvePredictionEngine(): PredictionEngine {
  const apiKey = process.env.CLAUDE_API_KEY
  const endpoint = process.env.PREDICTION_ENDPOINT
  if (apiKey !== undefined && apiKey !== '' && endpoint !== undefined && endpoint !== '') {
    // --- 実呼び出し分岐（実仕様確定後に有効化。キーはサーバ内でのみ使用）---
    return async (siteId: string): Promise<unknown> => {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          // キーはここ（サーバ→予測エンジン）でのみ使用。クライアントには決して渡さない。
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ siteId }),
      })
      if (!res.ok) throw new Error(`prediction engine responded ${res.status}`)
      return (await res.json()) as unknown
    }
  }
  return createMockPredictionEngine()
}

/**
 * GET /api/risk?siteId=... のハンドラ（テスト可能な純粋寄りの関数）。
 * 生レスポンスを fromPredictionResponse で RiskItem[] に整形して返す。キーは混入させない。
 */
export function createRiskHandler(engine: PredictionEngine) {
  return async (req: Request, res: Response): Promise<void> => {
    const siteId = typeof req.query.siteId === 'string' ? req.query.siteId : ''
    if (siteId === '') {
      res.status(400).json({ error: 'siteId is required' })
      return
    }
    try {
      const raw = await engine(siteId)
      const items: RiskItem[] = fromPredictionResponse(raw)
      // 返すのは整形済み RiskItem[] のみ。APIキー等の機密は一切含めない。
      res.json(items)
    } catch {
      res.status(502).json({ error: 'prediction engine unavailable' })
    }
  }
}

/** /api/risk 用の Express Router。engine 未指定なら env に応じて実/モックを解決。 */
export function createRiskRouter(engine: PredictionEngine = resolvePredictionEngine()): Router {
  const router = Router()
  router.get('/', createRiskHandler(engine))
  return router
}
