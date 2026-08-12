-- [REQ-007][NFR-01] 追加のみマイグレーション（additive-only / 破壊的変更なし）
-- Sprint3: シフト表 / 配置表 / 拡張制約フレームワーク / 希望休 / AI最適化(HITL) を支える最小の追加テーブル群。
-- 方針: spec/database-design.md（§0 additive-only, §3.5, §4群B, NFR-01 / ADR-006）に整合。
--   許可する操作: 冪等な新規テーブル生成 / NULL許容の列追加 / 冪等なインデックス生成 のみ。
--   禁止する操作: 破壊的DDL（削除・改名・型変更・既存列の必須化）は本ファイルに一切含めない。
--
-- 注意: 既存25テーブル（sites / staff / shifts 等）の完全なDDLは未提供であり、
--       ここでの参照・拡張対象は「モックアップ(全11画面v2)とREQからの推定(想定)」である（OQ-DB1）。
--       既存テーブル・既存RLSには一切触れず、NULL許容の追加列と新規テーブルのみを足す。

-- =====================================================================
-- 1) 既存 shifts への追加列（想定・全て NULL 許容・冪等）
--    シフト1セルの由来(base/manual/ai_apply)と勤務区分を後方互換に保持する。
--    REQ-016
-- =====================================================================
alter table if exists shifts add column if not exists work_type text;
alter table if exists shifts add column if not exists cell_source text;
alter table if exists shifts add column if not exists legacy_extras jsonb;

-- =====================================================================
-- 2) 拡張制約フレームワーク: データ駆動の制約定義（行を足すだけで制約追加）
--    category(legal/insurance/company/shift/other/任意) × severity(hard/soft) × kind × params(jsonb)。
--    REQ-018 / REQ-019
-- =====================================================================
create table if not exists shift_constraints (
  id         uuid primary key default gen_random_uuid(),
  site_id    uuid,                          -- 現場スコープ（sites.id への参照は仮定・FKは張らない=追加のみ安全側）
  category   text,                          -- legal / insurance / company / shift / other / 自由文字列
  severity   text,                          -- hard / soft
  kind       text,                          -- required_headcount / qualification_required / ... / 独自kind
  params     jsonb default '{}'::jsonb,     -- kind ごとのパラメータ
  weight     numeric,                       -- soft のときの回避重み
  label      text,
  source     text,                          -- 根拠（労働基準法 / 社会保険 / 自社規程 v3 ...）
  active     boolean default true,          -- 無効化フラグ（既定 true）
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_shift_constraints_site on shift_constraints(site_id, active);

-- =====================================================================
-- 3) スタッフ資格（有資格者のみ配置の判定に使用）
--    REQ-017 / REQ-018 / REQ-019
-- =====================================================================
create table if not exists staff_qualifications (
  id            uuid primary key default gen_random_uuid(),
  staff_id      uuid,                        -- staff.id への緩い参照（仮定・FKは張らない）
  qualification text,                        -- 例: 施設警備2級
  valid_from    date,
  valid_until   date,
  created_at    timestamptz default now()
);
create index if not exists idx_staff_qualifications_staff on staff_qualifications(staff_id);

-- =====================================================================
-- 4) 希望休（day_off_request 制約の入力データ）
--    REQ-018 / REQ-019
-- =====================================================================
create table if not exists shift_preferences (
  id          uuid primary key default gen_random_uuid(),
  site_id     uuid,
  staff_id    uuid,
  target_date date,
  kind        text default 'day_off_request',
  note        text,
  created_at  timestamptz default now()
);
create index if not exists idx_shift_preferences_staff on shift_preferences(staff_id, target_date);

-- =====================================================================
-- 5) 最適化ラン（HITL: 管制員確認を経てのみ確定。自動確定しない）
--    REQ-019 / REQ-020 / REQ-021
--    ★AI経路テーブル: クライアント書込不可・SELECT のみ / 書込は service_role 専用の方針。
--      （実 RLS ポリシーは DB 結合時に付与。ここでは方針をコメントで明記するに留める＝追加のみ安全側）
-- =====================================================================
create table if not exists shift_optimization_runs (
  run_id       uuid primary key default gen_random_uuid(),
  site_id      uuid,
  month        text,                         -- YYYY-MM
  status       text default '下案',          -- 下案 / 確認中 / 確定
  evaluation   jsonb default '{}'::jsonb,     -- ConstraintEvalResult のスナップショット
  feasible     boolean,
  confirmed_by uuid,                          -- 管制員（確認者）
  confirmed_at timestamptz,
  created_at   timestamptz default now()
);
create index if not exists idx_shift_opt_runs_site on shift_optimization_runs(site_id, month);

-- 6) 最適化ランの各割付（下案の1割付＋説明）。AI経路テーブル（SELECTのみ / service_role書込）。
create table if not exists shift_optimization_assignments (
  id          uuid primary key default gen_random_uuid(),
  run_id      uuid references shift_optimization_runs(run_id) on delete cascade,
  target_date date,
  position    text,
  staff_id    uuid,                           -- NULL=充足不能スロット
  explanation jsonb default '{}'::jsonb,       -- satisfied[] / reasons[]
  created_at  timestamptz default now()
);
create index if not exists idx_shift_opt_assign_run on shift_optimization_assignments(run_id, target_date);

-- =====================================================================
-- 7) シフト上書き（HITL/AI反映）。source で base/manual/ai_apply を区別。
--    database-design.md §3.5 / §4群B と整合。AI反映(ai_apply)は service_role 経由でのみ書込。
--    REQ-016 / REQ-020
-- =====================================================================
create table if not exists shift_overrides (
  id          uuid primary key default gen_random_uuid(),
  site_id     uuid,
  staff_id    uuid,
  target_date date,
  work_type   text,
  source      text,                            -- base / manual / ai_apply
  run_id      uuid,                            -- ai_apply の由来ラン（緩い参照・FKは張らない）
  created_at  timestamptz default now()
);
create index if not exists idx_shift_overrides_site on shift_overrides(site_id, target_date);
