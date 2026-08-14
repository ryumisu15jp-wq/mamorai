-- 0405_shift_ops.sql — シフト希望＋月次シフト(配置予定)の業務RPC（Step6-3）
-- 現場/勤務員は会社コード＋施設コードでスコープ解決するSECURITY DEFINER RPC。
-- 依存: 0400（shift_hopes, shift_snapshots, resolve_site）。追加のみ・冪等。

alter table public.shift_hopes add column if not exists staff_name text;

-- 勤務員(/app): シフト希望を提出（同一スタッフ・同一月は上書き）。
create or replace function public.submit_hope(
  p_company_code text, p_site_code text, p_staff_no text, p_staff_name text,
  p_ym text, p_hopes jsonb, p_note text
) returns void language plpgsql security definer set search_path = public as $$
declare v_c uuid; v_s uuid;
begin
  select company_id, site_id into v_c, v_s from public.resolve_site(p_company_code, p_site_code);
  if v_s is null then raise exception '現場が特定できません'; end if;
  insert into public.shift_hopes(company_id, site_id, staff_no, staff_name, ym, hopes, note, submitted_at)
    values (v_c, v_s, p_staff_no, p_staff_name, p_ym, p_hopes, p_note, current_date)
  on conflict (site_id, staff_no, ym) do update
    set hopes = excluded.hopes, note = excluded.note, staff_name = excluded.staff_name, submitted_at = excluded.submitted_at;
end $$;

-- 現場(/s): 対象月のシフト希望一覧。
create or replace function public.site_list_hopes(p_company_code text, p_site_code text, p_ym text)
returns setof public.shift_hopes language sql stable security definer set search_path = public as $$
  select h.* from public.shift_hopes h
    join public.resolve_site(p_company_code, p_site_code) rs on rs.site_id = h.site_id
   where h.ym = p_ym;
$$;

-- 現場(/s): 月次シフト(=配置予定)を保存（同一現場・同一月は上書き）。
create or replace function public.save_shift(
  p_company_code text, p_site_code text, p_ym text, p_staff jsonb, p_grid jsonb
) returns void language plpgsql security definer set search_path = public as $$
declare v_c uuid; v_s uuid;
begin
  select company_id, site_id into v_c, v_s from public.resolve_site(p_company_code, p_site_code);
  if v_s is null then raise exception '現場が特定できません'; end if;
  insert into public.shift_snapshots(company_id, site_id, ym, staff, grid, saved_at)
    values (v_c, v_s, p_ym, p_staff, p_grid, current_date)
  on conflict (site_id, ym) do update
    set staff = excluded.staff, grid = excluded.grid, saved_at = excluded.saved_at;
end $$;

-- 現場(/s)・配置予定表: 月次シフトを取得。
create or replace function public.load_shift(p_company_code text, p_site_code text, p_ym text)
returns setof public.shift_snapshots language sql stable security definer set search_path = public as $$
  select s.* from public.shift_snapshots s
    join public.resolve_site(p_company_code, p_site_code) rs on rs.site_id = s.site_id
   where s.ym = p_ym;
$$;

grant execute on function public.submit_hope(text,text,text,text,text,jsonb,text) to anon, authenticated;
grant execute on function public.site_list_hopes(text,text,text)                   to anon, authenticated;
grant execute on function public.save_shift(text,text,text,jsonb,jsonb)             to anon, authenticated;
grant execute on function public.load_shift(text,text,text)                         to anon, authenticated;
