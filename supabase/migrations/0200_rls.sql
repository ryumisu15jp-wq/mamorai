-- =====================================================================
-- 0200_rls.sql  —  現場スコープ RLS（本採用フェーズ DB-2 / Security Engineer #14）
-- 対応: NFR-03, ADR-002/005/008, database-design.md §4（群A/群B）
--
-- 前提（ライブDB検証のためのエミュレーション）:
--   ・Supabase auth.uid() 相当 = current_setting('app.user_id', true)::uuid
--   ・service_role 相当       = current_setting('app.role',    true) = 'service'
--   ・検証は必ず 非superuser ロール(app_user)で SET ROLE してから行う
--     （superuser/テーブル所有者は RLS をバイパスするため force RLS も付与）
--
-- 群A: 現場担当が読み書き（担当現場スコープで SELECT/INSERT/UPDATE(/DELETE)）
--   daily_reports, shifts, shift_overrides, report_drafts,
--   shift_preferences, staff_qualifications, notification_confirmations
-- 群B: AI経路＝サーバ専用書込（一般ロールは SELECT のみ・書込は service 相当のみ）
--   shift_optimization_runs, shift_optimization_assignments
--
-- site_id を持たない子テーブルは親経由(JOIN)で現場判定:
--   staff_qualifications / notification_confirmations → staff.site_id
--   shift_optimization_assignments                    → shift_optimization_runs.site_id
-- =====================================================================

-- ---------------------------------------------------------------------
-- ヘルパー: 現場メンバーシップ解決 & service 判定（唯一の"結線"隔離点）
--   実DDL(Supabase)移行時は app_user_site_ids() の中身を
--   `auth.uid()` ベースへ差し替えるだけで全ポリシーが正しく動く。
--   security definer で app_site_members を参照するため、一般ロールへ
--   app_site_members の直接 GRANT は不要（最小権限）。
-- ---------------------------------------------------------------------
create or replace function app_user_site_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select m.site_id
  from app_site_members m
  where m.user_id = nullif(current_setting('app.user_id', true), '')::uuid
$$;

create or replace function app_is_service()
returns boolean
language sql
stable
as $$
  select coalesce(nullif(current_setting('app.role', true), ''), '') = 'service'
$$;

-- 一般ロールが RLS 評価時にヘルパを呼べるように EXECUTE を明示付与
grant execute on function app_user_site_ids() to public;
grant execute on function app_is_service() to public;

-- =====================================================================
-- 群A: 現場担当が読み書き
-- =====================================================================

-- ---- daily_reports（直接 site_id / 追記型に寄せ DELETE は付与しない）----
alter table daily_reports enable row level security;
alter table daily_reports force row level security;

drop policy if exists daily_reports_sel on daily_reports;
drop policy if exists daily_reports_ins on daily_reports;
drop policy if exists daily_reports_upd on daily_reports;

create policy daily_reports_sel on daily_reports for select
  using (site_id in (select app_user_site_ids()));
create policy daily_reports_ins on daily_reports for insert
  with check (site_id in (select app_user_site_ids()));
-- UPDATE は担当現場に限定（承認列更新＝同現場担当の運用。列限定は GRANT(column) 側で担保）
create policy daily_reports_upd on daily_reports for update
  using (site_id in (select app_user_site_ids()))
  with check (site_id in (select app_user_site_ids()));
-- DELETE ポリシーは意図的に作成しない（追記型：日報は物理削除させない）

-- ---- shifts / shift_overrides / report_drafts / shift_preferences（直接 site_id）----
do $$
declare t text;
begin
  foreach t in array array[
    'shifts','shift_overrides','report_drafts','shift_preferences'
  ]
  loop
    execute format('alter table %I enable row level security;', t);
    execute format('alter table %I force row level security;', t);
    execute format('drop policy if exists %I on %I;', t||'_sel', t);
    execute format('drop policy if exists %I on %I;', t||'_ins', t);
    execute format('drop policy if exists %I on %I;', t||'_upd', t);
    execute format('drop policy if exists %I on %I;', t||'_del', t);
    execute format($f$
      create policy %1$s_sel on %1$I for select
        using (site_id in (select app_user_site_ids()));$f$, t);
    execute format($f$
      create policy %1$s_ins on %1$I for insert
        with check (site_id in (select app_user_site_ids()));$f$, t);
    execute format($f$
      create policy %1$s_upd on %1$I for update
        using (site_id in (select app_user_site_ids()))
        with check (site_id in (select app_user_site_ids()));$f$, t);
    execute format($f$
      create policy %1$s_del on %1$I for delete
        using (site_id in (select app_user_site_ids()));$f$, t);
  end loop;
end $$;

