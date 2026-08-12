-- =====================================================================
-- rls-verification.sql — クロスユーザー現場スコープRLS 実証（DB-2 / #14）
-- 実行: psql -h 127.0.0.1 -p 5433 -U postgres -d mamorai -f この
-- 検証は必ず 非superuser ロール app_user で SET ROLE してから行う。
-- =====================================================================
\set ON_ERROR_STOP off
\pset pager off
\timing off

-- ---------------------------------------------------------------------
-- 0) 非superuser 検証ロール（LOGIN/NOSUPERUSER/NOBYPASSRLS）
--    ※ ロール生成/権限付与は autocommit（トランザクション外）で行う。
--      既存ロールは DROP OWNED で依存権限を外してから再作成（冪等）。
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'app_user') then
    execute 'drop owned by app_user';
    execute 'drop role app_user';
  end if;
end $$;

create role app_user login nosuperuser nobypassrls;
grant usage on schema public to app_user;
grant select, insert, update, delete on all tables in schema public to app_user;

-- 検証本体は単一トランザクションで実行し末尾で ROLLBACK。
--   → SAVEPOINT が使え（psqlのautocommit回避）、テストデータを残さない。
begin;

select '=== role app_user attributes (superuser=f, bypassrls=f 必須) ===' as info;
select rolname, rolsuper, rolbypassrls, rolcanlogin
  from pg_roles where rolname = 'app_user';

-- ---------------------------------------------------------------------
-- 1) 準備データ（postgres/所有者で投入 = RLSバイパス）
--    固定UUID: site1/site2, u_a(site1), u_b(site2)
-- ---------------------------------------------------------------------
\set site1 '11111111-1111-1111-1111-111111111111'
\set site2 '22222222-2222-2222-2222-222222222222'
\set u_a   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
\set u_b   'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
\set run1  '99999999-9999-9999-9999-999999999999'
\set stf1  'cccccccc-cccc-cccc-cccc-cccccccccccc'
\set stf2  'dddddddd-dddd-dddd-dddd-dddddddddddd'

-- 冪等クリーンアップ（子→親）
delete from shift_optimization_assignments where run_id = :'run1';
delete from shift_optimization_runs where site_id in (:'site1', :'site2');
delete from staff_qualifications where staff_id in (:'stf1', :'stf2');
delete from daily_reports where site_id in (:'site1', :'site2');
delete from app_site_members where site_id in (:'site1', :'site2');
delete from staff where id in (:'stf1', :'stf2');
delete from sites where id in (:'site1', :'site2');

insert into sites(id, name, code) values
  (:'site1', 'Site One', 'S1'),
  (:'site2', 'Site Two', 'S2');

-- メンバーシップ: u_a=site1(guard), u_b=site2(guard)
insert into app_site_members(user_id, site_id, role) values
  (:'u_a', :'site1', 'guard'),
  (:'u_b', :'site2', 'guard');

-- staff（子テーブルJOIN検証用）
insert into staff(id, site_id, name) values
  (:'stf1', :'site1', 'Staff S1'),
  (:'stf2', :'site2', 'Staff S2');

-- daily_reports: site1行 / site2行
insert into daily_reports(site_id, report_date, status) values
  (:'site1', date '2026-08-11', 'submitted'),
  (:'site2', date '2026-08-11', 'submitted');

-- staff_qualifications: 子テーブル（site1系/site2系）
insert into staff_qualifications(staff_id, qualification) values
  (:'stf1', 'guard-1kyu'),
  (:'stf2', 'guard-1kyu');

-- 群B: shift_optimization_runs に site1行（serviceで投入）
set app.role = 'service';
insert into shift_optimization_runs(run_id, site_id, month, status) values
  (:'run1', :'site1', '2026-08', 'draft');
reset app.role;

select '=== 準備データ投入完了（sites=2, members=2, daily_reports=2, runs=1）===' as info;

-- =====================================================================
-- 2) app_user へ SET ROLE、u_a（site1担当）で検証
-- =====================================================================
set role app_user;
set app.user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';  -- u_a
reset app.role;  -- クライアント相当（service ではない）

select '################ 検証コンテキスト: SET ROLE app_user; app.user_id=u_a(site1) ################' as info;
select current_user as current_role,
       current_setting('app.user_id', true) as app_user_id,
       coalesce(current_setting('app.role', true),'(none)') as app_role;

-- --- CHECK 1: 群A SELECT — site1 が見え site2 は 0 件（担当外拒否） ---
select '--- CHECK1: daily_reports 可視件数（site1のみ見える想定）---' as info;
select site_id,
       (site_id = '11111111-1111-1111-1111-111111111111') as is_own_site,
       count(*) as visible
  from daily_reports group by site_id order by site_id;

select 'CHECK1a own-site(site1) visible' as check_name,
       count(*) as actual, 1 as expected,
       case when count(*) = 1 then 'PASS' else 'FAIL' end as result
  from daily_reports where site_id = '11111111-1111-1111-1111-111111111111';

select 'CHECK1b cross-site(site2) hidden' as check_name,
       count(*) as actual, 0 as expected,
       case when count(*) = 0 then 'PASS' else 'FAIL' end as result
  from daily_reports where site_id = '22222222-2222-2222-2222-222222222222';

-- --- CHECK 1c: 子テーブルJOIN — staff_qualifications 自現場のみ ---
select 'CHECK1c staff_qualifications own-only(=1件)' as check_name,
       count(*) as actual, 1 as expected,
       case when count(*) = 1 then 'PASS' else 'FAIL' end as result
  from staff_qualifications;

