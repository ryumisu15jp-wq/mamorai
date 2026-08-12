-- =====================================================================
-- 0000_base_assumed.sql  ―  ASSUMED BASELINE（推定・実DDL提供時に置換）
-- =====================================================================
-- 本ファイルは MAMOR-AI 既存(実)スキーマが未提供のため、RYUGEN方針に基づき
-- 「推定した既存ベーススキーマ」を正式スキーマとして暫定確定するものである。
-- 追加マイグレーション(0100/0102/0103)が参照・ALTERする既存テーブル/列の土台を
-- ここで最小限に用意し、実DBでの結合実証(0エラー適用)を可能にする。
--
-- ── 実DDL提供時の差替え方針 ────────────────────────────────────────
--  1) 本ファイルで create する sites / staff / daily_reports / shifts /
--     app_site_members は、実在の相当テーブルが判明した時点で「本ファイルごと
--     置換(または削除)」する。追加マイグレーション(0100/0102/0103)は改変しない。
--  2) FK参照先(sites.id / staff.id / auth.users.id)は全て仮定。実スキーマ確定後に
--     app_site_members を既存の現場メンバーシップ相当表へ差し替える(RLSの現場スコープ
--     判定 app_user_site_ids() の土台)。
--  3) 追加マイグレーションが ADD COLUMN IF NOT EXISTS で足す列は本ファイルでは作らない
--     (衝突回避)。追加マイグレーションが CREATE TABLE IF NOT EXISTS で作る表も作らない。
--  4) 破壊的DDL(削除/改名/型変更/必須化)は一切含めない。全て追加のみ・冪等。
-- =====================================================================

create extension if not exists pgcrypto;  -- gen_random_uuid() 用

-- =====================================================================
-- 1) sites : 現場(拠点)マスタ  ― 全新規テーブルの site_id FK先(仮定)
-- =====================================================================
create table if not exists sites (
  id          uuid primary key default gen_random_uuid(),
  name        text,
  code        text,
  address     text,
  is_active   boolean default true,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- =====================================================================
-- 2) staff : 隊員・管制員マスタ(auth.users と1:1想定)  ― staff_id FK先(仮定)
-- =====================================================================
create table if not exists staff (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid,                                   -- auth.users.id への緩い参照(仮定)
  name        text,
  site_id     uuid references sites(id),              -- 主担当現場
  role        text,                                   -- 隊員 / 責任者 / 管制員 等
  is_active   boolean default true,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);
create index if not exists idx_staff_site on staff(site_id);

-- =====================================================================
-- 3) app_site_members : 現場メンバーシップ(RLSの現場スコープ判定の土台)
--    実DDL提供時は既存の相当表へ差替え。app_user_site_ids() はここを参照する想定。
-- =====================================================================
create table if not exists app_site_members (
  user_id     uuid,
  site_id     uuid references sites(id),
  role        text check (role in ('admin', 'guard', 'kanri')),
  created_at  timestamptz default now(),
  primary key (user_id, site_id)
);
create index if not exists idx_app_site_members_site on app_site_members(site_id);

-- =====================================================================
-- 4) daily_reports : 日報本体
--    ※ 0100 が ADD COLUMN IF NOT EXISTS で足す列
--      (input_source / template_id / quick_preset_id / draft_payload / legacy_extras)
--      は衝突回避のため本ファイルでは作らない。
-- =====================================================================
create table if not exists daily_reports (
  id            uuid primary key default gen_random_uuid(),
  site_id       uuid references sites(id),
  reporter_id   uuid,                                 -- staff.id / auth.users.id への緩い参照(仮定)
  report_date   date,
  status        text,                                 -- 下書き / 提出済 / 承認済 / 差し戻し
  values        jsonb default '{}'::jsonb,            -- section.id -> (field.key -> value)
  submitted_at  timestamptz,
  approved_at   timestamptz,
  approver_id   uuid,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);
create index if not exists idx_daily_reports_site_date on daily_reports(site_id, report_date);

-- =====================================================================
-- 5) shifts : 勤務表(スタッフ×日付の勤務区分)
--    ※ 0102 が ADD COLUMN IF NOT EXISTS で足す列
--      (work_type / cell_source / legacy_extras) は衝突回避のため本ファイルでは作らない。
-- =====================================================================
create table if not exists shifts (
  id          uuid primary key default gen_random_uuid(),
  site_id     uuid references sites(id),
  staff_id    uuid references staff(id),
  work_date   date,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);
create index if not exists idx_shifts_site_date on shifts(site_id, work_date);
create index if not exists idx_shifts_staff_date on shifts(staff_id, work_date);

-- 注: report_templates / report_drafts / shift_constraints / staff_qualifications /
--     shift_preferences / shift_optimization_* / shift_overrides / notifications /
--     notification_targets / notification_confirmations / training_records /
--     template_section_configs は 0100/0102/0103 が CREATE TABLE IF NOT EXISTS で
--     作成するため、本ベースでは二重作成しない。
