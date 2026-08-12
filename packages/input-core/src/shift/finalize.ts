// [REQ-020] HITL: 管制員確認を経てのみ確定（自動確定禁止）＋実運用反映（純粋・決定論）
import type { OptimizationRun, OptimizationResult, ShiftCell, Actor } from '../types.js'

/** [REQ-020] 最適化結果から status='下案' のランを生成する */
export function createOptimizationRun(
  result: OptimizationResult,
  siteId: string,
  month: string,
): OptimizationRun {
  return {
    runId: result.runId,
    siteId,
    month,
    result,
    status: '下案',
    confirmedBy: null,
    confirmedAt: null,
  }
}

/**
 * [REQ-020] 管制員確認ゲート。reviewed!==true か既に確定済みなら throw。
 * 成功で status='確定'・confirmedBy/At を記録する（HITL）。
 */
export function confirmOptimizationRun(
  run: OptimizationRun,
  actor: Actor,
  opts: { reviewed: boolean },
): OptimizationRun {
  if (opts.reviewed !== true) {
    throw new Error('確定拒否: 管制員レビュー(reviewed=true)が必要です')
  }
  if (run.status === '確定') {
    throw new Error('確定拒否: 既に確定済みのランです')
  }
  return { ...run, status: '確定', confirmedBy: actor.id, confirmedAt: actor.at }
}

/**
 * [REQ-020] 確定ランを実運用へ反映。未確定なら throw。
 * 非null割付のみ ShiftCell(source='ai_apply', workType=position) へ写像する。
 */
export function applyConfirmedRun(run: OptimizationRun): ShiftCell[] {
  if (run.status !== '確定') {
    throw new Error('反映拒否: 確定済みのランのみ反映できます')
  }
  const cells: ShiftCell[] = []
  for (const d of run.result.draft) {
    if (d.staffId === null) continue
    cells.push({ staffId: d.staffId, date: d.date, workType: d.position, source: 'ai_apply' })
  }
  return cells
}
