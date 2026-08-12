// [REQ-018/019/020] シフト最適化ゲートウェイのハンドラ検証。
// structure: モックClaude→parseConstraintsFromLLMで ConstraintDef[] を返す・キー非混入。
// optimize: 制約→下案(status='下案')を返す。
// confirm: reviewed:false を 403 で拒否（HITL・自動確定禁止）。
import { describe, it, expect } from 'vitest'
import type { Request, Response } from 'express'
import {
  createStructureHandler,
  createOptimizeHandler,
  createConfirmHandler,
} from './shift-optimize.js'
import { heuristicOptimize } from '../services/optimizer.js'
import type { CallClaude } from '../services/claude.js'
import type { OptimizationContext } from '@mamorai/input-core'

function mockRes() {
  const state: { statusCode: number; body: unknown } = { statusCode: 200, body: undefined }
  const res = {
    status(code: number) {
      state.statusCode = code
      return this
    },
    json(payload: unknown) {
      state.body = payload
      return this
    },
  } as unknown as Response
  return { res, state }
}

function reqWith(body: unknown): Request {
  return { body } as unknown as Request
}

const demoContext: OptimizationContext = {
  siteId: 'site-bht',
  month: '2026-08',
  workDates: ['2026-08-01', '2026-08-02'],
  staff: [
    { id: 'user-1', qualifications: ['施設警備2級'] },
    { id: 'user-2', qualifications: [] },
  ],
  positions: [
    { position: '日勤A', requiredHeadcount: 1 },
    { position: '夜勤A', requiredHeadcount: 1 },
  ],
  constraints: [
    { id: 'c1', category: 'shift', severity: 'hard', kind: 'required_headcount', params: { position: '日勤A', count: 1 }, label: '日勤A 1名', active: true },
  ],
}

describe('createStructureHandler', () => {
  it('モックClaudeの生出力を parseConstraintsFromLLM 経由で ConstraintDef[] に整形して返す', async () => {
    const SECRET = 'sk-should-never-leak'
    // 生出力にキーが混入しても、parse は許可フィールドのみ写像するので漏れない。
    const callClaude: CallClaude = async () => ({
      constraints: [
        { id: 'q1', category: 'legal', severity: 'hard', kind: 'max_consecutive_days', params: { days: 6 }, label: '連勤6日まで', source: '労働基準法', apiKey: SECRET },
      ],
    })
    const handler = createStructureHandler(callClaude)
    const { res, state } = mockRes()

    await handler(reqWith({ text: '連勤は6日までにして' }), res)

    expect(state.statusCode).toBe(200)
    const body = state.body as { constraints: Array<Record<string, unknown>> }
    expect(body.constraints).toHaveLength(1)
    expect(body.constraints[0]).toMatchObject({ id: 'q1', kind: 'max_consecutive_days', category: 'legal' })
    // キーは写像対象外なので混入しない。
    expect(JSON.stringify(body)).not.toContain(SECRET)
    expect(JSON.stringify(body)).not.toContain('apiKey')
  })

  it('text 未指定は 400', async () => {
    const callClaude: CallClaude = async () => ({ constraints: [] })
    const handler = createStructureHandler(callClaude)
    const { res, state } = mockRes()
    await handler(reqWith({}), res)
    expect(state.statusCode).toBe(400)
  })
})

describe('createOptimizeHandler', () => {
  it('制約→下案(status=下案)の OptimizationRun を返す', async () => {
    const handler = createOptimizeHandler(heuristicOptimize)
    const { res, state } = mockRes()

    await handler(reqWith({ context: demoContext, runId: 'run-test' }), res)

    expect(state.statusCode).toBe(200)
    const body = state.body as { run: { status: string; result: { status: string; draft: unknown[] } } }
    expect(body.run.status).toBe('下案')
    expect(body.run.result.status).toBe('下案')
    // 2日 × 2ポジション = 4 スロットぶんの下案が生成される。
    expect(body.run.result.draft).toHaveLength(4)
  })
})

describe('createConfirmHandler', () => {
  it('reviewed:false を 403 で拒否（HITL・自動確定禁止）', async () => {
    const handler = createConfirmHandler()
    const { res, state } = mockRes()
    const run = heuristicOptimize(demoContext, 'run-hitl')

    await handler(reqWith({ run, actor: { id: 'mgr-1', at: '2026-08-11T00:00:00.000Z' }, reviewed: false }), res)

    expect(state.statusCode).toBe(403)
  })

  it('reviewed:true で確定し applied(ShiftCell[]) を返す', async () => {
    const handler = createConfirmHandler()
    const { res, state } = mockRes()
    const run = heuristicOptimize(demoContext, 'run-ok')

    await handler(reqWith({ run, actor: { id: 'mgr-1', at: '2026-08-11T00:00:00.000Z' }, reviewed: true }), res)

    expect(state.statusCode).toBe(200)
    const body = state.body as { run: { status: string }; applied: Array<{ source?: string }> }
    expect(body.run.status).toBe('確定')
    // 反映セルは全て ai_apply。
    expect(body.applied.every((c) => c.source === 'ai_apply')).toBe(true)
  })
})
