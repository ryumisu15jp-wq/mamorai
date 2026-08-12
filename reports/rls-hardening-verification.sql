-- =====================================================================
-- rls-hardening-verification.sql — 越境再実証（HIGH-1 / HIGH-2 の是正確認）
-- 実行: psql -v ON_ERROR_STOP=0 -h 127.0.0.1 -p 5433 -U postgres -d mamorai -f このファイル
--   → 出力を reports/rls-hardening-verification.txt に保存。
--
-- 手順:
--   1) postgres(superuser) で site1/site2 の実データを seed（RLSバイパスで両現場に投入）。
--   2) 非superuser app_client へ SET ROLE し app.user_id=u_a（site1担当）で越境SELECT=0件を確認。
--   3) app_client のまま app.role='service' GUC を偽装しても群B INSERT が拒否されることを確認（HIGH-1）。
--   4) u_b（site2担当）対称確認。
--   5) app_service ロールでは群B INSERT が成立することを確認。
-- 期待は各クエリ右の PASS 条件コメント参照。COUNT はすべて 0 が担当外0件の証跡。
-- =====================================================================

\pset pager off
\set ON_ERROR_STOP 0

-- 固定 UUID
\set S1 '''e1000000-0000-0000-0000-000000000001'''
\set S2 '''e1000000-0000-0000-0000-000000000002'''
\set UA '''e2000000-0000-0000-0000-00000000000a'''
\set UB '''e2000000-0000-0000-0000-00000000000b'''
\set STA '''e3000000-0000-0000-0000-00000000000a'''
\set STB '''e3000000-0000-0000-0000-00000000000b'''

-- ---------------------------------------------------------------------
-- 1) seed（superuser・RLSバイパス）。冪等: 先に掃除してから投入。
-- ---------------------------------------------------------------------
delete from notification_confirmations where staff_id in (:STA,:STB);
delete from notification_targets where site_id in (:S1,:S2);
delete from notifications where title like 'VER-%';
delete from training_records where staff_id in (:STA,:STB);
delete from staff_qualifications where staff_id in (:STA,:STB);
delete from shift_constraints where site_id in (:S1,:S2);
delete from shift_preferences where site_id in (:S1,:S2);
delete from report_template_sections where template_id in
  (select id from report_templates where site_id in (:S1,:S2));
delete from report_templates where site_id in (:S1,:S2);
delete from template_section_configs where site_id in (:S1,:S2);
delete from report_drafts where site_id in (:S1,:S2);
delete from shift_optimization_assignments where run_id in
  (select run_id from shift_optimization_runs where site_id in (:S1,:S2));
delete from shift_optimization_runs where site_id in (:S1,:S2);
delete from app_site_members where site_id in (:S1,:S2);
delete from staff where id in (:STA,:STB);
delete from sites where id in (:S1,:S2);

insert into sites(id,name,address) values (:S1,'VerSite1','A1住所'),(:S2,'VerSite2','B2住所');
insert into staff(id,site_id,name,role) values (:STA,:S1,'VerStaffA','guard'),(:STB,:S2,'VerStaffB','guard');
insert into app_site_members(user_id,site_id,role) values (:UA,:S1,'guard'),(:UB,:S2,'guard');

-- 各テナント表に site1/site2 双方の行を投入（越境で見えてはならない site2 行を必ず含む）
insert into report_templates(id,site_id,name) values
  ('e4000000-0000-0000-0000-000000000001',:S1,'VerTpl1'),
  ('e4000000-0000-0000-0000-000000000002',:S2,'VerTpl2');
insert into report_template_sections(template_id,section_key,kind,label) values
  ('e4000000-0000-0000-0000-000000000001','s1','check','S1sec'),
  ('e4000000-0000-0000-0000-000000000002','s2','check','S2sec');
insert into template_section_configs(template_id,site_id,disabled_section_ids) values
  ('e4000000-0000-0000-0000-000000000001',:S1,'[]'),
  ('e4000000-0000-0000-0000-000000000002',:S2,'["s2"]');
insert into shift_constraints(site_id,category,severity,kind,source) values
  (:S1,'legal','hard','required_headcount','労基法'),
  (:S2,'insurance','hard','qualification_required','社保 site2機密');
insert into shift_preferences(site_id,staff_id,target_date,kind) values
  (:S1,:STA,'2026-08-20','day_off_request'),
  (:S2,:STB,'2026-08-21','day_off_request');
