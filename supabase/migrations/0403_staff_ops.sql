-- 0403_staff_ops.sql — 勤務員(隊員)マスタの業務RPC（フロント本結線 Step6-2）
-- 現場(/s)は会社識別コード＋施設コードでスコープを解決するSECURITY DEFINER RPC。
-- 依存: 0400/0401（staff, staff_sites, resolve_site, pin_from_dob）。追加のみ・冪等。

-- 当該現場の勤務員一覧。
create or replace function public.site_list_staff(p_company_code text, p_site_code text)
returns table(staff_no text, name text, dob date, dept text, role text,
              pin_current text, pin_must_change boolean, is_active boolean)
language sql stable security definer set search_path = public as $$
  select s.staff_no, s.name, s.dob, s.dept, s.role, s.pin_current,
         coalesce(s.pin_must_change,false), coalesce(s.is_active,true)
    from public.staff s
    join public.staff_sites ss on ss.staff_id = s.id
    join public.resolve_site(p_company_code, p_site_code) rs on rs.site_id = ss.site_id
   order by s.staff_no;
$$;

-- 勤務員を登録/更新（初期PIN=生年月日 or 指定）。当該現場へ割当。
create or replace function public.site_register_staff(
  p_company_code text, p_site_code text,
  p_staff_no text, p_name text, p_dob date, p_dept text, p_role text, p_pin text
) returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare v_c uuid; v_s uuid; v_staff uuid; v_pin text; v_exists boolean;
begin
  select company_id, site_id into v_c, v_s from public.resolve_site(p_company_code, p_site_code);
  if v_s is null then raise exception '現場が特定できません'; end if;
  select true into v_exists from public.staff where company_id = v_c and staff_no = p_staff_no;
  if v_exists then
    update public.staff set name = p_name, dob = p_dob, dept = coalesce(p_dept, dept),
           role = coalesce(p_role, role), is_active = true
     where company_id = v_c and staff_no = p_staff_no
     returning id into v_staff;
  else
    v_pin := coalesce(nullif(p_pin,''), public.pin_from_dob(p_dob));
    insert into public.staff(company_id, staff_no, name, dob, dept, role,
                             pin_hash, pin_current, pin_must_change, is_active, site_id)
      values (v_c, p_staff_no, p_name, p_dob, p_dept, p_role,
              extensions.crypt(v_pin, extensions.gen_salt('bf')), v_pin, true, true, v_s)
      returning id into v_staff;
  end if;
  insert into public.staff_sites(staff_id, site_id) values (v_staff, v_s) on conflict do nothing;
  return v_staff;
end $$;

-- 在籍/休止の切替。
create or replace function public.site_set_staff_active(p_company_code text, p_staff_no text, p_active boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_c uuid;
begin
  select id into v_c from public.companies where code = p_company_code and is_active;
  update public.staff set is_active = p_active where company_id = v_c and staff_no = p_staff_no;
  if not found then raise exception '対象の勤務員が見つかりません'; end if;
end $$;

-- PINを初期値(生年月日)へリセット。
create or replace function public.site_reset_pin(p_company_code text, p_staff_no text)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare v_c uuid; v_pin text; v_dob date;
begin
  select id into v_c from public.companies where code = p_company_code and is_active;
  select dob into v_dob from public.staff where company_id = v_c and staff_no = p_staff_no;
  if v_dob is null then raise exception '対象の勤務員が見つかりません'; end if;
  v_pin := public.pin_from_dob(v_dob);
  update public.staff set pin_hash = extensions.crypt(v_pin, extensions.gen_salt('bf')),
         pin_current = v_pin, pin_must_change = true
   where company_id = v_c and staff_no = p_staff_no;
  return v_pin;
end $$;

grant execute on function public.site_list_staff(text,text)                         to anon, authenticated;
grant execute on function public.site_register_staff(text,text,text,text,date,text,text,text) to anon, authenticated;
grant execute on function public.site_set_staff_active(text,text,boolean)           to anon, authenticated;
grant execute on function public.site_reset_pin(text,text)                          to anon, authenticated;
