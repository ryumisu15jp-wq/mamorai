-- [REQ-007] 追加のみマイグレーション（additive-only / 破壊的変更なし）
-- 方針: spec/database-design.md（§0 additive-only, NFR-01 / ADR-006）に整合。
--   許可する操作: 冪等な新規テーブル生成 / NULL許容の列追加 / 冪等なインデックス生成 のみ。
--   禁止する操作: 破壊的DDL（削除・改名・型変更・既存列の必須化）は本ファイルに一切含めない。
--
-- 注意: 既存25テーブル（sites / staff / daily_reports 等）の完全なDDLは未提供であり、
--       ここでの参照・拡張対象は「モックアップ(全11画面v2)とREQからの推定(想定)」である（OQ-DB1）。
--       既存テーブルの定義・既存RLSには一切触れず、NULL許容の追加列と新規テーブルのみを足す。

-- =====================================================================
-- 1) 既存 daily_reports への追加列（想定・全て NULL 許容・冪等）
--    1分日報・下書き・テンプレート参照・後方互換の保管領域を支える。
--    REQ-002 / REQ-003 / REQ-004 / REQ-005 / REQ-007
-- =====================================================================
alter table if exists daily_reports add column if not exists input_source   text;
alter table if exists daily_reports add column if not exists template_id     uuid;
alter table if exists daily_reports add column if not exists quick_preset_id uuid;
alter table if exists daily_reports add column if not exists draft_payload   jsonb;
alter table if exists daily_reports add column if not exists legacy_extras   jsonb;

-- =====================================================================
-- 2) 新規テーブル: 日報テンプレート（5型セクション構成）
--    REQ-002 / REQ-024
-- =====================================================================
create table if not exists report_templates (
  id          uuid primary key default gen_random_uuid(),
  site_id     uuid,                 -- 現場スコープ（sites.id への参照は仮定・FKは張らない=追加のみ安全側）
  name        text,
  is_active   boolean default true,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

create table if not exists report_template_sections (
  id            uuid primary key default gen_random_uuid(),
  template_id   uuid references report_templates(id) on delete cascade,
  section_key   text,
  kind          text,               -- meta / table / counter / check / gate
  label         text,
  sort_order    integer default 0,
  enabled       boolean default true,
  config        jsonb default '{}'::jsonb,
  created_at    timestamptz default now()
);

create index if not exists idx_report_template_sections_tpl
  on report_template_sections(template_id, sort_order);

-- =====================================================================
-- 3) 新規テーブル: 日報下書き（部分入力可・未充足許容）
--    REQ-005
-- =====================================================================
create table if not exists report_drafts (
  id            uuid primary key default gen_random_uuid(),
  site_id       uuid,
  author_id     uuid,
  report_id     uuid,               -- 既存 daily_reports.id への緩い参照（仮定・FKは張らない）
  template_id   uuid references report_templates(id) on delete set null,
  target_date   date,
  draft_payload jsonb default '{}'::jsonb,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

create index if not exists idx_report_drafts_payload_gin
  on report_drafts using gin (draft_payload);
