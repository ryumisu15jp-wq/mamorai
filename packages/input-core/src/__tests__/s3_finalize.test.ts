// [REQ-020] HITL: 管制員確認を経てのみ確定 / 実運用反映 の RED テスト
// テスト規約: AAA / 「対象_条件_期待」 / 否定テスト必須 / 純粋・決定論
import { describe, it, expect } from 'vitest'
import { createOptimizationRun, confirmOptimizationRun, applyConfirmedRun } from '../index.js'
import type { OptimizationResult, OptimizationRun, Actor } from '../types.js'
import { SITE_ID, MONTH, da } from './s3_fixtures.js'

const ACTOR: Actor = { id: 'controller-1', at: '2026-08-11T10:00:00Z' }

function makeResult(): OptimizationResult {
  return {
    runId: 'run-fin-1',
    draft: [
      da('2026-08-10', '責任者', 's1', { satisfied: ['資格'], reasons: ['有資格者'] }),
      da('2026-08-10', '日勤A', 's2', { satisfied: [], reasons: ['最小ID'] }),
      da('2026-08-10', '夜勤A', null, { satisfied: [], reasons: ['候補不在'] }),
    ],
    evaluation: { hardViolations: [], softViolations: [], totalPenalty: 0, feasible: true },
    feasible: true,
    unresolved: [],
    status: '下案',
  }
}

describe('createOptimizationRun [REQ-020] 下案ラン生成', () => {
  it('createOptimizationRun_最適化結果_status下案のランを生成する', () => {
    // Arrange & Act
    const run = createOptimizationRun(makeResult(), SITE_ID, MONTH)
    // Assert
    expect(run.status).toBe('下案')
    expect(run.siteId).toBe(SITE_ID)
    expect(run.month).toBe(MONTH)
    expect(run.runId).toBe('run-fin-1')
  })
})

describe('confirmOptimizationRun [REQ-020] 管制員確認ゲート', () => {
  it('confirmOptimizationRun_reviewedがfalse_確定を拒否しthrowする（否定テスト）', () => {
    // Arrange
    const run = createOptimizationRun(makeResult(), SITE_ID, MONTH)
    // Act & Assert
    expect(() => confirmOptimizationRun(run, ACTOR, { reviewed: false })).toThrow()
  })

  it('confirmOptimizationRun_reviewedがtrue_status確定へ遷移し確認者と時刻を記録する', () => {
    // Arrange
    const run = createOptimizationRun(makeResult(), SITE_ID, MONTH)
    // Act
    const confirmed = confirmOptimizationRun(run, ACTOR, { reviewed: true })
    // Assert
    expect(confirmed.status).toBe('確定')
    expect(confirmed.confirmedBy).toBe(ACTOR.id)
    expect(confirmed.confirmedAt).toBe(ACTOR.at)
  })

  it('confirmOptimizationRun_既に確定済み_再確定をthrowで拒否する（否定テスト）', () => {
    // Arrange
    const run = createOptimizationRun(makeResult(), SITE_ID, MONTH)
    const confirmed = confirmOptimizationRun(run, ACTOR, { reviewed: true })
    // Act & Assert
    expect(() => confirmOptimizationRun(confirmed, ACTOR, { reviewed: true })).toThrow()
  })
})

describe('applyConfirmedRun [REQ-020] 実運用反映', () => {
  it('applyConfirmedRun_未確定ラン_throwで拒否する（否定テスト）', () => {
    // Arrange
    const run = createOptimizationRun(makeResult(), SITE_ID, MONTH)
    // Act & Assert
    expect(() => applyConfirmedRun(run)).toThrow()
  })

  it('applyConfirmedRun_確定ラン_非null割付のみShiftCell(source ai_apply)へ写像する', () => {
    // Arrange
    const confirmed = confirmOptimizationRun(createOptimizationRun(makeResult(), SITE_ID, MONTH), ACTOR, { reviewed: true })
    // Act
    const cells = applyConfirmedRun(confirmed)
    // Assert: null(夜勤A)は除外 → 2件
    expect(cells).toHaveLength(2)
    expect(cells.every((c) => c.source === 'ai_apply')).toBe(true)
    expect(cells.every((c) => c.staffId !== null)).toBe(true)
  })

  it('applyConfirmedRun_写像後のセル_workTypeがpositionと一致する', () => {
    // Arrange
    const confirmed = confirmOptimizationRun(createOptimizationRun(makeResult(), SITE_ID, MONTH), ACTOR, { reviewed: true })
    // Act
    const cells = applyConfirmedRun(confirmed)
    // Assert
    const sekininsha = cells.find((c) => c.staffId === 's1')
    expect(sekininsha?.workType).toBe('責任者')
    expect(sekininsha?.date).toBe('2026-08-10')
  })
})
