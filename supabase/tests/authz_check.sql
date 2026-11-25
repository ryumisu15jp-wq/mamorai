-- 0418_authz_hardening の検証シナリオ（run_jyoban_rls_check.sh から実行）。各行 PASS/FAIL を出力する。
-- 前提: 0400〜0418 適用済み、jyoban_supabase_stub.sql 適用済み。氏名はすべて架空。
create table if not exists auth.users(id uuid primary key, email text);
insert into auth.users values
 ('11111111-0000-0000-0000-000000000001','admin@a.example'),
 ('11111111-0000-0000-0000-000000000002','hq@a.example'),
 ('11111111-0000-0000-0000-000000000003','branch@a.example'),
 ('11111111-0000-0000-0000-000000000004','edu@a.example'),
 ('22222222-0000-0000-0000-000000000001','admin@b.example');
insert into companies(id,name,code) values
 ('a0000000-0000-0000-0000-00000000000a','A社','AAA-0001'),
 ('b0000000-0000-0000-0000-00000000000b','B社','BBB-0001');
insert into sites(id,name,code,company_id,report_token,shared_device_enabled) values
 ('a1000000-0000-0000-0000-000000000001','A社 現場1','A-01','a0000000-0000-0000-0000-00000000000a','tokenA1xxxxxxxxxxxxxxxxx',false),
 ('a2000000-0000-0000-0000-000000000002','A社 現場2','A-02','a0000000-0000-0000-0000-00000000000a','tokenA2xxxxxxxxxxxxxxxxx',false),
 ('b1000000-0000-0000-0000-000000000001','B社 現場1','B-01','b0000000-0000-0000-0000-00000000000b','tokenB1xxxxxxxxxxxxxxxxx',false);
insert into app_site_credentials(company_code,site_code,pin_hash,site_id,company_id,site_name) values
 ('AAA-0001','A-01',extensions.crypt('2468',extensions.gen_salt('bf')),'a1000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-00000000000a','A社 現場1');
insert into staff(id,company_id,staff_no,name,pin_hash,is_active,site_id) values
 ('5a000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-00000000000a','90001','試験 一郎',extensions.crypt('1234',extensions.gen_salt('bf')),true,'a1000000-0000-0000-0000-000000000001'),
 ('5a000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-00000000000a','90002','試験 二郎',extensions.crypt('5678',extensions.gen_salt('bf')),true,'a1000000-0000-0000-0000-000000000001'),
 ('5a000000-0000-0000-0000-000000000003','a0000000-0000-0000-0000-00000000000a','90003','試験 三郎',extensions.crypt('1357',extensions.gen_salt('bf')),true,'a1000000-0000-0000-0000-000000000001'),
 ('5b000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-00000000000b','90001','他社 太郎',extensions.crypt('1111',extensions.gen_salt('bf')),true,'b1000000-0000-0000-0000-000000000001');
insert into staff_sites(staff_id,site_id) values
 ('5a000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001'),
 ('5a000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000002') on conflict do nothing;
insert into app_profiles(user_id,role,company_id) values
 ('11111111-0000-0000-0000-000000000001','company_admin','a0000000-0000-0000-0000-00000000000a'),
 ('11111111-0000-0000-0000-000000000002','hq_operator','a0000000-0000-0000-0000-00000000000a'),
 ('11111111-0000-0000-0000-000000000003','company_manager','a0000000-0000-0000-0000-00000000000a'),
 ('11111111-0000-0000-0000-000000000004','education_center','a0000000-0000-0000-0000-00000000000a'),
 ('22222222-0000-0000-0000-000000000001','company_admin','b0000000-0000-0000-0000-00000000000b');
-- 支店(003)の担当は A-02 だけ
insert into app_profile_sites(user_id,site_id,company_id) values
 ('11111111-0000-0000-0000-000000000003','a2000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-00000000000a');
-- 現場承認済みの休暇申請: A-01 と A-02 に1件ずつ（氏名は架空）
insert into leave_requests(id,company_id,site_id,staff_no,staff_name,date_from,date_to,days,status,submitted_at) values
 ('1e000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-00000000000a','a1000000-0000-0000-0000-000000000001','90001','試験 一郎','2026-12-01','2026-12-01',1,'現場承認',current_date),
 ('1e000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-00000000000a','a2000000-0000-0000-0000-000000000002','90002','試験 二郎','2026-12-02','2026-12-02',1,'現場承認',current_date);
