-- 0414_worker_profile の検証シナリオ（run_jyoban_rls_check.sh から実行）。各行 PASS/FAIL を出力する。
-- 前提: 0400〜0414 適用済み、jyoban_supabase_stub.sql 適用済み。氏名はすべて架空。
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
-- 現在時刻(JST)の1時間後に始まる勤務枠（受付時間内）
insert into jyoban_slots(id,company_id,site_id,name,work_start,work_end,onduty_required,onduty_due,offduty_required,offduty_due)
select v.id::uuid, v.cid::uuid, v.sid::uuid, '日勤', to_char(t + interval '60 minutes','HH24:MI'), to_char(t + interval '8 hours','HH24:MI'),
       true, to_char(t + interval '45 minutes','HH24:MI'), true, to_char(t + interval '8 hours','HH24:MI')
  from (select date_trunc('minute', now() at time zone 'Asia/Tokyo') t) x,
       (values ('c1000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-00000000000a','a1000000-0000-0000-0000-000000000001'),
               ('c2000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-00000000000a','a2000000-0000-0000-0000-000000000002'),
               ('cb000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-00000000000b','b1000000-0000-0000-0000-000000000001')) v(id,cid,sid);

insert into staff_sites(staff_id,site_id) values
 ('5a000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001'),
 ('5a000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000002'),
 ('5b000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000001') on conflict do nothing;
insert into app_profiles(user_id,role,company_id) values
 ('11111111-0000-0000-0000-000000000001','company_admin','a0000000-0000-0000-0000-00000000000a'),
 ('11111111-0000-0000-0000-000000000002','hq_operator','a0000000-0000-0000-0000-00000000000a'),
 ('11111111-0000-0000-0000-000000000003','company_manager','a0000000-0000-0000-0000-00000000000a'),
 ('11111111-0000-0000-0000-000000000004','education_center','a0000000-0000-0000-0000-00000000000a'),
 ('22222222-0000-0000-0000-000000000001','company_admin','b0000000-0000-0000-0000-00000000000b');
insert into app_profile_sites(user_id,site_id,company_id) values
 ('11111111-0000-0000-0000-000000000003','a2000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-00000000000a');
grant select on companies, app_profiles, sites to authenticated;
create table t_r(n int, name text, ok boolean, detail text);
grant insert, select on t_r to anon, authenticated;
create table t_v(k text, v text);
grant insert, select on t_v to anon, authenticated;

-- 承認済みの前提データ（スーパーユーザーで投入）: 90001 の基本情報・顔写真・資格1件（証書の写真つき）
insert into staff_profiles(staff_id, company_id, furigana, postal_code, address) values
 ('5a000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-00000000000a','しけん いちろう','100-0001','架空県架空市1-2-3');
insert into staff_credentials(id, company_id, staff_id, kind, label, obtained_on, expires_on) values
 ('cc000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-00000000000a','5a000000-0000-0000-0000-000000000001','shinnin','新任教育','2026-01-10','2027-01-09');
