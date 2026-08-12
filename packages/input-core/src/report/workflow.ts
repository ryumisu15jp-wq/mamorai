// [REQ-008] 提出・承認・差し戻しの状態遷移（純粋・非破壊）
import type { DailyReport, WorkflowAction, Actor, ReportStatus } from '../types.js'

/** [REQ-008] 許可された (現在status, action) → 次status のマップ */
const TRANSITIONS: Record<string, ReportStatus> = {
  '下書き|submit': '提出済',
  '提出済|approve': '承認済',
  '提出済|reject': '差し戻し',
  '差し戻し|resubmit': '提出済',
}

/**
 * [REQ-008] 日報の状態遷移。許可遷移のみ実行し、他は throw。
 * 入力 report は破壊せず新オブジェクトを返す。
 * - submit / resubmit: submittedAt = actor.at
 * - approve / reject: approverId = actor.id, approvedAt = actor.at
 */
export function transitionReport(report: DailyReport, action: WorkflowAction, actor: Actor): DailyReport {
  const nextStatus = TRANSITIONS[`${report.status}|${action}`]
  if (nextStatus === undefined) {
    throw new Error(`InvalidTransition: ${report.status} に ${action} は許可されていません`)
  }
  const next: DailyReport = { ...report, status: nextStatus }
  if (action === 'submit' || action === 'resubmit') {
    next.submittedAt = actor.at
  }
  if (action === 'approve' || action === 'reject') {
    next.approverId = actor.id
    next.approvedAt = actor.at
  }
  return next
}
