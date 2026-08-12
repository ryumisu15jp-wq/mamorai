// [NFR-03][HIGH-1][HIGH-2] RLS是正の統合テスト（0202_rls_hardening.sql / pool.ts app_service分離）。
//   ・HIGH-2: 0202でRLSを張った各テナント表について、担当外(site2)データが u_a から 0 件であること。
//   ・HIGH-1: app_client が app.role='service' を偽装(set_config)しても群B書込が拒否されること。
//   ・正当経路: withService（app_service 別接続）でのみ群B書込が成立すること。
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { withUser, withService, pool, closePool } from './pool.js'
import { seed, cleanup, closeAdmin, SITE1, SITE2, U_A, STAFF_B } from './testSupport.js'

beforeAll(async () => {
  await seed()
})

afterAll(async () => {
  await cleanup()
  await closePool()
  await closeAdmin()
})

/** withUser 下で単一 count クエリを実行して数値を返す小ヘルパー。 */
async function countAs(userId: string, sql: string, params: readonly unknown[]): Promise<number> {
  return withUser(userId, async (db) => {
    const { rows } = await db.query<{ n: string }>(sql, params)
    return Number(rows[0]?.n ?? '-1')
  })
}

describe('RLS是正: 越境読取ゼロ（HIGH-2）', () => {
  it('u_a は担当外(site2)の notifications 機密通知を読めない（0件）。broadcastは可視', async () => {
    const site2 = await countAs(U_A, `select count(*) n from notifications where target_site_id = $1`, [SITE2])
    expect(site2).toBe(0)
    const site1 = await countAs(U_A, `select count(*) n from notifications where target_site_id = $1`, [SITE1])
    expect(site1).toBe(1) // 自現場宛は可視
  })

  it('u_a は担当外(site2)の training_records(PII) を読めない（0件）', async () => {
    const n = await countAs(U_A, `select count(*) n from training_records where staff_id = $1`, [STAFF_B])
    expect(n).toBe(0)
  })

  it('u_a は担当外(site2)の staff_qualifications を読めない（0件）', async () => {
    const n = await countAs(U_A, `select count(*) n from staff_qualifications where staff_id = $1`, [STAFF_B])
    expect(n).toBe(0)
  })

  it('u_a は担当外(site2)の shift_constraints を読めない（0件）', async () => {
    const n = await countAs(U_A, `select count(*) n from shift_constraints where site_id = $1`, [SITE2])
    expect(n).toBe(0)
  })

  it('u_a は担当外(site2)の staff 名簿を読めない（0件）', async () => {
    const n = await countAs(U_A, `select count(*) n from staff where id = $1`, [STAFF_B])
    expect(n).toBe(0)
  })

  it('u_a は担当外(site2)の sites を読めない（自現場のみ=1件）', async () => {
    const site2 = await countAs(U_A, `select count(*) n from sites where id = $1`, [SITE2])
    expect(site2).toBe(0)
    const site1 = await countAs(U_A, `select count(*) n from sites where id = $1`, [SITE1])
    expect(site1).toBe(1)
  })
})

describe('RLS是正: service昇格の詐称不可（HIGH-1）', () => {
  it('app_client が app.role=service を偽装しても群B(runs) へ INSERT できない', async () => {
    // withUser と同じ app_client 接続上で GUC を立て、旧来の詐称経路を再現する。
    await expect(
      withUser(U_A, async (db) => {
        await db.query(`select set_config('app.role','service',true)`)
        await db.query(
          `insert into shift_optimization_runs (site_id, month, feasible) values ($1,'2026-08',true)`,
          [SITE1]
        )
      })
    ).rejects.toThrow(/permission denied|row-level security/i)
  })

  it('生の app_client 接続（GUCなし）でも群B(runs) へ INSERT できない', async () => {
    const client = await pool.connect()
    try {
      await expect(
        client.query(
          `insert into shift_optimization_runs (site_id, month, feasible) values ($1,'2026-08',true)`,
          [SITE1]
        )
      ).rejects.toThrow(/permission denied|row-level security/i)
    } finally {
      client.release()
    }
  })
})

describe('RLS是正: 正当なサーバ経路（app_service）でのみ群B書込可', () => {
  it('withService(app_service別接続) では群B(runs) へ INSERT でき run_id を返す', async () => {
    const runId = await withService(async (db) => {
      const { rows } = await db.query<{ run_id: string }>(
        `insert into shift_optimization_runs (site_id, month, feasible) values ($1,'2026-08',true) returning run_id`,
        [SITE1]
      )
      return rows[0]?.run_id ?? ''
    })
    expect(runId).toMatch(/^[0-9a-f-]{36}$/)
    // 後始末（app_service は DELETE 権限を持たないため withService では消さない）。
    await withService(async (db) => {
      await db.query(`update shift_optimization_runs set status='確定' where run_id=$1`, [runId])
    })
  })
})