grant select on companies, app_profiles, sites to authenticated;
create table t_r(n int, name text, ok boolean, detail text);
grant insert, select on t_r to anon, authenticated;

-- 1 anon は company_* / platform_* / site_staff_pins を実行できない
set role anon;
do $$ declare n int := 0; st text; begin
  begin perform company_register_staff('1','x',null,null,'隊員',null,null); exception when others then get stacked diagnostics st = returned_sqlstate; if st = '42501' then n := n + 1; end if; end;
  begin perform company_create_site('x','x','x','1234'); exception when others then get stacked diagnostics st = returned_sqlstate; if st = '42501' then n := n + 1; end if; end;
  begin perform company_list_leave(); exception when others then get stacked diagnostics st = returned_sqlstate; if st = '42501' then n := n + 1; end if; end;
  begin perform company_approve_leave('1e000000-0000-0000-0000-000000000001', '{}'::jsonb); exception when others then get stacked diagnostics st = returned_sqlstate; if st = '42501' then n := n + 1; end if; end;
  begin perform company_reject_leave('1e000000-0000-0000-0000-000000000001', 'x'); exception when others then get stacked diagnostics st = returned_sqlstate; if st = '42501' then n := n + 1; end if; end;
  begin perform platform_create_company('x','x'); exception when others then get stacked diagnostics st = returned_sqlstate; if st = '42501' then n := n + 1; end if; end;
  begin perform platform_link_company_admin('11111111-0000-0000-0000-000000000001','a0000000-0000-0000-0000-00000000000a'); exception when others then get stacked diagnostics st = returned_sqlstate; if st = '42501' then n := n + 1; end if; end;
  begin perform * from site_staff_pins('a1000000-0000-0000-0000-000000000001'); exception when others then get stacked diagnostics st = returned_sqlstate; if st = '42501' then n := n + 1; end if; end;
  insert into t_r values (1,'anon は会社・運営向けの関数を呼べない（実行権限なし）', n = 8, n::text);
end $$;
reset role;

set role authenticated;
-- 2 本社PC・教育センター・支店は、勤務員の登録・現場の作成ができない
select set_config('request.jwt.claim.sub', '11111111-0000-0000-0000-000000000002', false);
do $$ declare n int := 0; begin
  begin perform company_register_staff('77001','侵入 試験',null,null,'隊員',null,'1234'); exception when others then if sqlerrm like '%管理者のみ%' then n := n + 1; end if; end;
  begin perform company_create_site('侵入現場','X-99','x','1234'); exception when others then if sqlerrm like '%管理者のみ%' then n := n + 1; end if; end;
  insert into t_r values (2,'本社PCは勤務員の登録・現場の作成ができない', n = 2, n::text);
end $$;
select set_config('request.jwt.claim.sub', '11111111-0000-0000-0000-000000000004', false);
do $$ declare n int := 0; begin
  begin perform company_register_staff('77002','侵入 試験',null,null,'隊員',null,'1234'); exception when others then if sqlerrm like '%管理者のみ%' then n := n + 1; end if; end;
  begin perform company_create_site('侵入現場','X-98','x','1234'); exception when others then if sqlerrm like '%管理者のみ%' then n := n + 1; end if; end;
  insert into t_r values (3,'教育センターは勤務員の登録・現場の作成ができない', n = 2, n::text);
end $$;
select set_config('request.jwt.claim.sub', '11111111-0000-0000-0000-000000000003', false);
do $$ declare n int := 0; begin
  begin perform company_register_staff('77003','侵入 試験',null,null,'隊員',null,'1234'); exception when others then if sqlerrm like '%管理者のみ%' then n := n + 1; end if; end;
  begin perform company_create_site('侵入現場','X-97','x','1234'); exception when others then if sqlerrm like '%管理者のみ%' then n := n + 1; end if; end;
  insert into t_r values (4,'支店は勤務員の登録・現場の作成ができない', n = 2, n::text);
