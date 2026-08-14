-- 0402_leave_ops.sql — 有給フローの業務RPC（フロント本結線 Step6-1）
-- 認証の二系統に対応:
--   ・勤務員(/app)・現場(/s): Authユーザーを持たないため SECURITY DEFINER RPC。
--       会社識別コード＋施設コードでスコープを解決・検証する。
--   ・会社(/co): Supabase Auth（company_admin）→ app_company_id() でスコープ。
-- 依存: 0400（leave_requests / companies / sites / app_company_id）。追加のみ・冪等。

alter table public.leave_requests add column if not exists rejected_by text;

-- 会社コード＋施設コードから site_id を解決（内部）。
create or replace function public.resolve_site(p_company_code text, p_site_code text)
returns table(company_id uuid, site_id uuid)
language sql stable security definer set search_path = public as $$
  select c.id, s.id
    from public.companies c
    join public.sites s on s.company_id = c.id and s.code = p_site_code
   where c.code = p_company_code and c.is_active;
$$;

-- 勤務員(/app): 有給申請を提出。
create or replace function public.submit_leave(
  p_company_code text, p_site_code text, p_staff_no text, p_staff_name text, p_dept text,
  p_from date, p_to date, p_days int, p_reason text
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_c uuid; v_s uuid; v_id uuid;
begin
  select company_id, site_id into v_c, v_s from public.resolve_site(p_company_code, p_site_code);
  if v_s is null then raise exception '現場が特定できません'; end if;
  insert into public.leave_requests(company_id, site_id, staff_no, staff_name, dept,
                                    date_from, date_to, days, reason, status, submitted_at)
    values (v_c, v_s, p_staff_no, p_staff_name, p_dept, p_from, p_to, p_days, p_reason, '申請中', p_from)
  returning id into v_id;
  return v_id;
end $$;

-- 勤務員(/app): 自分の申請履歴。
create or replace function public.staff_list_leave(p_company_code text, p_staff_no text)
returns setof public.leave_requests language sql stable security definer set search_path = public as $$
  select r.* from public.leave_requests r
    join public.companies c on c.id = r.company_id
   where c.code = p_company_code and r.staff_no = p_staff_no
   order by r.submitted_at desc;
$$;

-- 現場(/s): 当該現場の申請一覧。
create or replace function public.site_list_leave(p_company_code text, p_site_code text)
returns setof public.leave_requests language sql stable security definer set search_path = public as $$
  select r.* from public.leave_requests r
    join public.resolve_site(p_company_code, p_site_code) rs on rs.site_id = r.site_id
   order by r.submitted_at desc;
$$;

-- 現場(/s): 一次承認（担当者の印・署名JSONを付与）／却下。
create or replace function public.site_approve_leave(p_company_code text, p_site_code text, p_id uuid, p_approver jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_s uuid;
begin
  select site_id into v_s from public.resolve_site(p_company_code, p_site_code);
  update public.leave_requests set status = '現場承認', site_approver = p_approver
   where id = p_id and site_id = v_s and status = '申請中';
  if not found then raise exception '対象の申請が見つかりません'; end if;
end $$;

create or replace function public.site_reject_leave(p_company_code text, p_site_code text, p_id uuid, p_by text)
returns void language plpgsql security definer set search_path = public as $$
declare v_s uuid;
begin
  select site_id into v_s from public.resolve_site(p_company_code, p_site_code);
  update public.leave_requests set status = '却下', rejected_by = p_by
   where id = p_id and site_id = v_s;
  if not found then raise exception '対象の申請が見つかりません'; end if;
end $$;

-- 会社(/co, Auth): 自社の申請一覧（現場承認済みの最終確認含む）。
create or replace function public.company_list_leave()
returns setof public.leave_requests language sql stable security definer set search_path = public as $$
  select r.* from public.leave_requests r
   where r.company_id = public.app_company_id()
   order by r.submitted_at desc;
$$;

-- 会社(/co, Auth): 最終承認（会社担当者の印・署名JSON）／却下。
create or replace function public.company_approve_leave(p_id uuid, p_approver jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.leave_requests set status = '会社承認', company_approver = p_approver
   where id = p_id and company_id = public.app_company_id() and status = '現場承認';
  if not found then raise exception '対象の申請が見つかりません（現場承認済のみ承認できます）'; end if;
end $$;

create or replace function public.company_reject_leave(p_id uuid, p_by text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.leave_requests set status = '却下', rejected_by = p_by
   where id = p_id and company_id = public.app_company_id();
  if not found then raise exception '対象の申請が見つかりません'; end if;
end $$;

grant execute on function public.resolve_site(text,text)                              to anon, authenticated;
grant execute on function public.submit_leave(text,text,text,text,text,date,date,int,text) to anon, authenticated;
grant execute on function public.staff_list_leave(text,text)                          to anon, authenticated;
grant execute on function public.site_list_leave(text,text)                           to anon, authenticated;
grant execute on function public.site_approve_leave(text,text,uuid,jsonb)             to anon, authenticated;
grant execute on function public.site_reject_leave(text,text,uuid,text)              to anon, authenticated;
grant execute on function public.company_list_leave()                                 to authenticated;
grant execute on function public.company_approve_leave(uuid,jsonb)                   to authenticated;
grant execute on function public.company_reject_leave(uuid,text)                    to authenticated;
