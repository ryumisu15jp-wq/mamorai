// [REQ-018/019/020][ADR-003][ADR-005][ADR-008] シフト最適化ゲートウェイ。
// 3段: NL→制約(structure) / 制約→下案(optimize) / HITL確定(confirm)。
// 秘匿境界: Claude キー・重い最適化はこの層のみ。整形/評価/確定ロジックは input-core に委譲（再実装しない）。
import { Router, type Request, type Response } from 'express'
import {
  confirmOptimizationRun,
  applyConfirmedRun,
  type OptimizationContext,
  type OptimizationRun,
  type Actor,
} from '@mamorai/input-core'
import { resolveCallClaude, structureConstraints, type CallClaude } from '../services/claude.js'
import { resolveOptimizer, type OptimizeFn } from '../services/optimizer.js'

/**
 * POST /api/shift/structure { text } → { constraints: ConstraintDef[] }
 * 自然言語をモック/実 Claude で構造化し parseConstraintsFromLLM で検証して返す。キーは非露出。
 */
export function createStructureHandler(callClaude: CallClaude) {
  return async (req: Request, res: Response): Promise<void> => {
    const text = typeof req.body?.text === 'string' ? req.body.text : ''
    if (text === '') {
      res.status(400).json({ error: 'text is required' })
      return
    }
    try {
      const constraints = await structureConstraints(callClaude, text)
      // 返すのは検証済み ConstraintDef[] のみ。APIキー等の機密は一切含めない。
      res.json({ constraints })
    } catch (e) {
      const message = e instanceof Error ? e.message : 'structure failed'
      res.status(502).json({ error: message })
    }
  }
}

/**
 * POST /api/shift/optimize { context, runId? } → { run: OptimizationRun }（status='下案'）
 * 重い最適化はサーバ側。既定は input-core の generateDraft ヒューリスティック。
 */
export function createOptimizeHandler(optimize: OptimizeFn) {
  return async (req: Request, res: Response): Promise<void> => {
    const context = req.body?.context as OptimizationContext | undefined
    if (context === undefined || !Array.isArray(context.workDates) || !Array.isArray(context.staff)) {
      res.status(400).json({ error: 'context (workDates, staff, positions, constraints) is required' })
      return
    }
    const runId = typeof req.body?.runId === 'string' ? req.body.runId : `run-${Date.now()}`
    try {
      const run = optimize(context, runId)
      res.json({ run })
    } catch (e) {
      const message = e instanceof Error ? e.message : 'optimize failed'
      res.status(500).json({ error: message })
    }
  }
}

/**
 * POST /api/shift/confirm { run, actor, reviewed } → { run: 確定, applied: ShiftCell[] }
 * HITL: reviewed!==true は 403 で拒否（自動確定禁止）。確定＋反映は service_role 相当の
 * このサーバ側でのみ実行する（クライアントからの shift_overrides 直書きは禁止＝ADR-008）。
 */
export function createConfirmHandler() {
  return async (req: Request, res: Response): Promise<void> => {
    const run = req.body?.run as OptimizationRun | undefined
    const actor = req.body?.actor as Actor | undefined
    const reviewed = req.body?.reviewed === true
    if (run === undefined || actor === undefined || typeof actor.id !== 'string') {
      res.status(400).json({ error: 'run and actor are required' })
      return
    }
    // HITL ゲート: 管制員レビュー未実施は確定させない。
    if (!reviewed) {
      res.status(403).json({ error: 'HITL: reviewed=true(管制員レビュー)が必要です。自動確定は禁止。' })
      return
    }
    try {
      // confirmOptimizationRun が reviewed/確定済みを二重にチェック（input-core が唯一の確定ロジック）。
      const confirmed = confirmOptimizationRun(run, actor, { reviewed: true })
      // applyConfirmedRun: 確定ランのみ ShiftCell(source='ai_apply') へ写像（サーバ側でのみ反映）。
      const applied = applyConfirmedRun(confirmed)
      res.json({ run: confirmed, applied })
    } catch (e) {
      const message = e instanceof Error ? e.message : 'confirm failed'
      res.status(409).json({ error: message })
    }
  }
}

/** /api/shift 用 Router。依存未指定なら env に応じて実/モックを解決。 */
export function createShiftOptimizeRouter(
  callClaude: CallClaude = resolveCallClaude(),
  optimize: OptimizeFn = resolveOptimizer(),
): Router {
  const router = Router()
  router.post('/structure', createStructureHandler(callClaude))
  router.post('/optimize', createOptimizeHandler(optimize))
  router.post('/confirm', createConfirmHandler())
  return router
}