end $$;
reset role;
do $$ begin
  insert into t_r values (5,'拒否された操作は何も作らない', not exists (select 1 from staff where staff_no like '770%') and not exists (select 1 from sites where code like 'X-9%'), '');
end $$;
set role authenticated;
-- 6 管理者はできる（他社の管理者は自社の中だけ）
select set_config('request.jwt.claim.sub', '11111111-0000-0000-0000-000000000001', false);
do $$ begin
  perform company_register_staff('77100','管理 試験',null,null,'隊員',null,'1234');
  perform company_create_site('管理現場','A-77','x','1234');
  insert into t_r values (6,'管理者は勤務員の登録・現場の作成ができる', true, '');
exception when others then insert into t_r values (6,'管理者は勤務員の登録・現場の作成ができる', false, sqlerrm); end $$;
-- 7 休暇: 本社PC・教育センターは一覧が空で、承認・却下もできない
select set_config('request.jwt.claim.sub', '11111111-0000-0000-0000-000000000002', false);
do $$ declare n int := 0; begin
  begin perform company_approve_leave('1e000000-0000-0000-0000-000000000001', '{}'::jsonb); exception when others then n := n + 1; end;
  begin perform company_reject_leave('1e000000-0000-0000-0000-000000000002', 'x'); exception when others then n := n + 1; end;
  insert into t_r values (7,'本社PCは休暇の一覧が空で、承認・却下もできない', (select count(*) from company_list_leave()) = 0 and n = 2, n::text);
end $$;
select set_config('request.jwt.claim.sub', '11111111-0000-0000-0000-000000000004', false);
do $$ declare n int := 0; begin
  begin perform company_approve_leave('1e000000-0000-0000-0000-000000000001', '{}'::jsonb); exception when others then n := n + 1; end;
  insert into t_r values (8,'教育センターは休暇の一覧が空で、承認もできない', (select count(*) from company_list_leave()) = 0 and n = 1, n::text);
end $$;
-- 9 支店（担当=A-02）: 担当現場の休暇だけ見えて承認でき、担当外は承認できない
select set_config('request.jwt.claim.sub', '11111111-0000-0000-0000-000000000003', false);
do $$ declare n int := 0; begin
  begin perform company_approve_leave('1e000000-0000-0000-0000-000000000001', '{}'::jsonb); exception when others then n := n + 1; end;
  perform company_approve_leave('1e000000-0000-0000-0000-000000000002', '{"by":"試験"}'::jsonb);
  insert into t_r values (9,'支店は担当現場の休暇だけ見えて承認でき、担当外は承認できない',
    (select count(*) from company_list_leave()) = 1 and n = 1 and (select status from company_list_leave() limit 1) = '会社承認', n::text);
exception when others then insert into t_r values (9,'支店は担当現場の休暇だけ見えて承認でき、担当外は承認できない', false, sqlerrm); end $$;
-- 10 管理者は自社の休暇を承認でき、他社の管理者は見えず承認できない
select set_config('request.jwt.claim.sub', '22222222-0000-0000-0000-000000000001', false);
do $$ declare n int := 0; begin
  begin perform company_approve_leave('1e000000-0000-0000-0000-000000000001', '{}'::jsonb); exception when others then n := n + 1; end;
  insert into t_r values (10,'他社の管理者は休暇を見られず承認できない', (select count(*) from company_list_leave()) = 0 and n = 1, n::text);
end $$;
select set_config('request.jwt.claim.sub', '11111111-0000-0000-0000-000000000001', false);
do $$ begin
  perform company_approve_leave('1e000000-0000-0000-0000-000000000001', '{"by":"管理"}'::jsonb);
  insert into t_r values (11,'管理者は自社の休暇を承認できる（一覧は自社の全件）', (select count(*) from company_list_leave()) = 2, '');
exception when others then insert into t_r values (11,'管理者は自社の休暇を承認できる（一覧は自社の全件）', false, sqlerrm); end $$;
reset role;

select n||'. '||case when ok then 'PASS' else 'FAIL' end||'  '||name||case when ok then '' else '  ['||left(coalesce(detail,''),200)||']' end from t_r order by n;
