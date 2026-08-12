// [REQ-019][ADR-005] 最適化本体（重い計算はサーバ側の思想）。
// 既定は input-core の generateDraft を呼ぶ純ヒューリスティック（制約評価・貪欲割当は再実装しない＝層分離厳守）。
import {
  generateDraft,
  createOptimizationRun,
  type OptimizationContext,
  type OptimizationRun,
} from '@mamorai/input-core'

/**
 * 最適化関数の抽象（将来差し替え点）。
 * ── 差し替え計画 ──
 * 既定はヒューリスティック(generateDraft)。将来 OR-Tools CP-SAT ソルバ（Python/子プロセス or WASM）を
 * ここに注入し、大規模現場でのハード制約充足＋ソフト最小化を厳密に解く。
 * インタフェースは (context, runId) → OptimizationRun を維持すれば呼び出し側は不変。
 */
export type OptimizeFn = (context: OptimizationContext, runId: string) => OptimizationRun

/** 既定の最適化: input-core の generateDraft → status='下案' の OptimizationRun を生成（自動確定しない）。 */
export const heuristicOptimize: OptimizeFn = (context, runId) => {
  const result = generateDraft(context, runId)
  // createOptimizationRun は必ず status='下案'・confirmedBy=null を返す（HITL の入口）。
  return createOptimizationRun(result, context.siteId, context.month)
}

/**
 * 最適化の解決。将来 env(例: OPTIMIZER=cpsat)で CP-SAT 実装へ分岐する予定。
 * 現状はヒューリスティック固定。
 */
export function resolveOptimizer(): OptimizeFn {
  // 例: if (process.env.OPTIMIZER === 'cpsat') return cpsatOptimize
  return heuristicOptimize
}