-- --- CHECK 2: 群A INSERT — 担当外 site2 への INSERT は RLS違反で失敗 ---
select '--- CHECK2: site2 への daily_reports INSERT（RLS違反で失敗する想定）---' as info;
savepoint sp_c2;
insert into daily_reports(site_id, report_date, status)
  values ('22222222-2222-2222-2222-222222222222', date '2026-08-12', 'submitted');
-- ↑ 失敗すればここは実行されずロールバックされる
rollback to sp_c2;
select 'CHECK2 cross-site INSERT rejected' as check_name,
       'RLS違反(error)を期待。上に ERROR: new row violates ... が出ていれば PASS' as note;

-- --- CHECK 2b: 自現場 site1 への INSERT は成功する想定（対照） ---
select '--- CHECK2b: 自現場 site1 への INSERT（成功する想定）---' as info;
savepoint sp_c2b;
insert into daily_reports(site_id, report_date, status)
  values ('11111111-1111-1111-1111-111111111111', date '2026-08-13', 'submitted');
select 'CHECK2b own-site INSERT allowed' as check_name,
       'エラーが出ず INSERT 0 1 なら PASS' as note;
rollback to sp_c2b;  -- 検証用なので確定させない

-- --- CHECK 3: 群B — クライアント(app_user)は shift_optimization_runs へ INSERT 不可 ---
select '--- CHECK3: 群B shift_optimization_runs INSERT（クライアント書込不可＝失敗する想定）---' as info;
savepoint sp_c3;
insert into shift_optimization_runs(site_id, month, status)
  values ('11111111-1111-1111-1111-111111111111', '2026-09', 'draft');
rollback to sp_c3;
select 'CHECK3 group-B client INSERT rejected' as check_name,
       'RLS違反(error)を期待。上に ERROR が出ていれば PASS' as note;

-- --- CHECK 3b: 群B SELECT は自現場のみ見える ---
select 'CHECK3b group-B SELECT own-site(=1件)' as check_name,
       count(*) as actual, 1 as expected,
       case when count(*) = 1 then 'PASS' else 'FAIL' end as result
  from shift_optimization_runs
  where site_id = '11111111-1111-1111-1111-111111111111';

-- =====================================================================
-- 3) u_b（site2担当）視点でも担当外(site1)が 0 件であることを対称確認
-- =====================================================================
set app.user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';  -- u_b
select '################ 検証コンテキスト: app.user_id=u_b(site2) ################' as info;
select 'CHECK4 u_b sees site2 only(=1), site1 hidden(=0)' as check_name,
       count(*) filter (where site_id='22222222-2222-2222-2222-222222222222') as site2_visible,
       count(*) filter (where site_id='11111111-1111-1111-1111-111111111111') as site1_visible,
       case when count(*) filter (where site_id='22222222-2222-2222-2222-222222222222')=1
             and count(*) filter (where site_id='11111111-1111-1111-1111-111111111111')=0
            then 'PASS' else 'FAIL' end as result
  from daily_reports;

-- =====================================================================
-- 4) service 相当（サーバ）で群Bへ INSERT できる対照確認
--    ※ app_user のまま app.role=service をセット（RLSポリシーが service を許可）
-- =====================================================================
set app.role = 'service';
select '################ 検証コンテキスト: app.role=service（サーバ相当・RLSポリシー許可）################' as info;
select current_user as current_role, current_setting('app.role', true) as app_role;

select '--- CHECK5: service で群B shift_optimization_runs へ INSERT（成功する想定）---' as info;
savepoint sp_c5;
insert into shift_optimization_runs(site_id, month, status)
  values ('11111111-1111-1111-1111-111111111111', '2026-10', 'draft');
select 'CHECK5 group-B service INSERT allowed' as check_name,
       'エラーが出ず INSERT 0 1 なら PASS' as note;
rollback to sp_c5;
reset app.role;

-- =====================================================================
-- 後片付け: 検証内容を ROLLBACK（テストデータ/ロール/RLS変更は一切残さない）
-- =====================================================================
reset role;
reset app.user_id;
reset app.role;
rollback;  -- ← BEGIN 以降の全変更(prep/role/insert)を破棄

-- ROLLBACK後、前回コミット残渣も含め site1/site2 のテストデータを確定削除（冪等・committed）
delete from shift_optimization_assignments
  where run_id in (select run_id from shift_optimization_runs
                   where site_id in ('11111111-1111-1111-1111-111111111111',
                                     '22222222-2222-2222-2222-222222222222'));
delete from shift_optimization_runs
  where site_id in ('11111111-1111-1111-1111-111111111111',
                    '22222222-2222-2222-2222-222222222222');
delete from staff_qualifications
  where staff_id in ('cccccccc-cccc-cccc-cccc-cccccccccccc',
                     'dddddddd-dddd-dddd-dddd-dddddddddddd');
delete from daily_reports
  where site_id in ('11111111-1111-1111-1111-111111111111',
                    '22222222-2222-2222-2222-222222222222');
delete from app_site_members
  where site_id in ('11111111-1111-1111-1111-111111111111',
                    '22222222-2222-2222-2222-222222222222');
delete from staff
  where id in ('cccccccc-cccc-cccc-cccc-cccccccccccc',
               'dddddddd-dddd-dddd-dddd-dddddddddddd');
delete from sites
  where id in ('11111111-1111-1111-1111-111111111111',
               '22222222-2222-2222-2222-222222222222');

-- 検証ロールも撤去（依存権限を DROP OWNED で外してから DROP ROLE・committed）
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'app_user') then
    execute 'drop owned by app_user';
    execute 'drop role app_user';
  end if;
end $$;

select '=== 検証完了。各 CHECK の result 列 / 直上の ERROR 有無で合否判定 ===' as info;
select '期待: CHECK1a=PASS,1b=PASS(0件),1c=PASS,2=ERROR発生,2b=成功,3=ERROR発生,3b=PASS,4=PASS,5=成功' as summary;