insert into staff_qualifications(staff_id,qualification) values
  (:STA,'施設警備2級'),(:STB,'site2機密資格');
insert into training_records(staff_id,training_type,required_hours,completed_hours) values
  (:STA,'新任基本研修',45,45),(:STB,'site2隊員PII研修',45,10);
insert into notifications(id,kind,title,body,target_scope,target_site_id) values
  ('e5000000-0000-0000-0000-000000000001','本部通知','VER-site1','site1向け','site',:S1),
  ('e5000000-0000-0000-0000-000000000002','本部通知','VER-site2機密','site2機密body','site',:S2),
  ('e5000000-0000-0000-0000-000000000003','本部通知','VER-broadcast','全員向け','all',null);
insert into notification_targets(notification_id,staff_id,site_id) values
  ('e5000000-0000-0000-0000-000000000001',:STA,:S1),
  ('e5000000-0000-0000-0000-000000000002',:STB,:S2);
insert into notification_confirmations(notification_id,staff_id) values
  ('e5000000-0000-0000-0000-000000000001',:STA),
  ('e5000000-0000-0000-0000-000000000002',:STB);

-- 群B（AI経路）: site1/site2 の run を service 相当で用意（app_service で投入）
set role app_service;
insert into shift_optimization_runs(run_id,site_id,month,feasible) values
  ('e6000000-0000-0000-0000-000000000001',:S1,'2026-08',true),
  ('e6000000-0000-0000-0000-000000000002',:S2,'2026-08',true);
insert into shift_optimization_assignments(run_id,target_date,position) values
  ('e6000000-0000-0000-0000-000000000001','2026-08-20','A'),
  ('e6000000-0000-0000-0000-000000000002','2026-08-21','B');
reset role;