-- ---- staff_qualifications（子テーブル：staff.site_id 経由で現場判定）----
alter table staff_qualifications enable row level security;
alter table staff_qualifications force row level security;

drop policy if exists staff_qualifications_sel on staff_qualifications;
drop policy if exists staff_qualifications_ins on staff_qualifications;
drop policy if exists staff_qualifications_upd on staff_qualifications;
drop policy if exists staff_qualifications_del on staff_qualifications;

create policy staff_qualifications_sel on staff_qualifications for select
  using (staff_id in (select s.id from staff s
                      where s.site_id in (select app_user_site_ids())));
create policy staff_qualifications_ins on staff_qualifications for insert
  with check (staff_id in (select s.id from staff s
                           where s.site_id in (select app_user_site_ids())));
create policy staff_qualifications_upd on staff_qualifications for update
  using (staff_id in (select s.id from staff s
                      where s.site_id in (select app_user_site_ids())))
  with check (staff_id in (select s.id from staff s
                           where s.site_id in (select app_user_site_ids())));
create policy staff_qualifications_del on staff_qualifications for delete
  using (staff_id in (select s.id from staff s
                      where s.site_id in (select app_user_site_ids())));

-- ---- notification_confirmations（子テーブル：staff.site_id 経由）----
alter table notification_confirmations enable row level security;
alter table notification_confirmations force row level security;

drop policy if exists notification_confirmations_sel on notification_confirmations;
drop policy if exists notification_confirmations_ins on notification_confirmations;
drop policy if exists notification_confirmations_del on notification_confirmations;

create policy notification_confirmations_sel on notification_confirmations for select
  using (staff_id in (select s.id from staff s
                      where s.site_id in (select app_user_site_ids())));
create policy notification_confirmations_ins on notification_confirmations for insert
  with check (staff_id in (select s.id from staff s
                           where s.site_id in (select app_user_site_ids())));
-- 既読は追記型（UPDATE ポリシー無し＝改ざん不可）。DELETE は撤回運用のため担当現場のみ許可
create policy notification_confirmations_del on notification_confirmations for delete
  using (staff_id in (select s.id from staff s
                      where s.site_id in (select app_user_site_ids())));

-- =====================================================================
-- 群B: AI経路（サーバ専用書込）— 一般ロールは SELECT のみ / 書込は service 相当のみ
--   INSERT/UPDATE/DELETE は app_is_service() の時だけ許可。
--   → anon/authenticated 相当のクライアントは書込不可（HITL自己確定・キャッシュ汚染を構造排除）
-- =====================================================================

-- ---- shift_optimization_runs（直接 site_id）----
alter table shift_optimization_runs enable row level security;
alter table shift_optimization_runs force row level security;

drop policy if exists shift_optimization_runs_sel on shift_optimization_runs;
drop policy if exists shift_optimization_runs_ins on shift_optimization_runs;
drop policy if exists shift_optimization_runs_upd on shift_optimization_runs;
drop policy if exists shift_optimization_runs_del on shift_optimization_runs;

-- SELECT: 担当現場のみ（＝管制員は自現場の下案を確認できる）。service は全件可。
create policy shift_optimization_runs_sel on shift_optimization_runs for select
  using (app_is_service() or site_id in (select app_user_site_ids()));
-- INSERT/UPDATE/DELETE: service 相当のみ（クライアント書込は全拒否）
create policy shift_optimization_runs_ins on shift_optimization_runs for insert
  with check (app_is_service());
create policy shift_optimization_runs_upd on shift_optimization_runs for update
  using (app_is_service()) with check (app_is_service());
create policy shift_optimization_runs_del on shift_optimization_runs for delete
  using (app_is_service());

-- ---- shift_optimization_assignments（子テーブル：run 経由で現場判定）----
alter table shift_optimization_assignments enable row level security;
alter table shift_optimization_assignments force row level security;

drop policy if exists shift_optimization_assignments_sel on shift_optimization_assignments;
drop policy if exists shift_optimization_assignments_ins on shift_optimization_assignments;
drop policy if exists shift_optimization_assignments_upd on shift_optimization_assignments;
drop policy if exists shift_optimization_assignments_del on shift_optimization_assignments;

create policy shift_optimization_assignments_sel on shift_optimization_assignments for select
  using (
    app_is_service()
    or run_id in (select r.run_id from shift_optimization_runs r
                  where r.site_id in (select app_user_site_ids()))
  );
create policy shift_optimization_assignments_ins on shift_optimization_assignments for insert
  with check (app_is_service());
create policy shift_optimization_assignments_upd on shift_optimization_assignments for update
  using (app_is_service()) with check (app_is_service());
create policy shift_optimization_assignments_del on shift_optimization_assignments for delete
  using (app_is_service());