insert into staff_images(company_id, staff_id, kind, mime, data) values
 ('a0000000-0000-0000-0000-00000000000a','5a000000-0000-0000-0000-000000000001','face','image/png', decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==','base64'));
insert into staff_images(company_id, staff_id, kind, credential_id, mime, data) values
 ('a0000000-0000-0000-0000-00000000000a','5a000000-0000-0000-0000-000000000001','credential','cc000000-0000-0000-0000-000000000001','image/png', decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==','base64'));
insert into t_v values ('cred1','cc000000-0000-0000-0000-000000000001');
-- 勤務員2人（90001=自現場A-01、90002=A-02）が本人登録し、現場PC(A-01)がログイン
set role anon;
do $$ declare r record; begin
  select * into r from jyoban_register_device('tokenA1xxxxxxxxxxxxxxxxx','90001','1234','ua'); insert into t_v values ('dev1', r.device_secret);
  select * into r from jyoban_register_device('tokenA2xxxxxxxxxxxxxxxxx','90002','5678','ua'); insert into t_v values ('dev2', r.device_secret);
  select * into r from app_site_open_session('AAA-0001','A-01','2468','受付PC'); insert into t_v values ('sess', r.session_token);
end $$;
-- 1 連絡先（電話・メール・緊急連絡先）は承認なしで即反映（架空の値）
do $$ declare j jsonb; begin
  perform worker_contact_save((select v from t_v where k='dev1'), '090-0000-0000', 'test@example.invalid', '架空 花子', '配偶者', '08000000000');
  j := worker_profile_get((select v from t_v where k='dev1'));
  insert into t_r values (1,'連絡先は承認なしで即反映される',
    j->>'phone' = '09000000000' and j->>'email' = 'test@example.invalid' and j->'emergency'->>'name' = '架空 花子' and j->'emergency'->>'phone' = '08000000000', j::text);
exception when others then insert into t_r values (1,'連絡先は承認なしで即反映される', false, sqlerrm); end $$;
-- 2 形式が不正な電話・メール・緊急連絡先は拒否
do $$ declare n int := 0; begin
  begin perform worker_contact_save((select v from t_v where k='dev1'), '123', null, null, null, null); exception when others then n := n + 1; end;
  begin perform worker_contact_save((select v from t_v where k='dev1'), null, 'not-an-email', null, null, null); exception when others then n := n + 1; end;
  begin perform worker_contact_save((select v from t_v where k='dev1'), null, null, null, null, '12'); exception when others then n := n + 1; end;
  insert into t_r values (2,'不正な電話・メール・緊急連絡先は拒否', n = 3, n::text);
end $$;
-- 3 学歴・業務経歴は即反映、年・期間の形式と件数を検査
do $$ declare n int := 0; j jsonb; many jsonb; begin
  perform worker_career_save((select v from t_v where k='dev1'),
    '[{"school":"架空大学","entered_year":2010,"graduated_year":2014}]'::jsonb,
    '[{"company":"架空商事","detail":"事務","from":"2015-04","to":"2020-03"}]'::jsonb);
  j := worker_profile_get((select v from t_v where k='dev1'));
  begin perform worker_career_save((select v from t_v where k='dev1'), '[{"school":"X","entered_year":1800}]'::jsonb, '[]'::jsonb); exception when others then n := n + 1; end;
  begin perform worker_career_save((select v from t_v where k='dev1'), '[]'::jsonb, '[{"company":"Y","from":"2020/04"}]'::jsonb); exception when others then n := n + 1; end;
  select jsonb_agg('{"school":"S"}'::jsonb) into many from generate_series(1, 11);
  begin perform worker_career_save((select v from t_v where k='dev1'), many, '[]'::jsonb); exception when others then n := n + 1; end;
  insert into t_r values (3,'学歴・業務経歴は即反映され、不正な年・期間・件数は拒否',
    j->'education'->0->>'school' = '架空大学' and j->'work_history'->0->>'company' = '架空商事' and n = 3, n::text);
exception when others then insert into t_r values (3,'学歴・業務経歴は即反映され、不正な年・期間・件数は拒否', false, sqlerrm); end $$;
-- 4 承認が要る項目を直接書く旧RPCは使えない（承認の迂回を防ぐ）
do $$ declare n int := 0; begin
  begin perform worker_profile_save((select v from t_v where k='dev1'), 'a', '100-0001', '改ざん', null); exception when others then n := n + 1; end;
  begin perform worker_credential_save((select v from t_v where k='dev1'), null, 'genin', 'x', null, null); exception when others then n := n + 1; end;
  begin perform worker_credential_delete((select v from t_v where k='dev1'), (select v from t_v where k='cred1')::uuid); exception when others then n := n + 1; end;
  begin perform worker_image_save((select v from t_v where k='dev1'), 'face', null, 'image/png', 'AAAA'); exception when others then n := n + 1; end;
  begin perform worker_image_delete((select v from t_v where k='dev1'), 'face', null); exception when others then n := n + 1; end;
  insert into t_r values (4,'承認が要る項目の直接書き込み（旧RPC）は拒否', n = 5, n::text);
end $$;
-- 5 承認済みの写真は本人が読める
do $$ declare png text := 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='; begin
  insert into t_r values (5,'承認済みの顔写真・証書は本人が読める（改行なし）',
    (worker_profile_get((select v from t_v where k='dev1'))->>'has_face')::boolean
    and decode(worker_image_get((select v from t_v where k='dev1'),'face') ->> 'base64', 'base64') = decode(png, 'base64')
    and (worker_image_get((select v from t_v where k='dev1'),'face') ->> 'base64') not like '%'||chr(10)||'%'
    and (worker_image_get((select v from t_v where k='dev1'),'credential', (select v from t_v where k='cred1')::uuid) ->> 'mime') = 'image/png', '');
exception when others then insert into t_r values (5,'承認済みの顔写真・証書は本人が読める（改行なし）', false, sqlerrm); end $$;
-- 6 申請を出せる（承認までは正式な値は変わらない）。同じ項目の再申請は置き換え。不正な申請は拒否
do $$ declare png text := 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='; id1 uuid; id2 uuid; n int := 0; j jsonb; begin
  id1 := worker_request_submit((select v from t_v where k='dev1'), 'name', '{"name":"試験 一郎（仮）","furigana":"しけん"}'::jsonb);
  id2 := worker_request_submit((select v from t_v where k='dev1'), 'name', '{"name":"試験 一郎改","furigana":"しけん いちろう"}'::jsonb);
  insert into t_v values ('r_name', id2::text);
  insert into t_v values ('r_addr', worker_request_submit((select v from t_v where k='dev1'), 'address', '{"postal_code":"1000002","address":"架空県架空市9-9-9","nearest_station":"架空駅"}'::jsonb)::text);
  insert into t_v values ('r_hon', worker_request_submit((select v from t_v where k='dev1'), 'honseki', '{"pref":"東京都"}'::jsonb)::text);
  insert into t_v values ('r_face', worker_request_submit((select v from t_v where k='dev1'), 'face', '{}'::jsonb, png, 'image/png')::text);
  insert into t_v values ('r_id', worker_request_submit((select v from t_v where k='dev1'), 'id_doc', '{"doc_type":"license"}'::jsonb, png, 'image/png')::text);
  insert into t_v values ('r_cnew', worker_request_submit((select v from t_v where k='dev1'), 'credential', '{"action":"upsert","kind":"genin","label":"現任教育","obtained_on":"2026-06-01","expires_on":"2027-05-31"}'::jsonb, png, 'image/png')::text);
  insert into t_v values ('r_cdel', worker_request_submit((select v from t_v where k='dev1'), 'credential', jsonb_build_object('action','delete','id',(select v from t_v where k='cred1')))::text);
  insert into t_v values ('r_addr2', worker_request_submit((select v from t_v where k='dev2'), 'address', '{"address":"架空県別市1-1-1"}'::jsonb)::text);
  begin perform worker_request_submit((select v from t_v where k='dev1'), 'face', '{}'::jsonb); exception when others then n := n + 1; end;
  begin perform worker_request_submit((select v from t_v where k='dev1'), 'id_doc', '{"doc_type":"mynumber"}'::jsonb, png, 'image/png'); exception when others then n := n + 1; end;
  begin perform worker_request_submit((select v from t_v where k='dev1'), 'honseki', '{"pref":"どこか"}'::jsonb); exception when others then n := n + 1; end;
  begin perform worker_request_submit((select v from t_v where k='dev1'), 'address', '{"address":"x","postal_code":"12"}'::jsonb); exception when others then n := n + 1; end;
  begin perform worker_request_submit((select v from t_v where k='dev1'), 'face', '{}'::jsonb, 'AAAA', 'application/pdf'); exception when others then n := n + 1; end;
  j := worker_profile_get((select v from t_v where k='dev1'));
  insert into t_r values (6,'申請を出せる（正式な値は変わらず、同じ項目は置き換え、不正な申請は拒否）',
    j->>'name' = '試験 一郎' and j->>'address' = '架空県架空市1-2-3' and n = 5
    and (select count(*) from jsonb_array_elements(j->'requests') e where e->>'category' = 'name' and e->>'status' = 'pending') = 1
    and (select count(*) from jsonb_array_elements(j->'requests') e where e->>'status' = 'pending') = 7, n::text || ' / ' || jsonb_array_length(j->'requests')::text);
exception when others then insert into t_r values (6,'申請を出せる（正式な値は変わらず、同じ項目は置き換え、不正な申請は拒否）', false, sqlerrm); end $$;
-- 6b 他人の申請は取り下げられない／自分の申請は取り下げられる
do $$ declare j jsonb; begin
  perform worker_request_withdraw((select v from t_v where k='dev2'), (select v from t_v where k='r_hon')::uuid);
  j := worker_profile_get((select v from t_v where k='dev1'));
  insert into t_r values (7,'他人の申請は取り下げられない', (select e->>'status' from jsonb_array_elements(j->'requests') e where e->>'id' = (select v from t_v where k='r_hon')) = 'pending', '');
  perform worker_request_withdraw((select v from t_v where k='dev1'), (select v from t_v where k='r_hon')::uuid);
  j := worker_profile_get((select v from t_v where k='dev1'));
  insert into t_r values (8,'自分の申請は取り下げられる', not exists (select 1 from jsonb_array_elements(j->'requests') e where e->>'id' = (select v from t_v where k='r_hon')), '');
exception when others then insert into t_r values (8,'取り下げ', false, sqlerrm); end $$;
-- 7 本人以外（端末シークレットなし）は取得できない
do $$ begin
  perform worker_profile_get('x');
  insert into t_r values (9,'端末シークレットなしは取得できない', false, 'ok?');
exception when others then insert into t_r values (9,'端末シークレットなしは取得できない', true, sqlerrm); end $$;
-- 8 表を直接は読めない
do $$ begin
  perform 1 from staff_images limit 1;
  insert into t_r values (10,'表を直接は読めない', false, 'ok?');
exception when others then insert into t_r values (10,'表を直接は読めない', sqlstate = '42501', sqlerrm); end $$;
-- 9 現場PCは自現場の勤務員だけ（他現場の勤務員は不可）、画像も見られる
do $$ declare n int := 0; begin
  begin perform sitepc_staff_profile((select v from t_v where k='sess'), '90002'); exception when others then n := n + 1; end;
  insert into t_r values (11,'現場PCは自現場の勤務員の情報と画像を見られる（他現場は不可）',
    n = 1 and (sitepc_staff_profile((select v from t_v where k='sess'), '90001')->>'address') = '架空県架空市1-2-3'
    and (sitepc_staff_image((select v from t_v where k='sess'), '90001', 'face') ->> 'mime') = 'image/png', n::text);
end $$;
reset role;
-- 10 現場PCが見た記録が残る
do $$ begin
  insert into t_r values (12,'現場PCが見たら記録が残る', (select count(*) from staff_profile_views where viewer_kind='site' and staff_id='5a000000-0000-0000-0000-000000000001') = 2, '');
end $$;
-- 11〜15 会社アカウント
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-0000-0000-0000-000000000002', false);
do $$ begin
  insert into t_r values (13,'本社PCは会社の全勤務員を見られ、記録が残る',
    (company_staff_profile('90001')->>'name') = '試験 一郎' and (company_staff_profile('90002')->>'name') = '試験 二郎'
    and (company_staff_image('90001','face') ->> 'mime') = 'image/png', '');
exception when others then insert into t_r values (13,'本社PCは会社の全勤務員を見られ、記録が残る', false, sqlerrm); end $$;
select set_config('request.jwt.claim.sub', '11111111-0000-0000-0000-000000000003', false);
do $$ declare n int := 0; begin
  begin perform company_staff_profile('90001'); exception when others then n := n + 1; end;
  insert into t_r values (14,'支店は担当現場の勤務員だけ', n = 1 and (company_staff_profile('90002')->>'name') = '試験 二郎', n::text);
exception when others then insert into t_r values (14,'支店は担当現場の勤務員だけ', false, sqlerrm); end $$;
select set_config('request.jwt.claim.sub', '11111111-0000-0000-0000-000000000004', false);
do $$ begin
  perform company_staff_profile('90001');
  insert into t_r values (15,'教育センターは見られない', false, 'ok?');
exception when others then insert into t_r values (15,'教育センターは見られない', sqlerrm like '%見られる勤務員ではありません%', sqlerrm); end $$;
select set_config('request.jwt.claim.sub', '22222222-0000-0000-0000-000000000001', false);
do $$ begin
  perform company_staff_profile('90001');
  insert into t_r values (16,'他社の管理者には見えない（同じスタッフNoでも自社の勤務員だけ）', (company_staff_profile('90001')->>'name') = '他社 太郎', '');
exception when others then insert into t_r values (16,'他社の管理者には見えない（同じスタッフNoでも自社の勤務員だけ）', false, sqlerrm); end $$;
reset role;
set role anon;
do $$ begin
  perform company_staff_profile('90001');
  insert into t_r values (17,'anon は会社の画面から見られない', false, 'ok?');
exception when others then insert into t_r values (17,'anon は会社の画面から見られない', sqlstate = '42501', sqlerrm); end $$;
reset role;
do $$ begin
  insert into t_r values (18,'本社・支店の閲覧が記録される（本人以外の閲覧は全件）',
    (select count(*) from staff_profile_views where viewer_kind='hq') >= 4, '');
end $$;

-- 17〜21 一覧と閲覧記録（0415）
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-0000-0000-0000-000000000002', false);
do $$ declare l jsonb; begin
  l := company_list_staff();
  insert into t_r values (19,'本社PCの一覧は自社の勤務員だけ（他社なし）・件数が付く',
    jsonb_array_length(l) = 3 and not (l::text like '%他社%')
    and (select (e->>'has_face')::boolean and (e->>'credential_count')::int = 1 from jsonb_array_elements(l) e where e->>'staff_no' = '90001'), l::text);
exception when others then insert into t_r values (19,'本社PCの一覧は自社の勤務員だけ（他社なし）・件数が付く', false, sqlerrm); end $$;
select set_config('request.jwt.claim.sub', '11111111-0000-0000-0000-000000000003', false);
do $$ declare l jsonb; begin
  l := company_list_staff();
  insert into t_r values (20,'支店の一覧は担当現場の勤務員だけ', jsonb_array_length(l) = 1 and (l->0->>'staff_no') = '90002', l::text);
exception when others then insert into t_r values (20,'支店の一覧は担当現場の勤務員だけ', false, sqlerrm); end $$;
select set_config('request.jwt.claim.sub', '11111111-0000-0000-0000-000000000004', false);
do $$ begin
  insert into t_r values (21,'教育センターの一覧は空', jsonb_array_length(company_list_staff()) = 0, '');
exception when others then insert into t_r values (21,'教育センターの一覧は空', false, sqlerrm); end $$;
select set_config('request.jwt.claim.sub', '11111111-0000-0000-0000-000000000002', false);
do $$ begin
  perform company_staff_view_log('90001');
  insert into t_r values (22,'閲覧記録を見られるのは管理者だけ（本社PCは不可）', false, 'ok?');
exception when others then insert into t_r values (22,'閲覧記録を見られるのは管理者だけ（本社PCは不可）', sqlerrm like '%管理者だけ%', sqlerrm); end $$;
select set_config('request.jwt.claim.sub', '11111111-0000-0000-0000-000000000001', false);
do $$ declare l jsonb; begin
  l := company_staff_view_log('90001');
  insert into t_r values (23,'管理者は閲覧記録（誰が・何を）を見られる', jsonb_array_length(l) >= 3 and (l->0->>'viewer_kind') in ('hq','site'), jsonb_array_length(l)::text);
exception when others then insert into t_r values (23,'管理者は閲覧記録（誰が・何を）を見られる', false, sqlerrm); end $$;
reset role;

-- 25〜 申請の承認（0417）
set role authenticated;
-- 25 支店（担当=A-02 のみ）: 一覧は担当現場の勤務員の申請だけ。担当外は承認できない。担当内は承認できる
select set_config('request.jwt.claim.sub', '11111111-0000-0000-0000-000000000003', false);
do $$ declare l jsonb; n int := 0; begin
  l := company_list_requests();
  begin perform company_request_decide((select v from t_v where k='r_addr')::uuid, true, null); exception when others then n := n + 1; end;
  perform company_request_decide((select v from t_v where k='r_addr2')::uuid, true, '確認しました');
  insert into t_r values (25,'支店は担当現場の勤務員の申請だけ見られて承認でき、担当外は承認できない',
    jsonb_array_length(l) = 1 and (l->0->>'staff_no') = '90002' and n = 1
    and (company_staff_profile('90002')->>'address') = '架空県別市1-1-1', l::text);
exception when others then insert into t_r values (25,'支店は担当現場の勤務員の申請だけ見られて承認でき、担当外は承認できない', false, sqlerrm); end $$;
-- 26 教育センター・他社・anon は一覧が空／承認できない
select set_config('request.jwt.claim.sub', '11111111-0000-0000-0000-000000000004', false);
do $$ declare n int := 0; begin
  begin perform company_request_decide((select v from t_v where k='r_addr')::uuid, true, null); exception when others then n := n + 1; end;
  insert into t_r values (26,'教育センターは申請を見られず承認できない', jsonb_array_length(company_list_requests()) = 0 and n = 1, n::text);
exception when others then insert into t_r values (26,'教育センターは申請を見られず承認できない', false, sqlerrm); end $$;
select set_config('request.jwt.claim.sub', '22222222-0000-0000-0000-000000000001', false);
do $$ declare n int := 0; begin
  begin perform company_request_decide((select v from t_v where k='r_addr')::uuid, true, null); exception when others then n := n + 1; end;
  begin perform company_request_image((select v from t_v where k='r_face')::uuid); exception when others then n := n + 1; end;
  insert into t_r values (27,'他社の管理者は申請を見られず承認できない', jsonb_array_length(company_list_requests()) = 0 and n = 2, n::text);
exception when others then insert into t_r values (27,'他社の管理者は申請を見られず承認できない', false, sqlerrm); end $$;
reset role;
set role anon;
do $$ begin
  perform company_request_decide((select v from t_v where k='r_addr')::uuid, true, null);
  insert into t_r values (28,'anon（現場PCを含む）は承認できない', false, 'ok?');
exception when others then insert into t_r values (28,'anon（現場PCを含む）は承認できない', sqlstate = '42501', sqlerrm); end $$;
reset role;
-- 29〜 本社PC: 差し戻し（理由必須）・承認・取り下げ後の再承認不可
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-0000-0000-0000-000000000002', false);
do $$ declare l jsonb; begin
  l := company_list_requests();
  insert into t_r values (29,'本社PCは自社の申請を変更前の値つきで見られる（支店の承認済み分は含まない）',
    jsonb_array_length(l) = 6
    and (select e->'current'->>'name' = '試験 一郎' from jsonb_array_elements(l) e where e->>'category' = 'name')
    and (select (e->>'has_image')::boolean from jsonb_array_elements(l) e where e->>'category' = 'face')
    and not (l::text like '%他社%'), jsonb_array_length(l)::text);
exception when others then insert into t_r values (29,'本社PCは自社の申請を変更前の値つきで見られる（支店の承認済み分は含まない）', false, sqlerrm); end $$;
do $$ declare n int := 0; j jsonb; begin
  begin perform company_request_decide((select v from t_v where k='r_addr')::uuid, false, '  '); exception when others then n := n + 1; end;
  perform company_request_decide((select v from t_v where k='r_addr')::uuid, false, '住所の番地が読めません');
  insert into t_r values (30,'差し戻しは理由が必須で、正式な値は変わらない', n = 1 and (company_staff_profile('90001')->>'address') = '架空県架空市1-2-3', n::text);
exception when others then insert into t_r values (30,'差し戻しは理由が必須で、正式な値は変わらない', false, sqlerrm); end $$;
do $$ declare n int := 0; begin
  perform company_request_decide((select v from t_v where k='r_name')::uuid, true, null);
  begin perform company_request_decide((select v from t_v where k='r_name')::uuid, true, null); exception when others then n := n + 1; end;
  insert into t_r values (31,'氏名を承認すると反映され、二重に処理できない',
    (company_staff_profile('90001')->>'name') = '試験 一郎改' and (company_staff_profile('90001')->>'furigana') = 'しけん いちろう' and n = 1, n::text);
exception when others then insert into t_r values (31,'氏名を承認すると反映され、二重に処理できない', false, sqlerrm); end $$;
do $$ begin
  perform company_request_decide((select v from t_v where k='r_hon')::uuid, true, null);
  insert into t_r values (32,'取り下げた申請は承認できない', false, 'ok?');
exception when others then insert into t_r values (32,'取り下げた申請は承認できない', sqlerrm like '%すでに処理%', sqlerrm); end $$;
do $$ declare png text := 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='; begin
  -- 申請の写真を見る（記録が残る）→ 承認すると正式な写真・本人確認資料になる
  perform company_request_image((select v from t_v where k='r_face')::uuid);
  perform company_request_decide((select v from t_v where k='r_face')::uuid, true, null);
  perform company_request_decide((select v from t_v where k='r_id')::uuid, true, null);
  insert into t_r values (33,'顔写真・本人確認資料を承認すると反映され、本社PCは本人確認資料を見られる',
    (company_staff_profile('90001')->>'has_face')::boolean and (company_staff_profile('90001')->'id_docs') = '["license"]'::jsonb
    and decode(company_staff_id_doc('90001','license') ->> 'base64', 'base64') = decode(png, 'base64'), '');
exception when others then insert into t_r values (33,'顔写真・本人確認資料を承認すると反映され、本社PCは本人確認資料を見られる', false, sqlerrm); end $$;
do $$ declare j jsonb; begin
  perform company_request_decide((select v from t_v where k='r_cnew')::uuid, true, null);
  perform company_request_decide((select v from t_v where k='r_cdel')::uuid, true, null);
  j := company_staff_profile('90001');
  insert into t_r values (34,'資格の追加・削除を承認すると反映される（追加分は証書の写真つき）',
    jsonb_array_length(j->'credentials') = 1 and (j->'credentials'->0->>'kind') = 'genin' and (j->'credentials'->0->>'has_image')::boolean
    and jsonb_array_length(j->'requests') = 1 and (j->'requests'->0->>'status') = 'rejected' and (j->'requests'->0->>'note') = '住所の番地が読めません', j::text);
exception when others then insert into t_r values (34,'資格の追加・削除を承認すると反映される（追加分は証書の写真つき）', false, sqlerrm); end $$;
reset role;
-- 35 決着した申請の写真は消える／申請写真の閲覧・本人確認資料の閲覧が記録される
do $$ begin
  insert into t_r values (35,'決着した申請の写真は残らず、写真の閲覧が記録される',
    (select count(*) from profile_requests where status <> 'pending' and image is not null) = 0
    and (select count(*) from staff_profile_views where what = 'id_doc') >= 1 and (select count(*) from staff_profile_views where what = 'face' and viewer_kind = 'hq') >= 1, '');
end $$;
-- 36 現場PCは本人確認資料を見られない
set role anon;
do $$ begin
  insert into t_r values (36,'現場PCは本人確認資料の写真を見られない', sitepc_staff_image((select v from t_v where k='sess'), '90001', 'id_doc') is null, '');
exception when others then insert into t_r values (36,'現場PCは本人確認資料の写真を見られない', true, sqlerrm); end $$;
reset role;

-- 22 読み込み RPC は stable ではない（端末の最終利用時刻を更新するため。stable だと Supabase の読み取り専用トランザクションで失敗する）
do $$ declare bad text; begin
  select string_agg(proname, ',') into bad from pg_proc
   where pronamespace = 'public'::regnamespace and prosrc like '%worker_by_device%' and provolatile <> 'v';
  insert into t_r values (24,'本人確認（worker_by_device）を呼ぶ RPC はすべて volatile', bad is null, coalesce(bad, ''));
end $$;

select n||'. '||case when ok then 'PASS' else 'FAIL' end||'  '||name||case when ok then '' else '  ['||left(coalesce(detail,''),200)||']' end from t_r order by n;
