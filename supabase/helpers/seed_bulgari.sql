-- ブルガリ・パイロット 初期データ投入（Supabase SQL Editor で実行）
-- 前提: 0400 と 0401 を適用済み。SQL Editor は service_role で動くためRLSはバイパスされます。
-- 内容: 会社ヒトトヒト(HTH-0001) / 現場ブルガリ(BVL-01, 現場PIN=1234) / 勤務員6名(初期PIN=生年月日MMDD, 要変更)。
-- 冪等: 何度実行しても重複しません（NOT EXISTS ガード）。

create extension if not exists pgcrypto with schema extensions;

-- 1) 会社
insert into public.companies(name, code)
select 'ヒトトヒト株式会社', 'HTH-0001'
where not exists (select 1 from public.companies where code = 'HTH-0001');

-- 2) 現場
insert into public.sites(name, code, dept, company_id, is_active)
select 'ブルガリホテル東京', 'BVL-01', 'ビルサービス部セキュリティ２グループ',
       (select id from public.companies where code = 'HTH-0001'), true
where not exists (select 1 from public.sites where code = 'BVL-01');

-- 3) 現場ログイン資格（会社コード＋施設コード＋現場PIN=1234）
insert into public.app_site_credentials(company_code, site_code, pin_hash, site_id, company_id, site_name)
select 'HTH-0001', 'BVL-01', extensions.crypt('1234', extensions.gen_salt('bf')),
       (select id from public.sites where code = 'BVL-01'),
       (select id from public.companies where code = 'HTH-0001'),
       'ブルガリホテル東京'
where not exists (select 1 from public.app_site_credentials where site_code = 'BVL-01');

-- 4) 勤務員6名（初期PIN=生年月日MMDD・要変更）
do $$
declare
  v_company uuid := (select id from public.companies where code = 'HTH-0001');
  v_site    uuid := (select id from public.sites     where code = 'BVL-01');
  r record; v_staff uuid; v_pin text;
begin
  for r in select * from (values
      ('783','三角 龍彦', date '1985-04-12','現場責任者'),
      ('784','藤井 隆幸', date '1990-09-03','副責任者'),
      ('791','大野 修一', date '1978-12-20','隊員'),
      ('802','中村 涼',   date '1995-06-08','隊員'),
      ('815','小林 大地', date '1988-02-27','隊員'),
      ('826','渡辺 亮',   date '1992-11-15','隊員')
    ) as t(no,name,dob,role)
  loop
    v_staff := null;
    v_pin := public.pin_from_dob(r.dob);
    insert into public.staff(company_id, staff_no, name, dob, dept, role,
                             pin_hash, pin_current, pin_must_change, is_active, site_id)
    select v_company, r.no, r.name, r.dob, 'ビルサービス部セキュリティ２グループ', r.role,
           extensions.crypt(v_pin, extensions.gen_salt('bf')), v_pin, true, true, v_site
    where not exists (select 1 from public.staff where company_id = v_company and staff_no = r.no)
    returning id into v_staff;
    if v_staff is not null then
      insert into public.staff_sites(staff_id, site_id) values (v_staff, v_site) on conflict do nothing;
    end if;
  end loop;
end $$;

-- 5) 会社管理者アカウントの紐付け（任意）
--    Supabaseダッシュボード → Authentication → Users で会社管理者のメール＋PWを作成後、
--    下のメールを置き換えて実行してください（company_admin 付与）。
-- insert into public.app_profiles(user_id, role, company_id)
-- select id, 'company_admin', (select id from public.companies where code = 'HTH-0001')
--   from auth.users where email = 'company@hitotohito.co.jp'
-- on conflict (user_id) do update set role = 'company_admin', company_id = excluded.company_id;

-- 確認用:
-- select code, name from public.companies;
-- select code, name, dept from public.sites where code='BVL-01';
-- select staff_no, name, pin_current, pin_must_change from public.staff order by staff_no;
