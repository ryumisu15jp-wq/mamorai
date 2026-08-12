-- =====================================================================
-- 0202_rls_hardening.sql  —  RLS是正（本採用フェーズ 再認証 / Security Engineer #14 兼 Backend #10）
-- 対応: production-phase-evaluation.md HIGH-1（service昇格の抜け道）/ HIGH-2（越境読取）
--        NFR-03「担当外現場が見えない」, ADR-002/005/008, 0200_rls.sql / 0201_app_role.sql
--
-- 方針（追加のみ・冪等・ON_ERROR_STOP前提）:
--   HIGH-1: GUC `app.role='service'` は同一 app_client 接続で偽装可能だった。
--     → service 判定を「専用ロール app_service か否か」に変更する。app_is_service() の本体を
--       `current_user = 'app_service'` へ置換（＝群Bの全ポリシーが自動追従）。app_client は
--       いかなる GUC を立てても current_user は app_client のままなので群B書込は不可になる。
--   HIGH-2: 0201 の `grant select on all tables` により RLS 未適用の site-scoped 表が越境参照できた。
--     → 未適用の全テナント表に RLS 有効化＋force＋現場スコープ SELECT ポリシーを付与し、
--       ブランケット GRANT を廃止して必要最小の表・操作のみ再付与する。
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0) HIGH-1: service 判定を専用ロールへ（GUC偽装を構造排除）
--    非security-definer のまま current_user を評価するため、app_service 接続でのみ true。
--    群B（shift_optimization_runs / _assignments）の既存ポリシーは app_is_service() を
--    参照しているため、本関数の置換だけで WITH CHECK / USING が追従する。
-- ---------------------------------------------------------------------
create or replace function app_is_service()
returns boolean
language sql
stable
as $$
  select current_user = 'app_service'
$$;
grant execute on function app_is_service() to public;

-- ---------------------------------------------------------------------
-- 1) 専用サービスロール app_service（login / 非superuser / RLS従属）
--    群B の書込特権のみを持つ。素の app_client からは到達不能（別接続＝pool.ts の servicePool）。
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'app_service') then
    create role app_service login nosuperuser nobypassrls;
  end if;
end $$;
alter role app_service nosuperuser nobypassrls;
grant usage on schema public to app_service;

-- =====================================================================
-- 2) HIGH-2: 未適用テナント表に RLS 有効化＋force＋現場スコープ SELECT ポリシー
--    site_id を直接持つ表は site_id 判定、子表は親JOINで判定。
--    app_client はこれらを SELECT のみ（書込 GRANT 無し＝force下では INSERT/UPDATE/DELETE 全拒否）。
-- =====================================================================

-- ---- sites（現場マスタ：他現場の名称/住所も担当外は不可視に）----
alter table sites enable row level security;
alter table sites force row level security;
drop policy if exists sites_sel on sites;
create policy sites_sel on sites for select
  using (id in (select app_user_site_ids()));

-- ---- staff（隊員名簿：他現場の名簿を不可視に。子表JOINの評価元でもある）----
alter table staff enable row level security;
alter table staff force row level security;
drop policy if exists staff_sel on staff;
create policy staff_sel on staff for select
  using (site_id in (select app_user_site_ids()));

-- ---- report_templates（直接 site_id）----
alter table report_templates enable row level security;
alter table report_templates force row level security;
drop policy if exists report_templates_sel on report_templates;
create policy report_templates_sel on report_templates for select
  using (site_id in (select app_user_site_ids()));

-- ---- report_template_sections（子表：report_templates.site_id 経由）----
alter table report_template_sections enable row level security;
alter table report_template_sections force row level security;
drop policy if exists report_template_sections_sel on report_template_sections;
create policy report_template_sections_sel on report_template_sections for select
  using (template_id in (select t.id from report_templates t
                         where t.site_id in (select app_user_site_ids())));

-- ---- shift_constraints（直接 site_id）----
alter table shift_constraints enable row level security;
alter table shift_constraints force row level security;
drop policy if exists shift_constraints_sel on shift_constraints;
create policy shift_constraints_sel on shift_constraints for select
  using (site_id in (select app_user_site_ids()));

