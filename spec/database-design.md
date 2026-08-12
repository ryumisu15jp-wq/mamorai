# データベース設計書 — MAMOR-AI（再開発 / 追加のみ・破壊的変更なし）

**作成:** Database Engineer (#08) / 開発本部　**作成日:** 2026-08-10　**版:** v1.1（Spec-Validator CONDITIONAL 是正）
**参照:** spec/architecture.md（ADR-001〜007、特に「Database Engineerへの申し送り事項」）、spec/behavioral-spec.md（REQ-001〜025 / NFR-01〜04）
**対象:** TRAIDパイプライン Phase 1b-db（追加スキーマ設計）

---

## 0. 設計方針と絶対制約

本設計は **additive-only（追加のみ）** を絶対原則とする（NFR-01 / REQ-007 / ADR-006）。

- 既存25テーブルへの拡張は **NULL許容の追加列** または **新規追加テーブル** のみ。
- **DROP COLUMN / ALTER TYPE / RENAME / 既存列へのNOT NULL・非互換制約追加は一切行わない。**
- 集計・整形は **追加ビュー / RPC** で表現し、既存テーブル定義には触れない。
- 新規追加テーブルは全て `site_id`（現場スコープ）を必須に持ち、RLSで「担当外現場が見えない」を保証（NFR-03 / ADR-002）。
- 既存テーブルへの追加列は `ADD COLUMN IF NOT EXISTS ... NULL` で冪等かつ安全に付与（既存スキーマ未確認のため列名衝突を回避）。

### 0.1 既存スキーマの扱い（想定・Open Question）

**重要:** 既存25テーブルの完全なDDLは未提供である（OQ-05 / OQ-06）。本書では既存テーブルを **モックアップ（全11画面 v2）とREQから推定した"想定"** として明示し、それらへの外部キー参照は **仮定** として注記する。確定的に設計するのは **新規追加分のみ** である。

想定される既存テーブル（名称・役割は推定。実物確認は Open Question OQ-DB1）:

| 想定テーブル | 推定役割 | 関連REQ | 本書での参照 |
|---|---|---|---|
| `sites` | 現場（拠点）マスタ | REQ-016/017/022 | 全新規テーブルの `site_id` FK先（仮定） |
| `staff` | 隊員・管制員マスタ（`auth.users`と1:1想定） | REQ-016/023 | `staff_id` FK先（仮定） |
| `daily_reports` | 日報本体 | REQ-004〜009 | 追加列で拡張（想定） |
| `report_items` / `report_values` | 日報のセクション/項目値 | REQ-002/010 | 参照のみ（触れない） |
| `shifts` | 勤務表（スタッフ×日付の勤務区分） | REQ-016 | 参照のみ（触れない） |
| `assignments` | 日次配置表（ポジション割当） | REQ-017 | 参照のみ（触れない） |
| `notifications` | 通知・業務指示 | REQ-022 | 追加列で拡張（想定） |
| `training_records` | 教育記録 | REQ-023 | 追加列で拡張（想定） |
| `qualifications` | 資格マスタ（想定・無い場合あり） | REQ-023 | 無ければ新規 `staff_qualifications` で補完 |
| `risk_predictions` | 既存Claude予測ログ（想定・無い場合あり） | REQ-014/015 | 無ければ新規 `risk_prediction_cache` で補完 |

> **想定であることの明記:** 上表の `daily_reports` / `notifications` / `training_records` への追加列は、当該テーブルおよび列が実在する前提の設計である。実DDL確認（OQ-DB1）で名称が異なる場合は、追加列の対象テーブル名のみを差し替える（追加のみ方針は不変）。FK参照先（`sites.id` / `staff.id` / `auth.users.id`）はいずれも **仮定** であり、実スキーマ確認後に確定する。RLSの現場判定は後述の `app_user_site_ids()` 一関数に隔離し、実メンバーシップテーブル判明時にそこだけ差し替え可能にしている。

---

## 1. テーブル一覧

### 1.1 新規追加テーブル（確定設計分）

| 新規テーブル | 役割 | 対応REQ | マイグレーション |
|---|---|---|---|
| `report_templates` | 現場別の日報テンプレート（5型セクション構成のヘッダ） | REQ-002, REQ-024 | 0101 |
| `report_template_sections` | テンプレのセクション定義（型・順序・ON/OFF） | REQ-002, REQ-024 | 0101 |
| `report_option_masters` | 定型選択肢マスタ（select/check の選択肢集合） | REQ-002, REQ-004 | 0101 |
| `report_quick_presets` | クイック入力プリセット（プリフィル既定値・1分日報） | REQ-003, REQ-004 | 0101 |
| `report_drafts` | 日報下書き（`draft_payload jsonb`・部分入力可） | REQ-005 | 0101 |
| `report_status_history` | 提出・承認・差し戻しの状態遷移履歴（承認者・時刻） | REQ-008 | 0101 |
| `shift_optimization_runs` | AIシフト最適化ジョブ（対象期間・状態・要求者） | REQ-018, REQ-019 | 0102 |
| `shift_optimization_constraints` | 構造化制約（有資格/勤務間隔/希望休/必要人数、ハード/ソフト） | REQ-018 | 0102 |
| `staff_qualifications` | スタッフ資格・有効期限（最適化制約＋更新間近判定の両用） | REQ-018, REQ-019, REQ-023 | 0102 |
| `shift_preferences` | 希望休・勤務希望（隊員申請） | REQ-018 | 0102 |
| `site_position_requirements` | 現場ポジション別の必要人数（配置基準） | REQ-017, REQ-019 | 0102 |
| `shift_optimization_candidates` | 最適化結果の候補案（スコア・HITL確認状態・実運用反映状態） | REQ-019, REQ-020 | 0102 |
| `shift_candidate_assignments` | 候補案内の個別割当（＋配置理由の説明テキスト） | REQ-019, REQ-021 | 0102 |
| `shift_overrides` | **手動シフト編集の保存先＋確定AIシフトの反映先（実運用シフトの正）**（セル単位編集差分・由来manual/ai_apply） | REQ-016, REQ-020 | 0104 |
| `risk_prediction_cache` | 既存Claude予測結果のキャッシュ/永続化（課金・レイテンシ削減） | REQ-014, REQ-015 | 0102 |
| `notification_targets` | 通知の配信対象条件（全員/夜勤者/特定現場） | REQ-022 | 0102 |
| `notification_reads` | 通知の既読記録（未確認件数集計の分母） | REQ-022 | 0102 |

**新規テーブル数: 17**（v1.1で `shift_overrides` を追加＝HIGH-1/HIGH-3是正）

### 1.2 既存テーブルへの追加列（NULL許容・追加のみ）

| 対象（想定）既存テーブル | 追加列 | 型（NULL許容） | 役割 | 対応REQ |
|---|---|---|---|---|
| `daily_reports` | `input_source` | `text` NULL | 入力経路（`quick`/`manual`/`prefill`）識別 | REQ-004 |
| `daily_reports` | `template_id` | `uuid` NULL | 使用テンプレートへの参照（`report_templates`） | REQ-002 |
| `daily_reports` | `quick_preset_id` | `uuid` NULL | 使用したクイックプリセット（`report_quick_presets`） | REQ-003 |
| `daily_reports` | `draft_payload` | `jsonb` NULL | 提出時点の入力スナップショット（再開/監査用） | REQ-005 |
| `notifications` | `notification_type` | `text` NULL | 種別（重要事項/業務指示/本部通知） | REQ-022 |
| `notifications` | `target_condition` | `jsonb` NULL | 配信対象条件（役割/勤務種別/現場） | REQ-022 |
| `training_records` | `progress_hours` | `numeric` NULL | 研修進捗時間（例 32h） | REQ-023 |
| `training_records` | `required_hours` | `numeric` NULL | 法定必要時間（例 45h） | REQ-023 |

**既存拡張列数: 8**（いずれもNULL許容・`ADD COLUMN IF NOT EXISTS`）

> 承認ワークフロー（REQ-008）の履歴は既存 `daily_reports` に列を足さず、新規 `report_status_history` に外出しする。既存に `status` 列が既にある想定を尊重し、状態そのものは既存列を正とし、遷移履歴のみを追加テーブルで補う（列名衝突リスクを回避）。

---

## 2. `0101_add_lightweight_report.sql`（共通入力ロジック層 / 1分日報：追加のみ）

```sql
-- =====================================================================
-- 0101_add_lightweight_report.sql
-- 対応REQ: REQ-002/003/004/005/008/024, NFR-01/NFR-02
-- 後方互換宣言: 追加のみ(additive-only)。既存テーブルへはNULL許容列を
--   ADD COLUMN IF NOT EXISTS で付与。DROP/RENAME/ALTER TYPE/NOT NULL追加なし。
-- 対象(想定)既存テーブル: daily_reports(拡張列のみ)
-- =====================================================================

create extension if not exists "pgcrypto"; -- gen_random_uuid()

-- ---------------------------------------------------------------------
-- 日報テンプレート(現場別ヘッダ) REQ-002 / REQ-024
-- ---------------------------------------------------------------------
create table if not exists report_templates (
  id          uuid primary key default gen_random_uuid(),
  site_id     uuid not null,                 -- FK先 sites.id は仮定(OQ-DB1)
  name        text not null,
  description text,
  is_active   boolean not null default true,
  created_by  uuid,                          -- auth.users.id 仮定
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_report_templates_site
  on report_templates(site_id, is_active);

-- テンプレのセクション定義(5型: meta/table/counter/check/gate) REQ-002 / REQ-024
create table if not exists report_template_sections (
  id           uuid primary key default gen_random_uuid(),
  template_id  uuid not null references report_templates(id) on delete cascade,
  site_id      uuid not null,                -- RLS/索引用に非正規化保持
  section_key  text not null,                -- 論理キー(例 'patrol_counter')
  section_type text not null
                 check (section_type in ('meta','table','counter','check','gate')),
  label        text not null,
  sort_order   integer not null default 0,
  is_enabled   boolean not null default true, -- 現場ごとのON/OFF (REQ-024)
  config       jsonb,                         -- 型別の追加設定(項目定義等)
  created_at   timestamptz not null default now(),
  unique (template_id, section_key)
);
create index if not exists idx_rtsec_template
  on report_template_sections(template_id, sort_order);
create index if not exists idx_rtsec_site
  on report_template_sections(site_id);
create index if not exists idx_rtsec_config_gin
  on report_template_sections using gin (config);

-- 定型選択肢マスタ(select/check の選択肢) REQ-002 / REQ-004
create table if not exists report_option_masters (
  id          uuid primary key default gen_random_uuid(),
  site_id     uuid not null,
  option_set  text not null,                 -- 選択肢グループ名
  value       text not null,
  label       text not null,
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (site_id, option_set, value)
);
create index if not exists idx_option_master_lookup
  on report_option_masters(site_id, option_set, is_active);

-- クイック入力プリセット(プリフィル既定値・1分日報の核) REQ-003 / REQ-004
create table if not exists report_quick_presets (
  id            uuid primary key default gen_random_uuid(),
  site_id       uuid not null,
  template_id   uuid references report_templates(id) on delete set null,
  name          text not null,
  default_values jsonb not null default '{}'::jsonb, -- セクション別の既定値
  is_default    boolean not null default false,      -- 現場の既定プリセット
  created_by    uuid,
  created_at    timestamptz not null default now()
);
create index if not exists idx_quick_preset_site
  on report_quick_presets(site_id, is_default);
create index if not exists idx_quick_preset_values_gin
  on report_quick_presets using gin (default_values);

-- 日報下書き(部分入力可・再開用) REQ-005
create table if not exists report_drafts (
  id            uuid primary key default gen_random_uuid(),
  site_id       uuid not null,
  author_id     uuid not null,               -- auth.users.id 仮定
  report_id     uuid,                        -- 既存 daily_reports.id への緩い参照(仮定・FK張らず)
  target_date   date not null,
  template_id   uuid references report_templates(id) on delete set null,
  draft_payload jsonb not null default '{}'::jsonb, -- 未完成でも保存(必須未充足許容)
  updated_at    timestamptz not null default now(),
  created_at    timestamptz not null default now()
);
-- 1人1現場1日1下書きに正規化(再開時の一意特定)
create unique index if not exists uq_report_draft_owner_day
  on report_drafts(site_id, author_id, target_date);
create index if not exists idx_report_draft_payload_gin
  on report_drafts using gin (draft_payload);

-- 提出・承認・差し戻し履歴 REQ-008
create table if not exists report_status_history (
  id           uuid primary key default gen_random_uuid(),
  site_id      uuid not null,
  report_id    uuid not null,                -- 既存 daily_reports.id(仮定・FK張らず=追加のみ安全側)
  from_status  text,
  to_status    text not null
                 check (to_status in ('下書き','提出済','承認済','差し戻し')),
  actor_id     uuid not null,               -- 遷移操作者(承認者含む)
  reason       text,                         -- 差し戻し理由等
  created_at   timestamptz not null default now()
);
create index if not exists idx_status_hist_report
  on report_status_history(report_id, created_at);
create index if not exists idx_status_hist_site
  on report_status_history(site_id, to_status, created_at);

-- ---------------------------------------------------------------------
-- 既存 daily_reports への追加列(全てNULL許容・IF NOT EXISTS) REQ-004/003/005/002
-- 既存列は一切変更しない。列名衝突時はIF NOT EXISTSで無害にスキップ。
-- ---------------------------------------------------------------------
alter table daily_reports add column if not exists input_source    text;
alter table daily_reports add column if not exists template_id      uuid;
alter table daily_reports add column if not exists quick_preset_id  uuid;
alter table daily_reports add column if not exists draft_payload    jsonb;

-- 日報一覧/検索(REQ-009)・RLS絞り込み用の複合インデックス(既存列site_id/status/対象月/報告者を想定)
-- 既存列名が未確認のため、確認後に有効化(OQ-DB1)。雛形をコメントで提示:
-- create index if not exists idx_daily_reports_search
--   on daily_reports(site_id, report_month, status, reporter_id);
```

**ロールバック `0101_add_lightweight_report_down.sql`（追加のみ→drop で完全復元）:**

```sql
drop table if exists report_status_history;
drop table if exists report_drafts;
drop table if exists report_quick_presets;
drop table if exists report_option_masters;
drop table if exists report_template_sections;
drop table if exists report_templates;
alter table daily_reports drop column if exists draft_payload;
alter table daily_reports drop column if exists quick_preset_id;
alter table daily_reports drop column if exists template_id;
alter table daily_reports drop column if exists input_source;
```

---

## 3. `0102_add_shift_optimization.sql`（AIシフト最適化 + 予測キャッシュ + 通知/教育：追加のみ）

```sql
-- =====================================================================
-- 0102_add_shift_optimization.sql
-- 対応REQ: REQ-017/018/019/020/021(シフト最適化),
--          REQ-014/015(予測キャッシュ), REQ-022/023(通知・教育)
-- 後方互換宣言: 追加のみ。既存 shifts/assignments には触れない
--   (OQ-DB1確定まで追加テーブル前提, ADR-006/申し送り3)。
--   HITL(REQ-020)をDB CHECK制約でも二重化する。
-- =====================================================================

-- ---------------------------------------------------------------------
-- 最適化ジョブ REQ-018 / REQ-019
-- ---------------------------------------------------------------------
create table if not exists shift_optimization_runs (
  id             uuid primary key default gen_random_uuid(),
  site_id        uuid not null,
  period_start   date not null,
  period_end     date not null,
  status         text not null default 'pending'
                   check (status in
                     ('pending','structuring','optimizing','generated','failed')),
  raw_request    text,                        -- 管制員の自然言語要望(REQ-018入力)
  structured_at  timestamptz,
  failure_reason text,                        -- 充足不能/構造化失敗の理由(REQ-019)
  requested_by   uuid not null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (period_end >= period_start)
);
create index if not exists idx_opt_run_site_status
  on shift_optimization_runs(site_id, status, created_at desc);

-- 構造化制約(有資格/勤務間隔/希望休/必要人数、ハード/ソフト) REQ-018
create table if not exists shift_optimization_constraints (
  id              uuid primary key default gen_random_uuid(),
  run_id          uuid not null references shift_optimization_runs(id) on delete cascade,
  site_id         uuid not null,              -- RLS/索引用に非正規化
  constraint_type text not null
                    check (constraint_type in
                      ('qualification','rest_interval','day_off','required_headcount',
                       'max_consecutive','preference','other')),
  is_hard         boolean not null default true, -- ハード=充足必須 / ソフト=優先(OQ-03)
  payload         jsonb not null default '{}'::jsonb, -- 型別のパラメータ
  created_at      timestamptz not null default now()
);
create index if not exists idx_opt_constraint_run
  on shift_optimization_constraints(run_id, constraint_type);
create index if not exists idx_opt_constraint_site
  on shift_optimization_constraints(site_id);
create index if not exists idx_opt_constraint_payload_gin
  on shift_optimization_constraints using gin (payload);

-- スタッフ資格(最適化のqualification制約 + REQ-023 更新間近判定 の両用)
create table if not exists staff_qualifications (
  id                 uuid primary key default gen_random_uuid(),
  staff_id           uuid not null,           -- staff.id 仮定
  site_id            uuid not null,           -- 主担当現場(RLSスコープ)
  qualification_type text not null,           -- 例 '施設警備1級'
  acquired_on        date,
  expires_on         date,                    -- NULL=無期限
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists idx_staff_qual_staff
  on staff_qualifications(staff_id);
-- REQ-023 更新間近: 期限が設定された行のみを対象にした部分インデックス(範囲検索最適化)
create index if not exists idx_staff_qual_expiry
  on staff_qualifications(site_id, expires_on)
  where expires_on is not null;

-- 希望休・勤務希望 REQ-018
create table if not exists shift_preferences (
  id              uuid primary key default gen_random_uuid(),
  site_id         uuid not null,
  staff_id        uuid not null,
  preferred_date  date not null,
  preference_type text not null
                    check (preference_type in ('day_off','want_work','avoid_night','other')),
  priority        integer not null default 0, -- ソフト制約の重み
  note            text,
  created_at      timestamptz not null default now(),
  unique (site_id, staff_id, preferred_date, preference_type)
);
create index if not exists idx_shift_pref_lookup
  on shift_preferences(site_id, preferred_date);

-- 現場ポジション別の必要人数(配置基準) REQ-017 / REQ-019
create table if not exists site_position_requirements (
  id             uuid primary key default gen_random_uuid(),
  site_id        uuid not null,
  position       text not null,               -- 責任者/日勤A/日勤B/夜勤A/夜勤B 等
  shift_type     text not null,               -- 日勤/夜勤 等
  required_count integer not null default 1,
  qualification_required text,                -- 有資格要件(任意)
  created_at     timestamptz not null default now(),
  unique (site_id, position, shift_type)
);
create index if not exists idx_pos_req_site
  on site_position_requirements(site_id);

-- 最適化結果の候補案 + HITL確認状態 REQ-019 / REQ-020
create table if not exists shift_optimization_candidates (
  id             uuid primary key default gen_random_uuid(),
  run_id         uuid not null references shift_optimization_runs(id) on delete cascade,
  site_id        uuid not null,
  candidate_no   integer not null,
  score          numeric,                     -- ソフト制約充足度(高いほど良)
  review_status  text not null default 'draft'
                   check (review_status in ('draft','reviewing','confirmed')),
  confirmed_flag boolean not null default false, -- 管制員の明示確認フラグ(REQ-020)
  confirmed_by   uuid,
  confirmed_at   timestamptz,
  created_at     timestamptz not null default now(),
  unique (run_id, candidate_no),
  -- HITLのDB層二重化(ADR-005/申し送り3): confirmed には確認フラグ+確認者+時刻が必須。
  -- 確認操作を経ずに status='confirmed' へ遷移することをDBが拒否する(REQ-020のSHALL NOT)。
  constraint chk_hitl_confirm check (
    review_status <> 'confirmed'
    or (confirmed_flag = true and confirmed_by is not null and confirmed_at is not null)
  )
);
-- 1 run につき確定候補は最大1件(誤って複数確定を防ぐ)
create unique index if not exists uq_one_confirmed_per_run
  on shift_optimization_candidates(run_id)
  where review_status = 'confirmed';
create index if not exists idx_opt_cand_run
  on shift_optimization_candidates(run_id, review_status);
create index if not exists idx_opt_cand_site
  on shift_optimization_candidates(site_id, review_status);

-- 候補案内の個別割当 + 配置理由の説明 REQ-019 / REQ-021
create table if not exists shift_candidate_assignments (
  id            uuid primary key default gen_random_uuid(),
  candidate_id  uuid not null references shift_optimization_candidates(id) on delete cascade,
  site_id       uuid not null,
  staff_id      uuid not null,
  work_date     date not null,
  position      text,
  shift_type    text,
  explanation   text,                          -- 「なぜこの配置か」(REQ-021、説明が無い割当を作らない)
  created_at    timestamptz not null default now()
);
create index if not exists idx_cand_assign_candidate
  on shift_candidate_assignments(candidate_id, work_date);
create index if not exists idx_cand_assign_staff
  on shift_candidate_assignments(staff_id, work_date);
create index if not exists idx_cand_assign_site
  on shift_candidate_assignments(site_id);

-- ---------------------------------------------------------------------
-- 既存Claude予測のキャッシュ/永続化(課金・レイテンシ削減) REQ-014 / REQ-015
--  ・既存予測エンジンI/F(OQ-05)確定後にpayloadスキーマを固定
--  ・既存 risk_predictions が実在する場合は本表を使わずそちらを参照(重複回避)
-- ---------------------------------------------------------------------
create table if not exists risk_prediction_cache (
  id           uuid primary key default gen_random_uuid(),
  site_id      uuid not null,
  target_date  date not null,
  predicted_at timestamptz not null default now(),
  payload      jsonb not null,   -- 種別/ポジション/リスク度/発生確率/要因タグ(REQ-014)
  source       text,             -- 予測エンジンのバージョン/モデル識別
  created_at   timestamptz not null default now()
);
-- 同一現場・同日は最新1件を素早く引く
create index if not exists idx_risk_cache_lookup
  on risk_prediction_cache(site_id, target_date, predicted_at desc);
create index if not exists idx_risk_cache_payload_gin
  on risk_prediction_cache using gin (payload);

-- ---------------------------------------------------------------------
-- 通知・教育記録(最小追加) REQ-022 / REQ-023
-- ---------------------------------------------------------------------
-- 配信対象条件 REQ-022
create table if not exists notification_targets (
  id              uuid primary key default gen_random_uuid(),
  notification_id uuid not null,   -- 既存 notifications.id(仮定・FK張らず=追加のみ安全側)
  site_id         uuid not null,
  target_kind     text not null
                    check (target_kind in ('all','night_shift','site','role','staff')),
  target_value    text,            -- role名/staff_id/現場等
  created_at      timestamptz not null default now()
);
create index if not exists idx_notif_target_notif
  on notification_targets(notification_id);
create index if not exists idx_notif_target_site
  on notification_targets(site_id, target_kind);

-- 既読(未確認件数集計の分母) REQ-022
create table if not exists notification_reads (
  id              uuid primary key default gen_random_uuid(),
  notification_id uuid not null,
  site_id         uuid not null,
  user_id         uuid not null,
  read_at         timestamptz not null default now(),
  unique (notification_id, user_id)
);
create index if not exists idx_notif_read_user
  on notification_reads(user_id, notification_id);

-- 既存 notifications / training_records への追加列(NULL許容・IF NOT EXISTS)
alter table notifications   add column if not exists notification_type text;
alter table notifications   add column if not exists target_condition  jsonb;
alter table training_records add column if not exists progress_hours    numeric;
alter table training_records add column if not exists required_hours    numeric;
```

**ロールバック `0102_add_shift_optimization_down.sql`:**

```sql
alter table training_records drop column if exists required_hours;
alter table training_records drop column if exists progress_hours;
alter table notifications    drop column if exists target_condition;
alter table notifications    drop column if exists notification_type;
drop table if exists notification_reads;
drop table if exists notification_targets;
drop table if exists risk_prediction_cache;
drop table if exists shift_candidate_assignments;
drop table if exists shift_optimization_candidates;
drop table if exists site_position_requirements;
drop table if exists shift_preferences;
drop table if exists staff_qualifications;
drop table if exists shift_optimization_constraints;
drop table if exists shift_optimization_runs;
```

---

## 3.5 `0104_add_shift_overrides.sql`（手動シフト編集の保存先 + 確定AIシフトの実運用反映：追加のみ）【v1.1新規 / HIGH-1・HIGH-3】

**背景（HIGH-1 / HIGH-3）:** REQ-016の「セル単位の手動編集を保存」する永続化先が旧v1.0に存在せず（既存 `shifts` は参照のみ）、また HITL確定（REQ-020）した候補（`shift_candidate_assignments`）が実運用シフトへ反映される経路も無かった。本マイグレーションは **実運用シフトの正（source of truth）となる追加テーブル `shift_overrides`** を新設し、手動編集とAI反映の両方を **単一の永続化モデルに一本化** する。これにより既存 `shifts` に一切触れずに（追加のみ）手動編集の保存とAIシフトの反映を実現する。実運用への反映フローの工程・冪等性は architecture.md **ADR-008** を正とする。

> **注記（実DDL判明時に見直す）:** 既存 `shifts` の実DDL（OQ-DB1）が提供された場合、`shift_overrides` を廃して既存 `shifts` への追加列（NULL許容）＋反映で載せられるか（追加のみで整合するか）を再判定する。それまでは追加テーブル前提（ADR-006 / 申し送り3）。

```sql
-- =====================================================================
-- 0104_add_shift_overrides.sql
-- 対応REQ: REQ-016(手動シフト編集の保存), REQ-020(確定AI下案の実運用反映)
-- 参照: architecture.md ADR-008(確定シフト→実運用 write-back フロー)
-- 後方互換宣言: 追加のみ。既存 shifts/assignments には触れない。
--   shift_optimization_candidates(0102で新設)へは NULL許容列を追加するのみ。
-- 適用順: 0102(候補テーブル) → 0103(RLS) の後に適用（本ファイルは自前でRLSも付与）。
-- =====================================================================

-- ---------------------------------------------------------------------
-- 実運用シフトの正: 手動編集差分 + 確定AIシフトの反映先 REQ-016 / REQ-020
--   ・source='manual' : 管制員/現場担当のセル単位編集（クライアント直結で書込可）
--   ・source='ai_apply': ADR-008の反映処理がNode(service_role)経由で書込む確定AI割当
--   ・(site_id, staff_id, work_date) 一意 = 同一セルは1行にupsert（反映の冪等性を担保）
-- ---------------------------------------------------------------------
create table if not exists shift_overrides (
  id            uuid primary key default gen_random_uuid(),
  site_id       uuid not null,
  staff_id      uuid not null,
  work_date     date not null,
  shift_code    text not null,                 -- 日勤/夜勤/明休/公休/研修 等の勤務区分
  position      text,                          -- 配置ポジション(任意)
  source        text not null default 'manual'
                  check (source in ('manual','ai_apply')),
  candidate_id  uuid references shift_optimization_candidates(id) on delete set null, -- ai_apply時の由来(反映元)
  run_id        uuid references shift_optimization_runs(id) on delete set null,       -- 反映元run(監査/再実行判定用)
  edited_by     uuid not null,                 -- 編集者(manual) / 反映実行者(ai_apply)
  note          text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- 1セル(現場×スタッフ×日)は1行に正規化。再反映・再編集はUPDATE(upsert)で冪等。
  unique (site_id, staff_id, work_date)
);
create index if not exists idx_shift_override_site_date
  on shift_overrides(site_id, work_date);
create index if not exists idx_shift_override_staff_date
  on shift_overrides(staff_id, work_date);
create index if not exists idx_shift_override_candidate
  on shift_overrides(candidate_id) where candidate_id is not null;

-- ---------------------------------------------------------------------
-- HIGH-3: 候補の実運用反映ステータス（NULL許容の追加列・candidatesは0102新設テーブル）
--   confirmed(HITL確定) → applied(実運用へ反映済) の工程をDBで追跡（ADR-008）。
-- ---------------------------------------------------------------------
alter table shift_optimization_candidates
  add column if not exists applied_status text
    check (applied_status is null or applied_status in ('applied','superseded'));
alter table shift_optimization_candidates
  add column if not exists applied_at timestamptz;
alter table shift_optimization_candidates
  add column if not exists applied_by uuid;

-- ---------------------------------------------------------------------
-- shift_overrides の RLS（本テーブルは"本人・現場担当が書く"側 = 書込許可）
--   ・SELECT/UPDATE/DELETE: 担当現場のみ
--   ・INSERT/UPDATE: クライアントは source='manual' のみ許可（ai_applyの偽装を防止）
--   ・source='ai_apply' の書込は service_role(RLSバイパス, ADR-008の反映処理)に限定
-- ---------------------------------------------------------------------
alter table shift_overrides enable row level security;
alter table shift_overrides force row level security;

create policy shift_overrides_sel on shift_overrides for select
  using (site_id in (select app_user_site_ids()));

create policy shift_overrides_ins on shift_overrides for insert
  with check (
    site_id in (select app_user_site_ids())
    and source = 'manual'                       -- クライアントはai_applyをINSERTできない
    and edited_by = auth.uid()
  );

create policy shift_overrides_upd on shift_overrides for update
  using (site_id in (select app_user_site_ids()))
  with check (
    site_id in (select app_user_site_ids())
    and source = 'manual'                       -- クライアントの更新結果もmanualに限定
  );

create policy shift_overrides_del on shift_overrides for delete
  using (site_id in (select app_user_site_ids()));
```

**ロールバック `0104_add_shift_overrides_down.sql`:**

```sql
drop policy if exists shift_overrides_del on shift_overrides;
drop policy if exists shift_overrides_upd on shift_overrides;
drop policy if exists shift_overrides_ins on shift_overrides;
drop policy if exists shift_overrides_sel on shift_overrides;
alter table shift_optimization_candidates drop column if exists applied_by;
alter table shift_optimization_candidates drop column if exists applied_at;
alter table shift_optimization_candidates drop column if exists applied_status;
drop table if exists shift_overrides;
```

---

## 4. `0103_rls_additions.sql`（新規テーブルへの site_id 軸 RLS：追加のみ）

新規テーブル **のみ** にRLSを付与する。**既存テーブルのRLSは一切変更しない**（追加した列 `input_source` 等は既存テーブルの既存RLSポリシーの配下でそのまま保護される。列追加はポリシー範囲を広げないため後方互換）。

現場スコープ判定は **単一のヘルパー関数 `app_user_site_ids()` に隔離** する。これにより実メンバーシップテーブル（OQ-DB1）が判明した時点で **この関数1つの差し替えのみ** で全ポリシーが正しく動く。

**【v1.1 HIGH-2 是正：テーブル種別ごとの最小権限化】** 新規テーブルを書込主体で2群に分離する。

- **群A：本人・現場担当が書くテーブル（クライアント書込＝INSERT/UPDATE/DELETE を許可）** — 日報テンプレ/下書き/希望休/資格/配置基準/通知既読 等。担当現場スコープでCRUDを付与する。
- **群B：サーバ（service_role / Node経由）でのみ書込むべきテーブル（クライアントは SELECT のみ）** — `shift_optimization_runs` / `shift_optimization_constraints` / `shift_optimization_candidates` / `shift_candidate_assignments` / `risk_prediction_cache`。これらはADR-002/003で「Node(service_role)が書込、フロントはSELECTのみ」の想定であり、旧v1.0の一括ループが付与していた authenticated の INSERT/UPDATE/DELETE を **剥奪**する。これにより (a) 担当現場内の悪意あるクライアントが `confirmed_flag/by/at` を自前で立て `chk_hitl_confirm` を満たして **Nodeオーケストレーションを経ずシフトを自己確定** する穴、(b) `risk_prediction_cache` の予測キャッシュ汚染、を塞ぐ。HITL確定・最適化結果の書込・予測キャッシュ更新は **service_role（RLSバイパス）を持つ Node/Express の専用RPC/エンドポイント経由に限定**する（ADR-005/ADR-008、Security Engineer #14 の必須確認事項）。

> **注記（実DDL判明時に見直す）:** 群A/群Bの分類と `app_user_site_ids()` の実装は既存メンバーシップテーブル（OQ-DB1）確定後に実名で再検証する。特にOQ-DB3（役割 admin/guard 別の書込差）が判明した場合、群Aの書込をさらに役割別に精緻化する。

```sql
-- =====================================================================
-- 0103_rls_additions.sql
-- 対応: NFR-03, ADR-002/006, 申し送り事項2(担当外site_idのクロスアクセス拒否)
-- 既存テーブルのRLSは変更しない(追加のみ)。
-- =====================================================================

-- ---------------------------------------------------------------------
-- 現場メンバーシップ解決ヘルパー(唯一の"想定"隔離点)
--   ※ 実メンバーシップテーブルは未確認(OQ-DB1)。ここでは想定テーブル
--     user_site_roles(user_id, site_id) を参照。実物判明後は本関数のみ差し替え。
-- ---------------------------------------------------------------------
create or replace function app_user_site_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select site_id from user_site_roles where user_id = auth.uid()
$$;

-- ---------------------------------------------------------------------
-- 群A: 本人・現場担当が書くテーブル（担当現場スコープで SELECT/INSERT/UPDATE/DELETE 付与）
--   ※ v1.1(HIGH-2)で AI経路テーブル(群B)を本ループから除外した。
--   担当外 site_id は SELECT/INSERT/UPDATE/DELETE いずれも不可。
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'report_templates','report_template_sections','report_option_masters',
    'report_quick_presets','report_drafts','report_status_history',
    'staff_qualifications','shift_preferences','site_position_requirements',
    'notification_targets','notification_reads'
  ]
  loop
    execute format('alter table %I enable row level security;', t);
    execute format('alter table %I force row level security;', t);
    -- SELECT: 担当現場のみ
    execute format($f$
      create policy %1$s_sel on %1$I for select
        using (site_id in (select app_user_site_ids()));
    $f$, t);
    -- INSERT: 担当現場のみ
    execute format($f$
      create policy %1$s_ins on %1$I for insert
        with check (site_id in (select app_user_site_ids()));
    $f$, t);
    -- UPDATE: 担当現場のみ(遷移前後どちらも担当現場に限定)
    execute format($f$
      create policy %1$s_upd on %1$I for update
        using (site_id in (select app_user_site_ids()))
        with check (site_id in (select app_user_site_ids()));
    $f$, t);
    -- DELETE: 担当現場のみ
    execute format($f$
      create policy %1$s_del on %1$I for delete
        using (site_id in (select app_user_site_ids()));
    $f$, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 群B: サーバ(service_role/Node経由)でのみ書込むべきテーブル【v1.1 HIGH-2】
--   AIシフト最適化(run/constraints/candidates/assignments)・予測キャッシュは
--   フロントを SELECT のみに制限。INSERT/UPDATE/DELETE ポリシーを一切作らない
--   = authenticated(anonキー)からの書込は全拒否。書込は service_role(RLSバイパス)
--   を持つ Node/Express の専用エンドポイント/RPC に限定する(ADR-002/003/005/008)。
--   これにより「クライアントによるシフト自己確定・予測キャッシュ汚染」を構造的に排除。
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'shift_optimization_runs','shift_optimization_constraints',
    'shift_optimization_candidates','shift_candidate_assignments',
    'risk_prediction_cache'
  ]
  loop
    execute format('alter table %I enable row level security;', t);
    execute format('alter table %I force row level security;', t);
    -- SELECT: 担当現場のみ（閲覧は許可＝管制員が下案・予測を確認できる）
    execute format($f$
      create policy %1$s_sel on %1$I for select
        using (site_id in (select app_user_site_ids()));
    $f$, t);
    -- INSERT/UPDATE/DELETE ポリシーは意図的に作成しない（＝authenticatedは書込不可）。
    -- 書込は service_role がRLSをバイパスして行う（Node経由のみ）。
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 追記型ログの追加強化(REQ-008履歴・HITL監査): 履歴系はUPDATE/DELETEを剥奪
--   report_status_history は「遷移の事実」を改ざん不可にする(監査要件)。
--   上のループで作成したUPD/DELポリシーを削除 = 当該操作は全拒否になる。
-- ---------------------------------------------------------------------
drop policy if exists report_status_history_upd on report_status_history;
drop policy if exists report_status_history_del on report_status_history;

-- notification_reads は本人の既読のみINSERT可能に厳格化(誤配信既読の防止)
drop policy if exists notification_reads_ins on notification_reads;
create policy notification_reads_ins on notification_reads for insert
  with check (
    site_id in (select app_user_site_ids())
    and user_id = auth.uid()
  );
```

> **注記（新規列に関わる注意点）:** 既存 `daily_reports` / `notifications` / `training_records` に追加した列は、既存テーブルの既存RLSがそのまま適用される。新規列の値が担当外現場のデータを露出させることはない（`draft_payload`/`target_condition` 等のjsonbに他現場データを混在させない運用をGeneratorに徹底）。`risk_prediction_cache` は Node/Express（service_role）が書き込み、フロントは直結SELECTのみ（RLSで担当現場に限定）。

**ロールバック `0103_rls_additions_down.sql`:**

```sql
-- 各新規テーブルの enable/force RLS 解除 + policy drop（16テーブル分。ループで剥奪）
do $$
declare t text;
begin
  foreach t in array array[
    'report_templates','report_template_sections','report_option_masters',
    'report_quick_presets','report_drafts','report_status_history',
    'shift_optimization_runs','shift_optimization_constraints',
    'staff_qualifications','shift_preferences','site_position_requirements',
    'shift_optimization_candidates','shift_candidate_assignments',
    'risk_prediction_cache','notification_targets','notification_reads'
  ] loop
    execute format('drop policy if exists %1$s_sel on %1$I;', t);
    execute format('drop policy if exists %1$s_ins on %1$I;', t);
    execute format('drop policy if exists %1$s_upd on %1$I;', t);
    execute format('drop policy if exists %1$s_del on %1$I;', t);
    execute format('alter table %I disable row level security;', t);
  end loop;
end $$;
drop function if exists app_user_site_ids();
```

---

## 4.5 `0105_add_monthly_report_view.sql`（月報集計ビュー：追加のみ）【v1.1新規 / MEDIUM-1】

**背景（MEDIUM-1）:** REQ-010〜012が依存する `v_monthly_report_summary` が旧v1.0では「別マイグレーションで用意」と参照されるのみで実体が無かった。集計基盤の空白を埋めるため、**追加ビュー**として本マイグレーションで提供する（既存テーブルには一切触れない＝追加のみ）。ビューはRLS対象テーブル（`daily_reports` の既存RLS、`report_status_history`）を参照するため、閲覧者の現場スコープは基礎テーブルのRLSがそのまま継承される（`security_invoker=on`）。

> **注記（実DDL判明時に見直す）:** 下記は既存 `daily_reports` の列（`site_id` / 対象月列 / `status` / `reporter_id` 等）を **仮定**したドラフトである。実DDL（OQ-DB1）確定後に実列名へ置換して確定する。承認率の分母（OQ-04 / UQ-06）確定までは「提出済に対する承認済」を暫定定義とし、確定後に式を差し替える。列名未確定の間は本ファイルを **保留（Sprint2着手時に有効化）** とし、REQ-010〜012のテストはinput-core側の純粋関数集計で先行検証する。

```sql
-- =====================================================================
-- 0105_add_monthly_report_view.sql
-- 対応REQ: REQ-010(counter集計)/REQ-011(サマリー)/REQ-012(内訳・日別推移)
-- 後方互換宣言: 追加のみ（CREATE VIEW のみ。既存テーブル定義に触れない）。
-- 前提: 列名は仮定(OQ-DB1)。承認率分母は暫定=提出済(OQ-04で確定)。
-- =====================================================================

-- security_invoker=on: ビュー参照時も呼出ユーザーのRLSを適用（現場スコープ継承）
create or replace view v_monthly_report_summary
  with (security_invoker = on) as
select
  dr.site_id,
  date_trunc('month', dr.report_date)::date       as report_month, -- 実列名は要確認(OQ-DB1)
  count(*) filter (where dr.status = '提出済'
                      or dr.status = '承認済')      as reported_days,      -- 報告日数
  count(*) filter (where dr.status = '承認済')      as approved_count,     -- 承認済件数
  count(*) filter (where dr.status = '提出済'
                      or dr.status = '承認済')      as submitted_count,    -- 承認率の分母(暫定)
  round(
    count(*) filter (where dr.status = '承認済')::numeric
    / nullif(count(*) filter (where dr.status = '提出済'
                                 or dr.status = '承認済'), 0)
  , 3)                                             as approval_rate       -- 承認率(暫定=承認済/提出+承認)
from daily_reports dr
group by dr.site_id, date_trunc('month', dr.report_date);

-- 日別推移(REQ-012)。対応件数(counter)合計・インシデントは、テンプレ差異を吸収する
-- 必要があるため input-core 集計 or 別RPC で補完（本ビューは日数/承認率の骨格を提供）。
create or replace view v_daily_report_trend
  with (security_invoker = on) as
select
  dr.site_id,
  dr.report_date,
  count(*)                                         as report_count
from daily_reports dr
group by dr.site_id, dr.report_date;
```

**ロールバック `0105_add_monthly_report_view_down.sql`:**

```sql
drop view if exists v_daily_report_trend;
drop view if exists v_monthly_report_summary;
```

> counter項目別合算（REQ-010）とインシデント種別内訳（REQ-012）は、テンプレートのON/OFF差異（REQ-024）を吸収する必要があり、SQLの静的ビューよりも `packages/input-core/report/aggregate.ts`（純粋関数）＋必要に応じRPCで表現する方が堅い。本ビューは「報告日数・承認率・日別件数」という **テンプレ非依存の骨格集計** を担い、項目別集計はアプリ層に委ねる二層構成とする（N+1回避は §6.1）。

---

## 5. クロスユーザーRLS検証テスト（pgTAP形式）

担当外 `site_id` に対する SELECT/INSERT が拒否されること、HITL（REQ-020）がDB層でも守られることを検証する。

```sql
-- ============================================================
-- rls_cross_user.test.sql (pgTAP)
-- 前提シード:
--   user_a = site_1 の担当 / user_b = site_2 の担当
--   (user_site_roles に登録済み。app_user_site_ids() がこれを解決)
-- 実行は各ユーザーJWTに擬した set_config('request.jwt.claims',...) or
--   set local role authenticated + set request.jwt.claim.sub で行う。
-- ============================================================
begin;
select plan(8);

-- user_a に成り代わる
select set_config('request.jwt.claims',
  json_build_object('sub','user_a_uuid','role','authenticated')::text, true);

-- (1) 担当外 site_2 の shift_optimization_runs は 0 件に見える(SELECT拒否)
select is(
  (select count(*) from shift_optimization_runs where site_id = 'site_2_uuid'),
  0::bigint,
  'user_a は担当外 site_2 の最適化ジョブを閲覧できない'
);

-- (2) 担当外 site_2 への report_drafts INSERT は RLS 違反で失敗
select throws_ok(
  $$ insert into report_drafts (site_id, author_id, target_date, draft_payload)
     values ('site_2_uuid','user_a_uuid', current_date, '{}'::jsonb) $$,
  '42501',  -- insufficient_privilege / RLS違反
  null,
  'user_a は担当外 site_2 に下書きをINSERTできない'
);

-- (3) 担当 site_1 への report_drafts INSERT は成功する(正常系)
select lives_ok(
  $$ insert into report_drafts (site_id, author_id, target_date, draft_payload)
     values ('site_1_uuid','user_a_uuid', current_date, '{}'::jsonb) $$,
  'user_a は担当 site_1 に下書きをINSERTできる'
);

-- (4) 担当外 site_2 の staff_qualifications は見えない
select is(
  (select count(*) from staff_qualifications where site_id = 'site_2_uuid'),
  0::bigint,
  'user_a は担当外 site_2 の資格情報を閲覧できない'
);

-- (5) HITL(REQ-020): confirmed_flag無しで review_status='confirmed' は CHECK違反
select throws_ok(
  $$ update shift_optimization_candidates
       set review_status = 'confirmed'
     where site_id = 'site_1_uuid' and run_id = 'run_1_uuid' and candidate_no = 1 $$,
  '23514',  -- check_violation (chk_hitl_confirm)
  null,
  '確認フラグ無しでのシフト確定はDB制約で拒否される'
);

-- (6) HITL 正常系: フラグ+確認者+時刻を伴う確定は成功する
select lives_ok(
  $$ update shift_optimization_candidates
       set review_status='confirmed', confirmed_flag=true,
           confirmed_by='user_a_uuid', confirmed_at=now()
     where site_id='site_1_uuid' and run_id='run_1_uuid' and candidate_no=1 $$,
  '管制員確認を伴うシフト確定は許可される'
);

-- (7) HIGH-2: 群B(AI経路)テーブルへのクライアントINSERTは書込ポリシー不在で拒否される
--     担当 site_1 であっても risk_prediction_cache はフロントからINSERTできない(Node/service_role専用)
select throws_ok(
  $$ insert into risk_prediction_cache (site_id, target_date, payload)
     values ('site_1_uuid', current_date, '{}'::jsonb) $$,
  '42501',  -- insufficient_privilege / RLS(書込ポリシー不在)
  null,
  'user_a は担当現場でも予測キャッシュを直接INSERTできない(Node/service_role専用)'
);

-- (8) HIGH-2: 群B candidates への確定操作(UPDATE)もクライアントからは拒否される
--     = クライアントによるシフト自己確定(HITLバイパス)を構造的に排除
select throws_ok(
  $$ update shift_optimization_candidates
       set review_status='confirmed', confirmed_flag=true,
           confirmed_by='user_a_uuid', confirmed_at=now()
     where site_id='site_1_uuid' $$,
  '42501',  -- insufficient_privilege / RLS(UPDATEポリシー不在)
  null,
  'user_a はクライアント直結ではシフトを自己確定できない(確定はNode経由RPCのみ)'
);

select * from finish();
rollback;
```

> **HIGH-2の検証意図:** テスト(5)(6)はDB制約 `chk_hitl_confirm` によるHITL二重化を、テスト(7)(8)は **RLS書込ポリシーの剥奪** による「クライアント書込経路そのものの遮断」を検証する。両者は補完関係で、(7)(8)により群Bはそもそもクライアントから書けないため、確定・予測更新は必ず service_role を持つ Node 経由に集約される（ADR-005/ADR-008）。

> Security Engineer(#14)との共同検証: 上記に加え、`notification_reads` の他人既読INSERT拒否、`shift_candidate_assignments`（親candidate経由でsite_id保持）の担当外閲覧拒否を追加ケースとして拡張する。

---

## 6. N+1 / インデックス / 後方互換メモ（Generatorへの申し送り）

### 6.1 N+1回避
- **日報一覧・検索（REQ-009）:** 既存 `daily_reports` に対する複合インデックス `(site_id, 対象月, status, 報告者)` を実列名確認後（OQ-DB1）に付与（本書§2にコメント雛形あり）。ステータス履歴は `report_status_history(report_id, created_at)` を1回のJOIN/最新1件取得（`distinct on`）で引き、行ごとの追加クエリを禁止。
- **月報集計（REQ-010〜012）:** 集計は行ごとにアプリで回さず、**追加ビュー/RPC** に集約（既存テーブルへは触れない前提）。骨格集計ビュー `v_monthly_report_summary` / `v_daily_report_trend` は **§4.5（0105）で提供済み**（v1.1 / MEDIUM-1是正）。項目別のcounter合算・インシデント内訳はテンプレ差異吸収のため input-core 純粋関数へ委ねる二層構成。`EXPLAIN ANALYZE` でSeq Scan非発生を確認すること。
- **最適化候補の展開（REQ-019/021）:** `shift_candidate_assignments` は `candidate_id` 単位でまとめて取得（`where candidate_id = any($1)`）。候補×割当のN+1を作らない。
- **リスク予測（REQ-014）:** `risk_prediction_cache` を `(site_id, target_date, predicted_at desc)` で最新1件だけ引く。予測の都度Claude呼び出しをせず、キャッシュヒット時はNode層をスキップ（ADR-003/005のコスト設計）。

### 6.2 インデックス方針
- **RLS絞り込み:** RLS対象の全新規テーブルで `site_id` を先頭に置く複合インデックスを設置済み。`site_id in (select app_user_site_ids())` の絞り込みがインデックスで効く。
- **JSONB:** `config` / `default_values` / `draft_payload` / `payload`（制約・予測）に **GINインデックス** を付与済み（部分一致・キー存在検索の高速化）。
- **部分インデックス:** 資格更新間近（REQ-023）は `where expires_on is not null` の部分インデックスで期限範囲検索を軽量化。確定候補の一意制約も `where review_status='confirmed'` の部分ユニークで実現。
- **一意制約:** 下書きは `(site_id, author_id, target_date)` で1日1件に正規化（再開時の一意特定・重複防止）。

### 6.3 後方互換（最優先）
- 全マイグレーションは `create table if not exists` / `add column if not exists ... null` / `create index if not exists` / `create policy` のみ。既存25テーブルの定義・既存RLSは不変。
- 既存テーブルへのFKは **意図的に張らない**（`report_status_history.report_id` 等は緩い参照）。既存テーブルにトリガ/制約を足すと後方互換リスクがあるため、参照整合はアプリ層＋RLSで担保する（追加のみ安全側）。
- 全マイグレーションに **ロールバックSQL（down）を添付済み**（§2〜§4）。追加のみのため down は drop で完全復元可能。

---

## 7. 破壊的変更ゼロの機械検証方針（CI差分チェック案）

CIパイプライン（DevOps #13）に **後方互換ゲート** を追加する。第1段は静的検査で、`supabase/migrations/01xx_*.sql` を対象に禁止トークン（`drop table`／`drop column`／`alter ... type`／`rename`／`set not null`／`drop constraint`／既存25テーブル名に対する `alter table` のうち `add column ... null` 以外）を正規表現でスキャンし、1件でも検出したらCIを失敗させる（NFR-01のテスト可能性）。第2段は動的検査で、①追加前スキーマを `pg_dump --schema-only` でスナップショット化 → ②追加マイグレーション適用 → ③再度 `pg_dump` して差分を取り、差分が「新規オブジェクトの追加」または「既存テーブルへのNULL許容列追加」のみで構成され、既存テーブルの列・型・制約・RLSポリシーに **変更・削除が無い** ことをホワイトリスト方式で機械判定する。加えて `0101_*_down.sql` 等のロールバックを適用してスナップショットが元に戻ることを検証し、可逆性を担保する。この2段ゲートを全PR必須チェックにすることで、追加のみ原則を人手レビューに依存せず強制する。

---

## 8. Open Questions（DB観点）

| OQ | 質問 | 重要度 | 影響 |
|----|------|--------|------|
| **OQ-DB1** | 既存25テーブルの実DDL（特に `daily_reports` の列名/`status`列、`shifts`/`assignments` 構造、`sites`/`staff`/`notifications`/`training_records` の実在と主キー、現場メンバーシップテーブルの実体）。**最重要** | High | 本書のFK参照・追加列対象・`app_user_site_ids()` の実装が全て仮定。確定で確定設計へ昇格（OQ-05/OQ-06に対応） |
| OQ-DB2 | 既存 `risk_predictions` テーブルの有無と予測エンジンI/O（REQ-014, OQ-05） | High | 実在すれば `risk_prediction_cache` を廃し既存参照に切替（重複回避） |
| OQ-DB3 | 現場メンバーシップの多重度（1ユーザー複数現場/ロール差）と `role`（admin/guard等）による書込差 | Mid | RLSの書込ポリシーを役割別に精緻化するか判断 |
| OQ-DB4 | AI制約のハード/ソフト網羅（OQ-03） | High | `shift_optimization_constraints.constraint_type` の enum 拡張要否 |

---

## 9. 出力サマリー

```
Database Engineer 完了 (v1.1 / Spec-Validator CONDITIONAL 是正反映)
新規テーブル数: 17
  日報系(0101): 6 / シフト最適化・予測・通知教育(0102): 10
  シフト永続化(0104): 1 (shift_overrides = 手動編集+AI反映の正/HIGH-1・HIGH-3)
既存拡張列数: 8 (全てNULL許容) + 候補反映列3 (shift_optimization_candidates:
  applied_status/at/by, 0104/HIGH-3。※新規テーブルへの追加のためNULL許容)
マイグレーション: 5本 (0101/0102/0103_rls/0104_shift_overrides/0105_monthly_view)
  + 各down(ロールバック)添付
RLS(v1.1 HIGH-2で最小権限化):
  群A(本人・現場担当が書く 11表 + shift_overrides): 担当現場でCRUD付与。
  群B(AI経路 5表: shift_optimization_runs/constraints/candidates/assignments,
     risk_prediction_cache): クライアントはSELECTのみ。書込はservice_role/Node専用。
  現場判定は app_user_site_ids() 1関数に隔離。既存RLSは不変。
HITL(REQ-020): (a)CHECK制約chk_hitl_confirm+部分ユニークでDB二重化, かつ
  (b)群BのRLS書込ポリシー剥奪でクライアント自己確定経路を遮断(HIGH-2)。
write-back(HIGH-3): confirmed候補→shift_overrides(source='ai_apply')へNode経由反映。
  (site_id,staff_id,work_date)一意で冪等。candidates.applied_statusで工程追跡。詳細ADR-008。
月報集計(MEDIUM-1): v_monthly_report_summary/v_daily_report_trend を0105で提供
  (security_invoker=on / 骨格集計。項目別はinput-core二層)。
破壊的変更ゼロの担保: 追加のみDDL + 2段CIゲート + down可逆性検証。
最重要残Open Question: OQ-DB1 既存25テーブルの実DDL(daily_reports列名/shifts構造/
  現場メンバーシップ)確認。各是正は「実DDL判明時に見直す」注記を明記。
→ Architect(#07)・Security Engineer(#14)・Generator(#10) へ引き渡し
```

---

## v1.1 是正履歴（Spec-Validator CONDITIONAL 80点 差し戻し対応）

本版は spec/spec-validation-report.md の指摘を **追加のみ・破壊的変更なし** で是正した。

| 指摘 | 対応（database-design.md） |
|---|---|
| **HIGH-1**（手動シフト編集REQ-016の保存先不在） | 新規テーブル `shift_overrides`（§3.5 / 0104）を追加。セル単位編集を `source='manual'` で永続化する保存先を新設。`(site_id, staff_id, work_date)` 一意。既存 `shifts` には触れない（追加のみ）。 |
| **HIGH-2**（16表一括RLS書込が過剰） | §4（0103）を **群A（現場担当が書く→CRUD付与）/ 群B（AI経路→SELECTのみ、書込ポリシー剥奪）** に分離。群B=`shift_optimization_runs/constraints/candidates/assignments`・`risk_prediction_cache` はクライアント書込不可（service_role/Node専用）。pgTAPテスト(7)(8)で自己確定・キャッシュ汚染の遮断を検証。 |
| **HIGH-3**（確定AI→実運用の反映経路未定義） | `shift_overrides`（source='ai_apply'）を実運用シフトの反映先に一本化。`candidate_id/run_id` で由来リンク、`(site_id,staff_id,work_date)` 一意で再反映の冪等性を担保。候補側に `applied_status/applied_at/applied_by`（NULL許容追加列）を付与し反映工程を追跡。反映フロー本体は architecture.md **ADR-008**。 |
| **MEDIUM-1**（月報ビュー未提供） | §4.5（0105）で `v_monthly_report_summary` / `v_daily_report_trend` を追加ビューとして提供（`security_invoker=on`）。項目別集計はinput-core二層で補完。 |
| 共通制約 | 全是正は新規テーブル・NULL許容列・追加ビューのみ。既存25テーブルの実DDL未確認（HIGH-0/OQ-DB1）は本是正の対象外で、各是正に「実DDL判明時に見直す」注記を残置。 |
