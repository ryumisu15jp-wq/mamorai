// [REQ-008] 承認ワークフロー状態遷移 transitionReport の RED テスト
// テスト規約: AAA / 「対象_条件_期待」 / 状態×アクション網羅 / 純粋性
import { describe, it, expect } from 'vitest'
import { transitionReport } from '../index.js'
import type { DailyReport, WorkflowAction, ReportStatus, Actor } from '../types.js'
import { makeReport } from './fixtures.js'

const actor: Actor = { id: 'approver-1', at: '2026-08-11T10:00:00Z' }

describe('transitionReport [REQ-008] 許可遷移', () => {
  it('transitionReport_下書きにsubmit_提出済へ遷移しsubmittedAtを記録する', () => {
    // Arrange
    const report = makeReport({ status: '下書き', reportDate: '2026-08-10' })
    // Act
    const next = transitionReport(report, 'submit', actor)
    // Assert
    expect(next.status).toBe<ReportStatus>('提出済')
    expect(next.submittedAt).toBe(actor.at)
  })

  it('transitionReport_提出済にapprove_承認済へ遷移し承認者と時刻を記録する', () => {
    // Arrange
    const report = makeReport({ status: '提出済', reportDate: '2026-08-10', submittedAt: '2026-08-10T09:00:00Z' })
    // Act
    const next = transitionReport(report, 'approve', actor)
    // Assert
    expect(next.status).toBe<ReportStatus>('承認済')
    expect(next.approverId).toBe(actor.id)
    expect(next.approvedAt).toBe(actor.at)
  })

  it('transitionReport_提出済にreject_差し戻しへ遷移し承認者と時刻を記録する', () => {
    // Arrange
    const report = makeReport({ status: '提出済', reportDate: '2026-08-10', submittedAt: '2026-08-10T09:00:00Z' })
    // Act
    const next = transitionReport(report, 'reject', actor)
    // Assert
    expect(next.status).toBe<ReportStatus>('差し戻し')
    expect(next.approverId).toBe(actor.id)
    expect(next.approvedAt).toBe(actor.at)
  })

  it('transitionReport_差し戻しにresubmit_提出済へ再遷移しsubmittedAtを更新する', () => {
    // Arrange
    const report = makeReport({ status: '差し戻し', reportDate: '2026-08-10', approverId: 'approver-1', approvedAt: '2026-08-10T09:00:00Z' })
    // Act
    const next = transitionReport(report, 'resubmit', actor)
    // Assert
    expect(next.status).toBe<ReportStatus>('提出済')
    expect(next.submittedAt).toBe(actor.at)
  })
})

describe('transitionReport [REQ-008] 純粋性', () => {
  it('transitionReport_遷移成功_入力reportを破壊せず新オブジェクトを返す', () => {
    // Arrange
    const report = makeReport({ status: '下書き', reportDate: '2026-08-10' })
    const snapshotStatus = report.status
    const snapshotSubmitted = report.submittedAt
    // Act
    const next = transitionReport(report, 'submit', actor)
    // Assert
    expect(next).not.toBe(report)
    expect(report.status).toBe(snapshotStatus)
    expect(report.submittedAt).toBe(snapshotSubmitted)
  })
})

describe('transitionReport [REQ-008] 状態×アクション マトリクス（不正遷移は throw）', () => {
  const states: ReportStatus[] = ['下書き', '提出済', '承認済', '差し戻し']
  const actions: WorkflowAction[] = ['submit', 'approve', 'reject', 'resubmit']
  const allowed = new Set<string>(['下書き|submit', '提出済|approve', '提出済|reject', '差し戻し|resubmit'])

  for (const state of states) {
    for (const action of actions) {
      const key = `${state}|${action}`
      if (allowed.has(key)) continue
      it(`transitionReport_${state}に${action}_不正遷移でErrorをthrowする`, () => {
        // Arrange
        const report: DailyReport = makeReport({ status: state, reportDate: '2026-08-10' })
        // Act & Assert
        expect(() => transitionReport(report, action, actor)).toThrow()
      })
    }
  }
})