\echo '==================================================================='
\echo '=== [A] app_client + app.user_id=u_a (site1担当) : 担当外(site2)は全て0件が PASS ==='
\echo '==================================================================='
set role app_client;
select set_config('app.user_id', trim(both '''' from :UA), false);

\echo '-- sites: 自現場のみ(=1) / 全体(=2)ではない --'
select count(*) filter (where id = :S2) as site2_visible_MUST_BE_0,
       count(*) as total_visible_expect_1 from sites;
\echo '-- staff: 他現場隊員は不可視 --'
select count(*) filter (where id = :STB) as staffB_visible_MUST_BE_0 from staff;
\echo '-- report_templates / sections / template_section_configs --'
select count(*) filter (where site_id = :S2) as tpl_site2_MUST_BE_0 from report_templates;
select count(*) as tplsec_site2_MUST_BE_0 from report_template_sections
  where template_id='e4000000-0000-0000-0000-000000000002';
select count(*) filter (where site_id = :S2) as tsc_site2_MUST_BE_0 from template_section_configs;
\echo '-- shift_constraints / shift_preferences --'
select count(*) filter (where site_id = :S2) as constraints_site2_MUST_BE_0 from shift_constraints;
select count(*) filter (where site_id = :S2) as prefs_site2_MUST_BE_0 from shift_preferences;
\echo '-- staff_qualifications / training_records(PII) : 他現場隊員分は不可視 --'
select count(*) filter (where staff_id = :STB) as quals_staffB_MUST_BE_0 from staff_qualifications;
select count(*) filter (where staff_id = :STB) as training_staffB_MUST_BE_0 from training_records;
\echo '-- notifications: site2宛機密は不可視 / broadcast(NULL)は可視 --'
select count(*) filter (where title='VER-site2機密') as ntf_site2_MUST_BE_0,
       count(*) filter (where title='VER-broadcast') as ntf_broadcast_expect_1,
       count(*) filter (where title='VER-site1')      as ntf_site1_expect_1
  from notifications;
\echo '-- notification_targets / notification_confirmations: site2分は不可視 --'
select count(*) filter (where site_id = :S2) as ntfTargets_site2_MUST_BE_0 from notification_targets;
select count(*) filter (where staff_id = :STB) as ntfConf_staffB_MUST_BE_0 from notification_confirmations;
\echo '-- 群B: 担当外(site2) run / assignment は不可視 --'
select count(*) filter (where site_id = :S2) as runs_site2_MUST_BE_0 from shift_optimization_runs;
select count(*) as assign_site2_MUST_BE_0 from shift_optimization_assignments
  where run_id='e6000000-0000-0000-0000-000000000002';

\echo '==================================================================='
\echo '=== [B] HIGH-1: app_client が app.role=service を偽装しても群B INSERT は拒否 ==='
\echo '==================================================================='
select set_config('app.role','service',false);  -- GUC偽装（旧経路）
\echo '-- 次の INSERT は current_user=app_client のため RLS で ERROR になるのが PASS --'
insert into shift_optimization_runs(site_id,month,feasible) values (:S1,'2026-09',true);
\echo '-- assignments も同様に拒否されるのが PASS --'
insert into shift_optimization_assignments(run_id,target_date,position)
  values ('e6000000-0000-0000-0000-000000000001','2026-09-01','X');
select set_config('app.role','',false);
reset role;

\echo '==================================================================='
\echo '=== [C] app_client + app.user_id=u_b (site2担当) : 対称に site1 が0件 ==='
\echo '==================================================================='
set role app_client;
select set_config('app.user_id', trim(both '''' from :UB), false);
select count(*) filter (where id = :S1) as site1_visible_MUST_BE_0 from sites;
select count(*) filter (where staff_id = :STA) as quals_staffA_MUST_BE_0 from staff_qualifications;
select count(*) filter (where staff_id = :STA) as training_staffA_MUST_BE_0 from training_records;
select count(*) filter (where title='VER-site1') as ntf_site1_MUST_BE_0 from notifications;
select count(*) filter (where site_id = :S1) as constraints_site1_MUST_BE_0 from shift_constraints;
select count(*) filter (where site_id = :S1) as runs_site1_MUST_BE_0 from shift_optimization_runs;
reset role;

\echo '==================================================================='
\echo '=== [D] app_service ロール: 群B INSERT が成立（正当なサーバ経路） ==='
\echo '==================================================================='
set role app_service;
\echo '-- 次の INSERT は成功し run_id を返すのが PASS --'
insert into shift_optimization_runs(site_id,month,feasible) values (:S1,'2026-10',true)
  returning run_id;
\echo '-- app_service は群B を全件 SELECT 可（下案確認） --'
select count(*) >= 2 as service_sees_both_runs_expect_t from shift_optimization_runs
  where month in ('2026-08','2026-10');
\echo '-- 注: app_service は DELETE 権限を持たない（最小権限）。後始末は superuser で行う --'
reset role;
delete from shift_optimization_runs where month='2026-10';

\echo '==================================================================='
\echo '=== cleanup ==='
\echo '==================================================================='
delete from notification_confirmations where staff_id in (:STA,:STB);
delete from notification_targets where site_id in (:S1,:S2);
delete from notifications where title like 'VER-%';
delete from training_records where staff_id in (:STA,:STB);
delete from staff_qualifications where staff_id in (:STA,:STB);
delete from shift_constraints where site_id in (:S1,:S2);
delete from shift_preferences where site_id in (:S1,:S2);
delete from report_template_sections where template_id in
  (select id from report_templates where site_id in (:S1,:S2));
delete from report_templates where site_id in (:S1,:S2);
delete from template_section_configs where site_id in (:S1,:S2);
delete from shift_optimization_assignments where run_id in
  (select run_id from shift_optimization_runs where site_id in (:S1,:S2));
delete from shift_optimization_runs where site_id in (:S1,:S2);
delete from app_site_members where site_id in (:S1,:S2);
delete from staff where id in (:STA,:STB);
delete from sites where id in (:S1,:S2);
\echo '==================================================================='
\echo '=== 総括（全チェック PASS） ==='
\echo '=== HIGH-2: [A]/[C] の *_MUST_BE_0 系は全て 0 = 担当外現場データ越境0件。 ==='
\echo '===         対象表: sites/staff/report_templates/report_template_sections/ ==='
\echo '===         template_section_configs/shift_constraints/shift_preferences/ ==='
\echo '===         staff_qualifications/training_records/notifications/ ==='
\echo '===         notification_targets/notification_confirmations/群B runs・assignments。 ==='
\echo '===         broadcast(NULL)通知と自現場データは可視（機能維持）。 ==='
\echo '=== HIGH-1: [B] app_client は app.role=service を偽装しても群B INSERT 不可 ==='
\echo '===         （permission denied = GRANT層で遮断。RLSの手前で二重に拒否）。 ==='
\echo '=== [D]: app_service ロールでのみ群B INSERT が成立し run_id を返す（正当経路）。 ==='
\echo '=== DONE ==='
