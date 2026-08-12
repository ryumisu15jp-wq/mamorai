-- [REQ-007][NFR-01] 追加のみマイグレーション（additive-only / 破壊的変更なし）
-- Sprint4: 通知(対象別配信・確認管理) / 教育・資格(有効期限・研修達成率) / テンプレート設定(セクションON/OFF) を支える最小の追加テーブル群。
-- 方針: spec/database-design.md（§0 additive-only, NFR-01 / ADR-006）に整合。
--   許可する操作: 冪等な新規テーブル生成 / NULL許容の列追加 / 冪等なインデックス生成 のみ。
--   禁止する操作: 破壊的DDL（削除・改名・型変更・既存列の必須化）は本ファイルに一切含めない。
--
-- 注意: 既存25テーブル（sites / staff / shifts 等）の完全なDDLは未提供であり、
--       ここでの参照・拡張対象は「モックアップ(全11画面v2)とREQからの推定(想定)」である（OQ-DB1）。
--       既存テーブル・既存RLSには一切触れず、NULL許容の追加列と新規テーブルのみを足す。
--       staff_qualifications は 0102 で作成済みのため、本ファイルでは追加列のみ冪等に足す（重複作成しない）。
--
-- RLS: 通知の閲覧は「対象現場/対象者に限定」、AI経路(service_role)は既存方針と同様。
--      実RLSポリシーは既存25テーブルとのDB結合時に付与する（本ファイルは追加のみで policy を張らない）。

-- =====================================================================
-- 1) 通知本体（対象別配信の起点）
--    target_* で AudienceFilter(scope=all/site/workType/role, siteId併記はAND) を後方互換に保持。
--    REQ-022
-- =====================================================================
create table if not exists notifications (
  id           uuid primary key default gen_random_uuid(),
  kind         text,                          -- 重要事項 / 業務指示 / 本部通知 / 自由文字列
  title        text,
  body         text,
  target_scope text,                          -- all / site / workType / role
  target_site_id  uuid,                        -- sites.id への緩い参照（仮定・FKは張らない）。scope=site もしくは AND 絞り込み用
  target_work_type text,                       -- scope=workType（日勤/夜勤 等）
  target_role  text,                          -- scope=role（隊員/責任者 等）
  created_by   uuid,                           -- staff.id への緩い参照（仮定・FKは張らない）
  created_at   timestamptz default now()
);
create index if not exists idx_notifications_target on notifications(target_scope, target_site_id);

-- =====================================================================
-- 2) 配信対象（resolveRecipients の解決結果を明示保存する任意テーブル）
--    誤配信防止のため「対象者スナップショット」を残せるようにする（jsonb でも可のところを行で正規化）。
--    REQ-022
-- =====================================================================
create table if not exists notification_targets (
  id              uuid primary key default gen_random_uuid(),
  notification_id uuid references notifications(id) on delete cascade,
  staff_id        uuid,                         -- 対象利用者（staff.id への緩い参照）
  site_id         uuid,                         -- スナップショット時点の所属現場
  created_at      timestamptz default now()
);
create index if not exists idx_notification_targets_ntf on notification_targets(notification_id);
create index if not exists idx_notification_targets_staff on notification_targets(staff_id);

-- =====================================================================
-- 3) 確認記録（buildDelivery の confirmed 集計の永続化）
--    未確認件数 = recipient数 − recipient内confirmed数。対象外の確認は集計対象外（アプリ層で除外）。
--    REQ-022
-- =====================================================================
create table if not exists notification_confirmations (
  id              uuid primary key default gen_random_uuid(),
  notification_id uuid references notifications(id) on delete cascade,
  staff_id        uuid,                         -- 確認した利用者（staff.id への緩い参照）
  confirmed_at    timestamptz default now(),
  unique (notification_id, staff_id)             -- 二重確認を防ぐ（追加のみ・冪等な制約）
);
create index if not exists idx_notification_confirmations_ntf on notification_confirmations(notification_id);

-- =====================================================================
-- 4) スタッフ資格への追加列（0102 で作成済みテーブルへ additive に拡張）
--    classifyQualification は expiresOn を参照する。既存 valid_until と別に expires_on を持てるよう冪等追加。
--    REQ-023
-- =====================================================================
alter table if exists staff_qualifications add column if not exists expires_on date;
alter table if exists staff_qualifications add column if not exists status text;         -- 有効 / 更新間近 / 期限切れ（キャッシュ用・任意）
alter table if exists staff_qualifications add column if not exists days_to_expiry integer; -- 負値=期限切れ（キャッシュ用・任意）

-- =====================================================================
-- 5) 研修記録（trainingAchievement の入力データ）
--    達成率 = completed_hours / required_hours を 0..1 にクランプ（required=0 は満了=1）。集計はアプリ層(純粋関数)で実施。
--    REQ-023
-- =====================================================================
create table if not exists training_records (
  id              uuid primary key default gen_random_uuid(),
  staff_id        uuid,                          -- staff.id への緩い参照（仮定・FKは張らない）
  training_type   text,                          -- 新任基本研修 等
  required_hours  numeric,                       -- 例: 45
  completed_hours numeric,                       -- 履修済み時間
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);
create index if not exists idx_training_records_staff on training_records(staff_id);

-- =====================================================================
-- 6) テンプレートのセクションON/OFF設定（applyTemplateConfig の永続化）
--    現場ごとに無効化するセクションIDを保持。非破壊: 元テンプレート/過去集計には影響しない。
--    REQ-024
-- =====================================================================
create table if not exists template_section_configs (
  id                   uuid primary key default gen_random_uuid(),
  template_id          uuid,                     -- report_templates.id への緩い参照（仮定・FKは張らない）
  site_id              uuid,                     -- 現場スコープ
  disabled_section_ids jsonb default '[]'::jsonb, -- 無効化するセクションIDの配列
  created_at           timestamptz default now(),
  updated_at           timestamptz default now()
);
create index if not exists idx_template_section_configs_site on template_section_configs(site_id, template_id);
