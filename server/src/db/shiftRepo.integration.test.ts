// [REQ-016][REQ-020][NFR-03] シフトリポジトリ 統合テスト（群A upsert / 群B service限定書込）。
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { withUser, withService, closePool } from './pool.js'
import { upsertShiftOverride, createOptimizationRun } from './shiftRepo.js'
import { seed, cleanup, closeAdmin, SITE1, U_A, U_B, STAFF_A } from './testSupport.js'

beforeAll(async () => {
  await seed()
})

afterAll(async () => {
  await cleanup()
  await closePool()
  await closeAdmin()
})

describe('shiftRepo × RLS（実DB往復）', () => {
  it('群A: u_a が site1 の shift_override を upsert（挿入→更新で同一行）', async () => {
    const first = await withUser(U_A, (db) =>
      upsertShiftOverride(db, {
        siteId: SITE1,
        staffId: STAFF_A,
        targetDate: '2026-08-11',
        workType: '日勤',
      })
    )
    expect(first.workType).toBe('日勤')

    const second = await withUser(U_A, (db) =>
      upsertShiftOverride(db, {
        siteId: SITE1,
        staffId: STAFF_A,
        targetDate: '2026-08-11',
        workType: '夜勤', // 同キー → 更新
      })
    )
    expect(second.id).toBe(first.id) // 同一行を更新（upsert）
    expect(second.workType).toBe('夜勤')
  })

  it('RLS実効: u_b は site1 の shift_override を書けない（拒否）', async () => {
    await expect(
      withUser(U_B, (db) =>
        upsertShiftOverride(db, {
          siteId: SITE1, // 担当外
          staffId: STAFF_A,
          targetDate: '2026-08-12',
          workType: '日勤',
        })
      )
    ).rejects.toThrow(/row-level security/i)
  })

  it('群B: app_client 直INSERT（optimization_runs）は拒否される（0202でGRANT剥奪＝permission denied）', async () => {
    // 0202_rls_hardening.sql により app_client は群Bへの INSERT 権限を持たない。
    // よって RLS 評価の手前（GRANT層）で permission denied となり、二重に遮断される。
    await expect(
      withUser(U_A, (db) =>
        createOptimizationRun(db, { siteId: SITE1, month: '2026-08', feasible: true })
      )
    ).rejects.toThrow(/permission denied|row-level security/i)
  })

  it('群B: withService（app.role=service）では optimization_runs を作成できる', async () => {
    const runId = await withService((db) =>
      createOptimizationRun(db, { siteId: SITE1, month: '2026-08', feasible: true })
    )
    expect(runId).toMatch(/^[0-9a-f-]{36}$/)

    // service は SELECT も可能（担当外含め全件可）
    const seen = await withService((db) =>
      db.query<{ run_id: string }>('select run_id from shift_optimization_runs where run_id = $1', [runId])
    )
    expect(seen.rows).toHaveLength(1)
  })
})
