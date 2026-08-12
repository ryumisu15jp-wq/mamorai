// [REQ-004][REQ-008][REQ-009][NFR-03] 日報リポジトリ 統合テスト（実Postgres往復・RLS実効）。
// app_client（非superuser/nobypassrls）で接続し、SET LOCAL app.user_id によるRLSを実証する。
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { SubmitValidationError } from '@mamorai/input-core'
import { withUser, closePool } from './pool.js'
import { createReport, getReport, listReportsByMonth, transitionReport } from './reportRepo.js'
import {
  seed,
  cleanup,
  closeAdmin,
  SITE1,
  U_A,
  U_B,
  STAFF_A,
  TEMPLATE,
  VALID_VALUES,
} from './testSupport.js'

const MONTH = '2026-08'
const D1 = '2026-08-11'

beforeAll(async () => {
  await seed()
})

afterAll(async () => {
  await cleanup()
  await closePool()
  await closeAdmin()
})

describe('reportRepo × RLS（実DB往復）', () => {
  it('u_a: 提出済日報を作成→同一接続で取得でき、input-core検証を通過している', async () => {
    const report = await withUser(U_A, (db) =>
      createReport(db, {
        id: crypto.randomUUID(),
        siteId: SITE1,
        templateId: TEMPLATE.id,
        reporterId: STAFF_A,
        reportDate: D1,
        values: VALID_VALUES,
        template: TEMPLATE, // 提出=createSubmittedReport 検証経路
      })
    )
    expect(report.status).toBe('提出済')
    expect(report.submittedAt).not.toBeNull()

    const fetched = await withUser(U_A, (db) => getReport(db, report.id))
    expect(fetched).not.toBeNull()
    expect(fetched?.siteId).toBe(SITE1)
    expect(fetched?.values.patrol?.rounds).toBe(3)
  })

  it('input-core検証NG（範囲外）は SubmitValidationError で INSERT されない', async () => {
    await expect(
      withUser(U_A, (db) =>
        createReport(db, {
          id: crypto.randomUUID(),
          siteId: SITE1,
          templateId: TEMPLATE.id,
          reporterId: STAFF_A,
          reportDate: D1,
          values: { patrol: { rounds: 999 }, check: { locked: true } }, // range 0..99 違反
          template: TEMPLATE,
        })
      )
    ).rejects.toBeInstanceOf(SubmitValidationError)
  })

  it('承認WF: 提出済→承認済 が実DBで永続更新される（input-coreのtransition委譲）', async () => {
    const id = crypto.randomUUID()
    await withUser(U_A, (db) =>
      createReport(db, {
        id,
        siteId: SITE1,
        templateId: TEMPLATE.id,
        reporterId: STAFF_A,
        reportDate: '2026-08-12',
        values: VALID_VALUES,
        template: TEMPLATE,
      })
    )
    const approved = await withUser(U_A, (db) =>
      transitionReport(db, id, 'approve', { id: U_A, at: new Date().toISOString() })
    )
    expect(approved.status).toBe('承認済')
    expect(approved.approverId).toBe(U_A)

    // 別接続で再取得しても永続化されている
    const reread = await withUser(U_A, (db) => getReport(db, id))
    expect(reread?.status).toBe('承認済')
  })

  it('listReportsByMonth: 当月全日を返し（未作成補完）、作成日は status を持つ', async () => {
    const rows = await withUser(U_A, (db) => listReportsByMonth(db, SITE1, MONTH))
    expect(rows).toHaveLength(31) // 2026-08 は31日
    const d11 = rows.find((r) => r.reportDate === D1)
    expect(d11?.status).toBe('提出済')
    const empty = rows.find((r) => r.reportDate === '2026-08-28')
    expect(empty?.status).toBe('未作成')
  })

  it('RLS実効: u_a が作った site1 日報は u_b から取得できない（0件/null）', async () => {
    const id = crypto.randomUUID()
    await withUser(U_A, (db) =>
      createReport(db, {
        id,
        siteId: SITE1,
        templateId: TEMPLATE.id,
        reporterId: STAFF_A,
        reportDate: '2026-08-13',
        values: VALID_VALUES,
        template: TEMPLATE,
      })
    )
    // u_b は site2 担当 → site1 の当該日報は不可視
    const asB = await withUser(U_B, (db) => getReport(db, id))
    expect(asB).toBeNull()

    const listB = await withUser(U_B, (db) => listReportsByMonth(db, SITE1, MONTH))
    const anyReal = listB.filter((r) => r.report !== null)
    expect(anyReal).toHaveLength(0) // 担当外現場は全日「未作成」
  })

  it('RLS実効: u_b は site1 に日報を書けない（INSERT 拒否）', async () => {
    await expect(
      withUser(U_B, (db) =>
        createReport(db, {
          id: crypto.randomUUID(),
          siteId: SITE1, // 担当外現場への書込
          templateId: TEMPLATE.id,
          reporterId: STAFF_A,
          reportDate: '2026-08-14',
          values: VALID_VALUES,
          template: TEMPLATE,
        })
      )
    ).rejects.toThrow(/row-level security/i)
  })
})
