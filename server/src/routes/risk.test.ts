// [REQ-014] リスクゲートウェイのハンドラ検証。
// callPredictionEngine(モック) を注入し、fromPredictionResponse 経由の RiskItem[] が返ること、
// APIキー等の機密がレスポンスへ混入しないことを確認する。
import { describe, it, expect, vi } from 'vitest'
import type { Request, Response } from 'express'
import { createRiskHandler, type PredictionEngine } from './risk.js'

/** 最小の Response ダブル（status/json を記録する）。 */
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

function reqWith(query: Record<string, unknown>): Request {
  return { query } as unknown as Request
}

describe('createRiskHandler', () => {
  it('生レスポンスを fromPredictionResponse 経由の RiskItem[] に整形して返す', async () => {
    // 予測エンジンの生レスポンス（unknown 形）をモックで注入。level は含めない。
    const engine: PredictionEngine = vi.fn(async (siteId: string) => [
      { id: `${siteId}-a`, type: '未施錠', position: 'A立哨', score: 90, probability: 0.9, factors: ['f1'] },
      { id: `${siteId}-b`, type: '不審者', position: 'B立哨', score: 30, probability: 0.2, factors: [] },
      { bogus: true }, // id/score を欠く要素は除外される
    ])
    const handler = createRiskHandler(engine)
    const { res, state } = mockRes()

    await handler(reqWith({ siteId: 'site-bht' }), res)

    expect(engine).toHaveBeenCalledWith('site-bht')
    expect(state.statusCode).toBe(200)
    const body = state.body as Array<Record<string, unknown>>
    // 不正要素は落ち、2件のみ。level は input-core が付与している。
    expect(body).toHaveLength(2)
    expect(body[0]).toMatchObject({ id: 'site-bht-a', score: 90, level: 'High' })
    expect(body[1]).toMatchObject({ id: 'site-bht-b', score: 30, level: 'Low' })
  })

  it('APIキー等の機密はレスポンスに混入しない', async () => {
    const SECRET = 'sk-secret-should-never-leak'
    // 万一エンジンがキーを含むペイロードを返しても、整形で許可フィールドのみ通す。
    const engine: PredictionEngine = async (siteId: string) => [
      { id: `${siteId}-x`, type: '警報無視', position: 'C立哨', score: 55, probability: 0.5, factors: ['f'], apiKey: SECRET, authorization: `Bearer ${SECRET}` },
    ]
    const handler = createRiskHandler(engine)
    const { res, state } = mockRes()

    await handler(reqWith({ siteId: 'site-bht' }), res)

    const serialized = JSON.stringify(state.body)
    expect(serialized).not.toContain(SECRET)
    expect(serialized).not.toContain('apiKey')
    expect(serialized).not.toContain('authorization')
  })

  it('siteId 未指定は 400', async () => {
    const engine: PredictionEngine = vi.fn(async () => [])
    const handler = createRiskHandler(engine)
    const { res, state } = mockRes()

    await handler(reqWith({}), res)

    expect(state.statusCode).toBe(400)
    expect(engine).not.toHaveBeenCalled()
  })
})