-- ---- template_section_configs（直接 site_id）----
alter table template_section_configs enable row level security;
alter table template_section_configs force row level security;
drop policy if exists template_section_configs_sel on template_section_configs;
create policy template_section_configs_sel on template_section_configs for select
  using (site_id in (select app_user_site_ids()));

-- ---- training_records（PII：子表 staff.site_id 経由で現場判定）----
alter table training_records enable row level security;
alter table training_records force row level security;
drop policy if exists training_records_sel on training_records;
create policy training_records_sel on training_records for select
  using (staff_id in (select s.id from staff s
                      where s.site_id in (select app_user_site_ids())));

-- ---- notifications（機密 body：target_site_id で現場限定。全体配信=NULLは全員可視）----
--   scope=all/workType/role で target_site_id が NULL の「本部一斉通知」は全員可視、
--   特定現場宛(target_site_id 有り)は担当現場のみ可視＝他現場の機密通知は不可視。
alter table notifications enable row level security;
alter table notifications force row level security;
drop policy if exists notifications_sel on notifications;
create policy notifications_sel on notifications for select
  using (target_site_id is null
         or target_site_id in (select app_user_site_ids()));

-- ---- notification_targets（配信対象スナップショット：自身の site_id で現場限定）----
--   注: 親 notifications 経由ではなく、行が保持する所属現場 site_id で直接スコープする。
--       これにより「本部一斉通知の配信対象に他現場隊員が含まれる」場合でも他現場行は不可視
--       （＝より厳格。site_id が NULL の行はフェイルクローズで不可視）。
alter table notification_targets enable row level security;
alter table notification_targets force row level security;
drop policy if exists notification_targets_sel on notification_targets;
create policy notification_targets_sel on notification_targets for select
  using (site_id in (select app_user_site_ids()));

-- 除外（非テナント/内部専用）:
--   ・app_site_members … 現場メンバーシップの原本。app_client へ GRANT せず（0201で revoke 済）、
--     app_user_site_ids()（security definer）経由でのみ参照。RLS対象外だが app_client 到達不能。

-- =====================================================================
-- 3) HIGH-2: ブランケット GRANT 廃止 → 最小権限で再付与
--    0201 の `grant select on all tables ... to app_client` を撤回し、必要表・操作のみ付与。
--    群B の INSERT/UPDATE は app_client から剥奪（＝GUC を立てても書込不可、二重の遮断）。
-- =====================================================================
revoke select, insert, update, delete on all tables in schema public from app_client;

-- ---- app_client SELECT（担当現場スコープは各表 RLS が担保）----
grant select on
  sites,
  staff,
  daily_reports,
  shifts,
  shift_overrides,
  report_drafts,
  report_templates,
  report_template_sections,
  template_section_configs,
  shift_constraints,
  shift_preferences,
  staff_qualifications,
  notifications,
  notification_targets,
  notification_confirmations,
  training_records,
  shift_optimization_runs,
  shift_optimization_assignments
to app_client;

-- ---- app_client 群A（現場担当が読み書き）: INSERT/UPDATE を付与。行スコープは RLS。----
grant insert, update on
  daily_reports,
  shifts,
  shift_overrides,
  report_drafts,
  shift_preferences,
  staff_qualifications,
  notification_confirmations
to app_client;

-- ---- 群B は app_client へ INSERT/UPDATE を付与しない（HIGH-1 恒久遮断）----
--   （0201 が付与していた群Bの insert/update は上の revoke で剥奪済。再付与しない。）

-- =====================================================================
-- 4) app_service（サーバ専用書込ロール）へ群B書込特権のみ付与
--    群B の書込は app_service 接続でのみ成立（ポリシー app_is_service()=current_user 判定）。
--    SELECT も付与（下案確認・生成直後の読戻し）。app_is_service() 経由で全件可視。
-- =====================================================================
grant select, insert, update on
  shift_optimization_runs,
  shift_optimization_assignments
to app_service;

-- app_service には群A/参照表への広域 GRANT を与えない（書込のみ特権・最小権限）。
