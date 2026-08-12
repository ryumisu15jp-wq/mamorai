# データベース設計 — 入退管理システム

**作成:** Database Engineer (#08)　**作成日:** 2026-08-10
**参照:** spec/behavioral-spec.md（REQ-001〜015）, spec/architecture.md（ADR-001〜005）

---

## テーブル一覧

| テーブル | 役割 | 対応REQ |
|---|---|---|
| `sites` | 拠点(現場)マスタ | REQ-005, REQ-006, REQ-012, REQ-015 |
| `site_roles` | ユーザー×拠点の権限 | REQ-007 |
| `companies` | 業者マスタ | REQ-004, REQ-013 |
| `visits` | 業者・来館者の入退記録 | REQ-001, REQ-002, REQ-014 |
| `vehicle_visits` | 車両の入退記録 | REQ-003, REQ-014 |
| `visit_corrections` | 訂正（取消）記録 | REQ-014 |

---

## 0001_init.sql

```sql
-- 拡張機能
create extension if not exists "pgcrypto"; -- gen_random_uuid()用
create extension if not exists pg_cron;    -- 退場忘れアラート用(ADR-004)

-- 拠点(現場)マスタ
create table sites (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  overstay_threshold_minutes integer not null default 480, -- REQ-012: 拠点別アラート閾値(デフォルト8時間、OQ-02確定後に見直し)
  data_retention_days integer not null default 365,          -- REQ-015: 個人情報保持期間
  created_at timestamptz not null default now()
);

-- ユーザー×拠点の権限(REQ-007)
create table site_roles (
  user_id uuid not null references auth.users(id) on delete cascade,
  site_id uuid not null references sites(id) on delete cascade,
  role text not null check (role in ('admin', 'guard')),
  created_at timestamptz not null default now(),
  primary key (user_id, site_id)
);

create index idx_site_roles_site_id on site_roles(site_id);

-- 業者マスタ(REQ-004, REQ-013)
create table companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_name text,
  contact_phone text,
  created_at timestamptz not null default now()
);

-- 業者・来館者の入退記録(REQ-001, REQ-002)
create table visits (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references sites(id),           -- REQ-005: 必須
  visitor_type text not null check (visitor_type in ('contractor', 'guest')), -- 業者/来館者
  visitor_name text not null,
  company_id uuid references companies(id),               -- 業者の場合のみ設定(任意)
  company_name_snapshot text,                              -- 手入力時の会社名スナップショット
  visit_purpose text,
  entered_at timestamptz not null default now(),
  exited_at timestamptz,                                   -- null = 入場中
  registered_by uuid references auth.users(id),            -- 受付タブレット操作者(あれば)
  created_at timestamptz not null default now()
);

-- REQ-011: 退場忘れアラート判定用の部分インデックス(ADR-004)
create index idx_visits_active on visits(site_id, entered_at) where exited_at is null;
create index idx_visits_site_period on visits(site_id, entered_at);

-- 車両の入退記録(REQ-003)
create table vehicle_visits (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references sites(id),            -- REQ-005: 必須
  vehicle_number text not null,                            -- OQ-03確定まではナンバーのみ必須、他は任意
  vehicle_type text,
  driver_name text,
  company_id uuid references companies(id),
  entered_at timestamptz not null default now(),
  exited_at timestamptz,
  registered_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index idx_vehicle_visits_active on vehicle_visits(site_id, entered_at) where exited_at is null;
create index idx_vehicle_visits_site_period on vehicle_visits(site_id, entered_at);

-- REQ-014: 訂正記録(取消)。visits/vehicle_visitsへのUPDATE/DELETEは行わず、
-- 誤入力等の訂正が必要な場合はここに取消理由を追記する追記型ログとする。
create table visit_corrections (
  id uuid primary key default gen_random_uuid(),
  target_table text not null check (target_table in ('visits', 'vehicle_visits')),
  target_id uuid not null,
  reason text not null,
  corrected_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create index idx_visit_corrections_target on visit_corrections(target_table, target_id);
```

## 0002_rls.sql

```sql
alter table sites enable row level security;
alter table site_roles enable row level security;
alter table companies enable row level security;
alter table visits enable row level security;
alter table vehicle_visits enable row level security;
alter table visit_corrections enable row level security;

-- site_roles: 自分の行のみSELECT可能。INSERT/UPDATE/DELETEはadminロールを持つユーザーのみ。
-- (Architect申し送り事項1)
create policy site_roles_select_own on site_roles
  for select using (user_id = auth.uid());

create policy site_roles_admin_insert on site_roles
  for insert with check (
    exists (
      select 1 from site_roles sr
      where sr.user_id = auth.uid() and sr.site_id = site_roles.site_id and sr.role = 'admin'
    )
  );

create policy site_roles_admin_update on site_roles
  for update using (
    exists (
      select 1 from site_roles sr
      where sr.user_id = auth.uid() and sr.site_id = site_roles.site_id and sr.role = 'admin'
    )
  );

create policy site_roles_admin_delete on site_roles
  for delete using (
    exists (
      select 1 from site_roles sr
      where sr.user_id = auth.uid() and sr.site_id = site_roles.site_id and sr.role = 'admin'
    )
  );

-- sites: 担当拠点のみSELECT可能。作成・更新はadminロールを持つユーザーのみ。
create policy sites_select_assigned on sites
  for select using (
    exists (select 1 from site_roles sr where sr.user_id = auth.uid() and sr.site_id = sites.id)
  );

create policy sites_admin_update on sites
  for update using (
    exists (select 1 from site_roles sr where sr.user_id = auth.uid() and sr.site_id = sites.id and sr.role = 'admin')
  );

-- companies: 認証済み全ユーザーがSELECT/INSERT可能(業者マスタは拠点を跨いだ共有情報のため)
create policy companies_select_authenticated on companies
  for select using (auth.role() = 'authenticated');

create policy companies_insert_authenticated on companies
  for insert with check (auth.role() = 'authenticated');

-- visits: 担当site_idのみSELECT/INSERT可能。UPDATE/DELETEポリシーは定義しない(REQ-014)。
-- (Architect申し送り事項2)
create policy visits_select_assigned_site on visits
  for select using (
    exists (select 1 from site_roles sr where sr.user_id = auth.uid() and sr.site_id = visits.site_id)
  );

create policy visits_insert_assigned_site on visits
  for insert with check (
    exists (select 1 from site_roles sr where sr.user_id = auth.uid() and sr.site_id = visits.site_id)
  );
-- 意図的にUPDATE/DELETEポリシーなし: デフォルトのRLSは「ポリシーがない操作は全拒否」のため、
-- これによりUPDATE/DELETEは誰であっても不可能になる(追記型ログの強制)。

-- vehicle_visits: visitsと同一方針
create policy vehicle_visits_select_assigned_site on vehicle_visits
  for select using (
    exists (select 1 from site_roles sr where sr.user_id = auth.uid() and sr.site_id = vehicle_visits.site_id)
  );

create policy vehicle_visits_insert_assigned_site on vehicle_visits
  for insert with check (
    exists (select 1 from site_roles sr where sr.user_id = auth.uid() and sr.site_id = vehicle_visits.site_id)
  );

-- visit_corrections: 対象レコードのsite_idに対する権限を持つユーザーのみ操作可能
create policy visit_corrections_select on visit_corrections
  for select using (
    (target_table = 'visits' and exists (
      select 1 from visits v join site_roles sr on sr.site_id = v.site_id
      where v.id = visit_corrections.target_id and sr.user_id = auth.uid()
    )) or
    (target_table = 'vehicle_visits' and exists (
      select 1 from vehicle_visits vv join site_roles sr on sr.site_id = vv.site_id
      where vv.id = visit_corrections.target_id and sr.user_id = auth.uid()
    ))
  );

create policy visit_corrections_insert on visit_corrections
  for insert with check (corrected_by = auth.uid());
```

## 0003_data_retention.sql（REQ-015: 個人情報保持期間のマスキング用ジョブ）

```sql
-- 保持期間を超過したvisitsの個人情報列をマスキングする関数
-- (レコード自体は削除せず、REQ-014の監査要件のため入退記録の「存在」は残す)
create or replace function mask_expired_visits() returns void as $$
begin
  update visits v
  set visitor_name = '[masked]', company_name_snapshot = null
  from sites s
  where v.site_id = s.id
    and v.entered_at < now() - (s.data_retention_days || ' days')::interval
    and v.visitor_name <> '[masked]';

  update vehicle_visits vv
  set driver_name = '[masked]'
  from sites s
  where vv.site_id = s.id
    and vv.entered_at < now() - (s.data_retention_days || ' days')::interval
    and vv.driver_name is not null
    and vv.driver_name <> '[masked]';
end;
$$ language plpgsql security definer;

-- 注記: この関数はvisitsテーブルへのUPDATEを行うが、これはRLS経由のユーザー操作ではなく
-- service_role権限で実行されるサーバー側ジョブであるため、REQ-014の「ユーザーによる改ざん禁止」
-- 方針とは矛盾しない(あくまで法令順守のための自動マスキングであり、入退記録データ自体は保持される)。

select cron.schedule('mask-expired-visits-daily', '0 3 * * *', 'select mask_expired_visits();');
```

---

## クロスユーザーRLS検証テスト例（pgTAP形式）

```sql
-- テスト前提: user_a は site_1 の guard、user_b は site_2 の guard としてsite_rolesに登録済み

-- user_a が site_2 の visits を SELECT しようとすると0件になること(クロスアクセス拒否)
select is(
  (select count(*) from visits where site_id = 'site_2_uuid'), -- user_aとしてSET ROLEした状態で実行
  0::bigint,
  'user_a should not see site_2 visits'
);

-- user_a が site_2 に対して visits を INSERT しようとするとエラーになること
select throws_ok(
  $$ insert into visits (site_id, visitor_type, visitor_name) values ('site_2_uuid', 'guest', 'test') $$,
  'new row violates row-level security policy for table "visits"'
);

-- 誰であってもvisitsをUPDATEできないこと(REQ-014、adminロールでも不可)
select throws_ok(
  $$ update visits set visitor_name = 'changed' where id = 'some_visit_uuid' $$,
  'no UPDATE policy exists, statement is denied'
);

-- guardロールのuser_aがsite_1のsite_rolesにINSERTしようとするとエラーになること(admin以外は不可)
select throws_ok(
  $$ insert into site_roles (user_id, site_id, role) values ('user_c_uuid', 'site_1_uuid', 'guard') $$,
  'new row violates row-level security policy for table "site_roles"'
);
```

---

## N+1クエリ対策メモ（Generatorへの申し送り）

- REQ-010（現在滞在者一覧）はサイトごとに`visits`と`vehicle_visits`を別々にクエリしてアプリ側でマージする設計とする（UNIONクエリより、部分インデックス`idx_visits_active`/`idx_vehicle_visits_active`を素直に使えるこちらの方がシンプルでパフォーマンスも出やすい）。
- REQ-004（入力候補提示）は`companies`テーブルへの単純なSELECTのみで完結させ、`visits`との結合で「過去の来訪履歴から会社名候補を出す」ような重いクエリは避ける（companiesマスタを都度更新する運用でシンプルに保つ）。

---

## 出力サマリー

```
Database Engineer 完了
テーブル数: 6 (sites, site_roles, companies, visits, vehicle_visits, visit_corrections)
RLSポリシー: 全テーブルに設定済み（visits/vehicle_visitsはUPDATE/DELETE意図的に未定義=追記型ログ強制）
インデックス: 部分インデックス2件(exited_at IS NULL)含む計6件
マイグレーション: 0001_init.sql, 0002_rls.sql, 0003_data_retention.sql
→ Architect(#07)・Generatorへ引き渡し
```
