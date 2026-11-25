-- 0418_authz_hardening: 旧の会社向け関数の権限を、ロールで絞る（画面だけでなくDBでも）
-- 背景: 0400〜0402 の company_* 関数は「会社のアカウントであること」しか確認していなかった。0411 でロール（本社PC・支店・管理者・教育センター）を
--       入れた後も、教育センターや本社PCのアカウントが API を直接呼べば、勤務員の登録・現場の作成・休暇の承認ができた（画面だけが制限）。
--       あわせて、ログインなし（anon）にも実行権限が付いたままだった（中で弾いてはいたが、入口で閉じる）。
-- 方針: 追加のみ・冪等（create or replace / revoke / grant）。画面から使われている呼び出し（休暇の確認・承認＝管理者・支店）は変わらない。
--   ・勤務員の登録（company_register_staff）・現場の作成（company_create_site）: 管理者だけ
--   ・休暇の一覧・承認・却下: 管理者と、担当現場の支店（app_can_manage_site）だけ。本社PC・教育センターは不可
--   ・anon は company_* / platform_* / site_staff_pins を実行できない

create or replace function public.app_has_role(p_roles text[]) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.app_profiles p where p.user_id = auth.uid() and p.role = any(p_roles));
$$;
revoke all on function public.app_has_role(text[]) from public, anon;
grant execute on function public.app_has_role(text[]) to authenticated;

-- ── 管理者だけ ──
create or replace function public.company_register_staff(
  p_staff_no text, p_name text, p_dob date, p_dept text, p_role text,
  p_site_ids uuid[], p_pin text
) returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare v_company uuid; v_staff uuid; v_site uuid; v_pin text;
begin
  if not public.app_has_role(array['company_admin']) then raise exception '権限がありません（管理者のみ）'; end if;
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

create or replace function public.company_create_site(
  p_name text, p_code text, p_dept text, p_pin text
) returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare v_company uuid; v_site uuid; v_ccode text;
begin
  if not public.app_has_role(array['company_admin']) then raise exception '権限がありません（管理者のみ）'; end if;
  v_company := public.app_company_id();
  if v_company is null then raise exception '会社が特定できません'; end if;
  select code into v_ccode from public.companies where id = v_company;
  insert into public.sites(name, code, dept, company_id, is_active)
    values (p_name, p_code, p_dept, v_company, true) returning id into v_site;
  insert into public.app_site_credentials(company_code, site_code, pin_hash, site_id, company_id, site_name)
    values (v_ccode, p_code, extensions.crypt(p_pin, extensions.gen_salt('bf')), v_site, v_company, p_name);
  return v_site;
end $$;

-- ── 休暇（管理者と、担当現場の支店だけ）──
create or replace function public.company_list_leave()
returns setof public.leave_requests language sql stable security definer set search_path = public as $$
  select r.* from public.leave_requests r
   where r.company_id = public.app_company_id()
     and (public.app_can_manage_site(r.site_id) or (r.site_id is null and public.app_has_role(array['company_admin'])))
   order by r.submitted_at desc;
$$;

create or replace function public.company_approve_leave(p_id uuid, p_approver jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.leave_requests set status = '会社承認', company_approver = p_approver
   where id = p_id and company_id = public.app_company_id() and status = '現場承認'
     and (public.app_can_manage_site(site_id) or (site_id is null and public.app_has_role(array['company_admin'])));
  if not found then raise exception '対象の申請が見つかりません（現場承認済みで、承認できる現場のものだけ承認できます）'; end if;
end $$;

create or replace function public.company_reject_leave(p_id uuid, p_by text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.leave_requests set status = '却下', rejected_by = p_by
   where id = p_id and company_id = public.app_company_id()
     and (public.app_can_manage_site(site_id) or (site_id is null and public.app_has_role(array['company_admin'])));
  if not found then raise exception '対象の申請が見つかりません（承認できる現場のものだけ却下できます）'; end if;
end $$;

-- ── anon から実行権限を外す（ログイン済みの会社アカウントだけ）──
revoke all on function public.company_register_staff(text,text,date,text,text,uuid[],text) from public, anon;
revoke all on function public.company_create_site(text,text,text,text) from public, anon;
revoke all on function public.company_list_leave() from public, anon;
revoke all on function public.company_approve_leave(uuid,jsonb) from public, anon;
revoke all on function public.company_reject_leave(uuid,text) from public, anon;
revoke all on function public.platform_create_company(text,text) from public, anon;
revoke all on function public.platform_link_company_admin(uuid,uuid) from public, anon;
revoke all on function public.site_staff_pins(uuid) from public, anon;
grant execute on function public.company_register_staff(text,text,date,text,text,uuid[],text) to authenticated;
grant execute on function public.company_create_site(text,text,text,text) to authenticated;
grant execute on function public.company_list_leave() to authenticated;
grant execute on function public.company_approve_leave(uuid,jsonb) to authenticated;
grant execute on function public.company_reject_leave(uuid,text) to authenticated;
grant execute on function public.platform_create_company(text,text) to authenticated;
grant execute on function public.platform_link_company_admin(uuid,uuid) to authenticated;
grant execute on function public.site_staff_pins(uuid) to authenticated;
