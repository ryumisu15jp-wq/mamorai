// 統合テスト用の土台: 特権(postgres)接続での前提データ投入/後始末 & 固定フィクスチャ。
// アプリ操作は app_client プール(pool.ts)で行い、seed/cleanup のみ superuser で行う
// （app_client は sites/staff/app_site_members への書込権を持たない=最小権限）。
import { Pool } from 'pg'
import type { ReportTemplate } from '@mamorai/input-core'

/** 特権接続（seed/cleanup 専用。RLS バイパス）。既定は trust ローカル。 */
const ADMIN_CONNECTION =
  process.env['DATABASE_URL_ADMIN'] ?? 'postgres://postgres@127.0.0.1:5433/mamorai'

export const adminPool = new Pool({ connectionString: ADMIN_CONNECTION })

// ── 固定 UUID（テスト専用名前空間。冪等クリーンアップの対象キー）──
export const SITE1 = 'd1000000-0000-0000-0000-000000000001'
export const SITE2 = 'd1000000-0000-0000-0000-000000000002'
export const U_A = 'd2000000-0000-0000-0000-00000000000a' // site1 担当
export const U_B = 'd2000000-0000-0000-0000-00000000000b' // site2 担当
export const STAFF_A = 'd3000000-0000-0000-0000-00000000000a'
export const STAFF_B = 'd3000000-0000-0000-0000-00000000000b'
export const TEMPLATE_ID = 'd4000000-0000-0000-0000-000000000001' // daily_reports.template_id は uuid 列

/** 提出前検証(validateForSubmit)を通過するテンプレート（1分日報: counter+check）。 */
export const TEMPLATE: ReportTemplate = {
  id: TEMPLATE_ID,
  siteId: SITE1,
  name: '統合テスト用テンプレート',
  sections: [
    {
      id: 'patrol',
      kind: 'counter',
      label: '巡回',
      fields: [
        { key: 'rounds', label: '巡回回数', type: 'number', required: true, range: { min: 0, max: 99 } },
      ],
    },
    {
      id: 'check',
      kind: 'check',
      label: '確認',
      fields: [{ key: 'locked', label: '施錠確認', type: 'check' }],
    },
  ],
}

/** 検証を通過する values。 */
export const VALID_VALUES = { patrol: { rounds: 3 }, check: { locked: true } }

/** 前提データ投入（冪等）。sites/staff/app_site_members: u_a=site1, u_b=site2。 */
export async function seed(): Promise<void> {
  await cleanup()
  await adminPool.query(
    `insert into sites (id, name) values ($1,'IntSite1'), ($2,'IntSite2')
     on conflict (id) do nothing`,
    [SITE1, SITE2]
  )
  await adminPool.query(
    `insert into staff (id, site_id, name, role) values
       ($1,$3,'IntStaffA','guard'), ($2,$4,'IntStaffB','guard')
     on conflict (id) do nothing`,
    [STAFF_A, STAFF_B, SITE1, SITE2]
  )
  await adminPool.query(
    `insert into app_site_members (user_id, site_id, role) values
       ($1,$3,'guard'), ($2,$4,'guard')
     on conflict (user_id, site_id) do nothing`,
    [U_A, U_B, SITE1, SITE2]
  )
  // 越境読取テスト用: 0202 でRLSを張った各テナント表に site1/site2 双方の行を投入。
  // site2 行は u_a（site1担当）から 0 件でなければならない（HIGH-2 是正の証跡）。
  await adminPool.query(
    `insert into notifications (id, kind, title, body, target_scope, target_site_id) values
       ('e5100000-0000-0000-0000-000000000001','本部通知','Int-site1','b1','site',$1),
       ('e5100000-0000-0000-0000-000000000002','本部通知','Int-site2機密','b2機密','site',$2)
     on conflict (id) do nothing`,
    [SITE1, SITE2]
  )
  await adminPool.query(
    `insert into training_records (staff_id, training_type, required_hours, completed_hours) values
       ($1,'新任基本研修',45,45), ($2,'site2PII研修',45,10)`,
    [STAFF_A, STAFF_B]
  )
  await adminPool.query(
    `insert into staff_qualifications (staff_id, qualification) values
       ($1,'施設警備2級'), ($2,'site2機密資格')`,
    [STAFF_A, STAFF_B]
  )
  await adminPool.query(
    `insert into shift_constraints (site_id, category, severity, kind, source) values
       ($1,'legal','hard','required_headcount','労基法'),
       ($2,'insurance','hard','qualification_required','site2機密')`,
    [SITE1, SITE2]
  )
}

/** 後始末（テスト由来行のみ・依存順）。 */
export async function cleanup(): Promise<void> {
  await adminPool.query(`delete from shift_optimization_runs where site_id = any($1)`, [[SITE1, SITE2]])
  await adminPool.query(`delete from shift_overrides where site_id = any($1)`, [[SITE1, SITE2]])
  await adminPool.query(`delete from daily_reports where site_id = any($1)`, [[SITE1, SITE2]])
  await adminPool.query(`delete from shift_constraints where site_id = any($1)`, [[SITE1, SITE2]])
  await adminPool.query(`delete from notifications where target_site_id = any($1)`, [[SITE1, SITE2]])
  await adminPool.query(`delete from training_records where staff_id = any($1)`, [[STAFF_A, STAFF_B]])
  await adminPool.query(`delete from staff_qualifications where staff_id = any($1)`, [[STAFF_A, STAFF_B]])
  await adminPool.query(`delete from app_site_members where site_id = any($1)`, [[SITE1, SITE2]])
  await adminPool.query(`delete from staff where site_id = any($1)`, [[SITE1, SITE2]])
  await adminPool.query(`delete from sites where id = any($1)`, [[SITE1, SITE2]])
}

export async function closeAdmin(): Promise<void> {
  await adminPool.end()
}
