-- =====================================================================
-- 0201_app_role.sql  —  アプリ最小権限ロール（本採用フェーズ DB-3 / Generator #10）
-- 対応: NFR-03, ADR-002/005/008, 0200_rls.sql（群A/群B）
--
-- 目的:
--   RLS は「非superuser かつ nobypassrls」ロールでのみ実効になる。
--   postgres(superuser) は RLS をバイパスするため、アプリは専用の
--   最小権限ロール app_client で接続してこそ現場スコープが検証できる。
--
-- 方針（最小権限）:
--   ・app_user_site_ids() は security definer（postgres所有）で app_site_members を
--     参照するため、app_client へ app_site_members の直接 GRANT は与えない（隠蔽）。
--   ・群A（現場担当が読み書き）: 対象表に select/insert/update を付与。DELETE は
--     追記型思想で付与しない。行スコープは RLS が担保する。
--   ・群B（AI経路＝サーバ専用書込）: select/insert/update を付与するが、
--     書込は RLS の with_check app_is_service() が唯一のゲート。
--     → app_client の素の接続（app.role 未設定）では INSERT/UPDATE が RLS で拒否され、
--       withService（set app.role='service'）でのみ成功する。
--   ・マスタ/参照表: select のみ（子テーブル RLS が staff を JOIN 参照するため staff 等が必要）。
-- =====================================================================

-- ---- ロール作成（存在すればスキップ / login・非superuser・RLS従属）----
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'app_client') then
    create role app_client login nosuperuser nobypassrls;
  end if;
end $$;

-- 明示的に nobypassrls / nosuperuser を保証（既存ロール再適用時の安全化）
alter role app_client nosuperuser nobypassrls;

-- ---- スキーマ利用権 ----
grant usage on schema public to app_client;

-- ---- 読み取り: RLS 対象表は RLS が行スコープを担保。非RLSのマスタ表も参照可 ----
grant select on all tables in schema public to app_client;

-- ---- 群A: 現場担当が読み書き（insert/update を付与。行スコープは RLS）----
grant insert, update on
  daily_reports,
  shifts,
  shift_overrides,
  report_drafts,
  shift_preferences,
  staff_qualifications,
  notification_confirmations
to app_client;

-- ---- 群B: AI経路（サーバ専用書込）----
--   GRANT は付与するが、RLS の with_check app_is_service() が実効ゲート。
--   素の app_client（app.role 未設定）では書込が RLS で拒否される。
grant insert, update on
  shift_optimization_runs,
  shift_optimization_assignments
to app_client;

-- 明示的に app_site_members への直接権限は付与しない（security definer 経由のみ）。
revoke all on app_site_members from app_client;
