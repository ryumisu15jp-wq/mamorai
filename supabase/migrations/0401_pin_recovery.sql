-- 0401_pin_recovery.sql — 勤務員PIN運用: 初期PIN(生年月日)・初回変更強制・現場での復旧用保存・変更RPC
-- 方針:
--   ・勤務員の初期PINは生年月日から生成（既定 MMDD 4桁。登録時にp_pinを渡せば任意）。
--   ・初回ログイン時に変更を強制（pin_must_change）。変更後はハッシュ照合。
--   ・PINを忘れても現場/会社が確認できるよう、現在PINを pin_current に保存（会社スコープで参照）。
--     ※ 4桁の利便用PIN想定。より厳格運用が必要になれば pin_current を暗号化(pgp_sym)へ差替可能。
-- 依存: 0400（staff.pin_hash / staff_login / company_register_staff）。追加のみ・冪等。

create extension if not exists pgcrypto with schema extensions;

-- ── 列追加 ──
alter table public.staff add column if not exists pin_must_change boolean default true;
alter table public.staff add column if not exists pin_current     text;   -- 復旧用・現在PIN（会社/現場が確認可）

-- ── 初期PINを生年月日から作る補助（MMDD） ──
create or replace function public.pin_from_dob(p_dob date)
returns text language sql immutable as $$
  select case when p_dob is null then '0000' else to_char(p_dob, 'MMDD') end;
$$;

-- ── 勤務員登録（0400を置換）: p_pin 未指定なら生年月日からPIN生成。pin_current保存・要変更ON ──
create or replace function public.company_register_staff(
  p_staff_no text, p_name text, p_dob date, p_dept text, p_role text,
  p_site_ids uuid[], p_pin text
) returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare v_company uuid; v_staff uuid; v_site uuid; v_pin text;
begin
  v_company := public.app_company_id();
  if v_company is null then raise exception '会社が特定できません'; end if;
  v_pin := coalesce(nullif(p_pin,''), public.pin_from_dob(p_dob));   -- 初期PIN = 指定 or 生年月日
  insert into public.staff(company_id, staff_no, name, dob, dept, role, pin_hash, pin_current,
                           pin_must_change, is_active, site_id)
    values (v_company, p_staff_no, p_name, p_dob, p_dept, p_role,
            extensions.crypt(v_pin, extensions.gen_salt('bf')), v_pin, true, true, p_site_ids[1])
  on conflict (company_id, staff_no) do update
    set name = excluded.name, dob = excluded.dob, dept = excluded.dept, role = excluded.role
  returning id into v_staff;
  delete from public.staff_sites where staff_id = v_staff;
  foreach v_site in array coalesce(p_site_ids, '{}') loop
    insert into public.staff_sites(staff_id, site_id) values (v_staff, v_site) on conflict do nothing;
  end loop;
  return v_staff;
end $$;

-- ── 勤務員ログイン（0400を置換）: must_change を返す（戻り値型変更のため一旦DROP）──
drop function if exists public.staff_login(text, text, text);
create or replace function public.staff_login(p_company_code text, p_staff_no text, p_pin text)
returns table(staff_id uuid, name text, dept text, site_ids uuid[], must_change boolean)
language plpgsql security definer set search_path = public, extensions as $$
declare v_company uuid; v_staff public.staff;
begin
  select id into v_company from public.companies where code = p_company_code and is_active;
  if v_company is null then raise exception '会社コードが不正です'; end if;
  select * into v_staff from public.staff
   where company_id = v_company and staff_no = p_staff_no and is_active;
  if v_staff.id is null or v_staff.pin_hash is null
     or v_staff.pin_hash <> extensions.crypt(p_pin, v_staff.pin_hash) then
    raise exception 'スタッフNoまたはPINが不正です';
  end if;
  return query
    select v_staff.id, v_staff.name, v_staff.dept,
           coalesce(array(select ss.site_id from public.staff_sites ss where ss.staff_id = v_staff.id), '{}'),
           coalesce(v_staff.pin_must_change, false);
end $$;

-- ── PIN変更（/app 初回・任意変更）: 旧PIN照合→新PIN設定・要変更OFF・pin_current更新 ──
create or replace function public.staff_change_pin(
  p_company_code text, p_staff_no text, p_old_pin text, p_new_pin text
) returns void language plpgsql security definer set search_path = public, extensions as $$
declare v_company uuid; v_staff public.staff;
begin
  if p_new_pin is null or length(p_new_pin) < 4 then raise exception 'PINは4桁以上です'; end if;
  select id into v_company from public.companies where code = p_company_code and is_active;
  if v_company is null then raise exception '会社コードが不正です'; end if;
  select * into v_staff from public.staff where company_id = v_company and staff_no = p_staff_no and is_active;
  if v_staff.id is null or v_staff.pin_hash <> extensions.crypt(p_old_pin, v_staff.pin_hash) then
    raise exception '現在のPINが不正です';
  end if;
  update public.staff
     set pin_hash = extensions.crypt(p_new_pin, extensions.gen_salt('bf')),
         pin_current = p_new_pin, pin_must_change = false
   where id = v_staff.id;
end $$;

-- ── 現場/会社: 担当現場の勤務員PIN一覧（復旧用）。会社スコープ内のみ。 ──
create or replace function public.site_staff_pins(p_site_id uuid)
returns table(staff_no text, name text, pin_current text, must_change boolean)
language plpgsql security definer set search_path = public as $$
declare v_company uuid;
begin
  v_company := public.app_company_id();               -- 会社管理者のスコープ
  if v_company is null then raise exception '権限がありません'; end if;
  if not exists (select 1 from public.sites s where s.id = p_site_id and s.company_id = v_company) then
    raise exception '対象現場が自社ではありません';
  end if;
  return query
    select s.staff_no, s.name, s.pin_current, coalesce(s.pin_must_change,false)
      from public.staff s
      join public.staff_sites ss on ss.staff_id = s.id
     where ss.site_id = p_site_id and s.company_id = v_company and s.is_active
     order by s.staff_no;
end $$;

grant execute on function public.pin_from_dob(date)                          to authenticated;
grant execute on function public.company_register_staff(text,text,date,text,text,uuid[],text) to authenticated;
grant execute on function public.staff_login(text,text,text)                 to anon, authenticated;
grant execute on function public.staff_change_pin(text,text,text,text)       to anon, authenticated;
grant execute on function public.site_staff_pins(uuid)                       to authenticated;
