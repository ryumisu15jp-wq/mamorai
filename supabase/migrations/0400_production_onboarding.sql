-- =====================================================================
-- 0400_production_onboarding.sql — 本番運用: 会社オンボーディング＋永続化＋RLS
-- =====================================================================
-- 方針（マルチテナント）:
--   運営(platform_admin) が「会社＋会社管理者アカウント」を発行し、
--   会社(company_admin) が自社の「現場(施設コード/現場PIN)」と「勤務員(スタッフNo/PIN)」を作成する。
--   運営は現場業務を持たない（会社・契約の管理のみ）。
--
-- 認証の二系統:
--   ・会社/運営: Supabase Auth（auth.uid()）→ RLS で company/platform スコープを検証。
--   ・現場/勤務員: 共有端末・スマホのため Auth ユーザーを持たず、SECURITY DEFINER の
--     ログインRPC（コード＋PIN照合, pgcrypto）でセッションを発行。現場/勤務員の読み書きは
--     専用RPC経由（0401で追加）で会社・現場スコープを内部強制する。
--
-- 安全・冪等: すべて追加のみ（ADD COLUMN / CREATE IF NOT EXISTS）。破壊的DDLなし。
--   ※ 会社管理者の Auth ユーザー作成は service_role（サーバ側）で行う。本SQLは
--     プロフィール紐付け(app_profiles)と会社発行までを担う。
-- Supabase 注意: pgcrypto は extensions スキーマ。crypt/gen_salt は extensions. で参照。
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ── 1) companies（会社）────────────────────────────────────────────
create table if not exists public.companies (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  code           text unique not null,               -- 会社識別コード（例 HTH-0001）
  plan           text default 'standard',
  contract_start date,
  contract_end   date,
  is_active      boolean default true,
  created_at     timestamptz default now()
);
alter table public.companies enable row level security;

-- ── 2) 既存テーブルへ列追加（会社スコープ/現場属性/勤務員属性）──────────
alter table public.app_profiles add column if not exists company_id uuid references public.companies(id);
alter table public.app_profiles add column if not exists site_id    uuid;
create unique index if not exists uq_app_profiles_user on public.app_profiles(user_id);

alter table public.sites add column if not exists company_id uuid references public.companies(id);
alter table public.sites add column if not exists dept       text;

alter table public.staff add column if not exists company_id uuid references public.companies(id);
alter table public.staff add column if not exists staff_no   text;
alter table public.staff add column if not exists dob        date;
alter table public.staff add column if not exists dept       text;
alter table public.staff add column if not exists pin_hash   text;   -- 勤務員PIN(ハッシュ)
create index if not exists idx_staff_company on public.staff(company_id);
create unique index if not exists uq_staff_company_no on public.staff(company_id, staff_no);

-- 勤務員の担当現場（複数可）
create table if not exists public.staff_sites (
  staff_id uuid references public.staff(id) on delete cascade,
  site_id  uuid references public.sites(id) on delete cascade,
  primary key (staff_id, site_id)
);
alter table public.staff_sites enable row level security;

-- ── 3) 業務データ（アプリ内ストアの永続化先）──────────────────────────
-- 有給申請
create table if not exists public.leave_requests (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid references public.companies(id),
  site_id      uuid references public.sites(id),
  staff_no     text, staff_name text, dept text,
  date_from    date, date_to date, days int,
  reason       text,
  status       text default '申請中',                 -- 申請中/現場承認/会社承認/却下
  site_approver    jsonb, company_approver jsonb,
  submitted_at date, created_at timestamptz default now()
);
-- シフト希望票
create table if not exists public.shift_hopes (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id),
  site_id    uuid references public.sites(id),
  staff_no   text, ym text,
  hopes      jsonb default '{}'::jsonb,               -- {day: '可'|'夜'|'休'}
  note       text, submitted_at date,
  unique (site_id, staff_no, ym)
);
-- 月次シフト(=配置予定)スナップショット
create table if not exists public.shift_snapshots (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id),
  site_id    uuid references public.sites(id),
  ym         text,
  staff      jsonb, grid jsonb, saved_at date,
  unique (site_id, ym)
);
-- 講習会カタログ（会社が登録）
create table if not exists public.seminars (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id),
  title      text, kind text, held_on date, place text, capacity int
);
-- 講習会 申込
create table if not exists public.training_apps (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid references public.companies(id),
  site_id       uuid references public.sites(id),
  staff_no text, staff_name text, dob date, dept text,
  seminar_id    uuid references public.seminars(id),
  seminar_title text, kind text,
  status        text default '申請中',                -- 申請中/現場承認/会社受理/却下
  site_approver jsonb, submitted_at date, created_at timestamptz default now()
);
-- お知らせ/通知（運営→会社→現場・勤務員）
create table if not exists public.notices (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id),    -- null=運営から全社
  site_id    uuid references public.sites(id),        -- null=会社全体
  scope      text default 'company',                  -- platform/company/site
  category   text, title text, body text, from_label text,
  posted_on  date, created_at timestamptz default now()
);
-- 日報取込（月次データ化・蓄積）
create table if not exists public.report_months (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid references public.companies(id),
  site_id     uuid references public.sites(id),
  ym          text, site_name text,
  totals      jsonb, dailies jsonb,
  imported_at timestamptz default now(),
  unique (site_id, ym)
);
create table if not exists public.report_incidents (
  id            uuid primary key default gen_random_uuid(),
  report_month_id uuid references public.report_months(id) on delete cascade,
  company_id    uuid references public.companies(id),
  site_id       uuid references public.sites(id),
  incident_date date, category text, count int, note text
);
create index if not exists idx_incident_company on public.report_incidents(company_id, incident_date);

-- RLS 有効化（業務データ）
alter table public.leave_requests   enable row level security;
alter table public.shift_hopes      enable row level security;
alter table public.shift_snapshots  enable row level security;
alter table public.seminars         enable row level security;
alter table public.training_apps    enable row level security;
alter table public.notices          enable row level security;
alter table public.report_months    enable row level security;
alter table public.report_incidents enable row level security;

-- ── 4) スコープ判定ヘルパ（auth.uid ベース: 会社/運営）────────────────
create or replace function public.app_is_platform() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.app_profiles p
                 where p.user_id = auth.uid() and p.role = 'platform_admin');
$$;
create or replace function public.app_company_id() returns uuid
language sql stable security definer set search_path = public as $$
  select p.company_id from public.app_profiles p where p.user_id = auth.uid();
$$;

-- ── 5) RLS ポリシー ────────────────────────────────────────────────
-- 会社スコープ表: 運営=全件 / 会社管理者=自社のみ。（現場/勤務員はRPC経由・0401）
do $$
declare t text;
begin
  foreach t in array array[
    'companies','leave_requests','shift_hopes','shift_snapshots','seminars',
    'training_apps','notices','report_months','report_incidents','staff_sites'
  ] loop
    execute format('drop policy if exists %I_platform on public.%I;', t, t);
    execute format('drop policy if exists %I_company  on public.%I;', t, t);
  end loop;
end $$;

-- companies: 運営は全件、会社管理者は自社行のみ read
create policy companies_platform on public.companies for all
  using (public.app_is_platform()) with check (public.app_is_platform());
create policy companies_company on public.companies for select
  using (id = public.app_company_id());

-- 会社スコープ表（company_id で絞る）
do $$
declare t text;
begin
  foreach t in array array[
    'leave_requests','shift_hopes','shift_snapshots','seminars',
    'training_apps','notices','report_months','report_incidents'
  ] loop
    execute format($p$
      create policy %I_platform on public.%I for all
        using (public.app_is_platform()) with check (public.app_is_platform());
    $p$, t, t);
    execute format($p$
      create policy %I_company on public.%I for all
        using (company_id = public.app_company_id())
        with check (company_id = public.app_company_id());
    $p$, t, t);
  end loop;
end $$;

-- staff_sites: 会社スコープ（staff 経由）
create policy staff_sites_platform on public.staff_sites for all
  using (public.app_is_platform()) with check (public.app_is_platform());
create policy staff_sites_company on public.staff_sites for all
  using (exists (select 1 from public.staff s where s.id = staff_id and s.company_id = public.app_company_id()))
  with check (exists (select 1 from public.staff s where s.id = staff_id and s.company_id = public.app_company_id()));

-- ── 6) オンボーディングRPC ─────────────────────────────────────────
-- 6-1) 運営: 会社を発行（platform_admin のみ）
create or replace function public.platform_create_company(p_name text, p_code text)
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare v_id uuid;
begin
  if not public.app_is_platform() then raise exception '権限がありません(platform_admin)'; end if;
  insert into public.companies(name, code) values (p_name, p_code) returning id into v_id;
  return v_id;
end $$;

-- 6-2) 運営: 会社管理者プロフィールを紐付け（Authユーザー作成は service_role 側で実施し、その user_id を渡す）
create or replace function public.platform_link_company_admin(p_user_id uuid, p_company_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.app_is_platform() then raise exception '権限がありません(platform_admin)'; end if;
  insert into public.app_profiles(user_id, role, company_id)
    values (p_user_id, 'company_admin', p_company_id)
  on conflict (user_id) do update set role = 'company_admin', company_id = excluded.company_id;
end $$;

-- 6-3) 会社: 現場を作成し 施設コード＋現場PIN を発行（company_admin, 自社のみ）
create or replace function public.company_create_site(
  p_name text, p_code text, p_dept text, p_pin text
) returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare v_company uuid; v_site uuid; v_ccode text;
begin
  v_company := public.app_company_id();
  if v_company is null then raise exception '会社が特定できません'; end if;
  select code into v_ccode from public.companies where id = v_company;
  insert into public.sites(name, code, dept, company_id, is_active)
    values (p_name, p_code, p_dept, v_company, true) returning id into v_site;
  insert into public.app_site_credentials(company_code, site_code, pin_hash, site_id, company_id, site_name)
    values (v_ccode, p_code, extensions.crypt(p_pin, extensions.gen_salt('bf')), v_site, v_company, p_name);
  return v_site;
end $$;

-- 6-4) 会社/現場: 勤務員を登録し スタッフNo＋PIN を発行（company_admin, 自社のみ）
create or replace function public.company_register_staff(
  p_staff_no text, p_name text, p_dob date, p_dept text, p_role text,
  p_site_ids uuid[], p_pin text
) returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare v_company uuid; v_staff uuid; v_site uuid;
begin
  v_company := public.app_company_id();
  if v_company is null then raise exception '会社が特定できません'; end if;
  insert into public.staff(company_id, staff_no, name, dob, dept, role, pin_hash, is_active,
                           site_id)
    values (v_company, p_staff_no, p_name, p_dob, p_dept, p_role,
            extensions.crypt(p_pin, extensions.gen_salt('bf')), true, p_site_ids[1])
  on conflict (company_id, staff_no) do update
    set name = excluded.name, dob = excluded.dob, dept = excluded.dept, role = excluded.role
  returning id into v_staff;
  delete from public.staff_sites where staff_id = v_staff;
  foreach v_site in array coalesce(p_site_ids, '{}') loop
    insert into public.staff_sites(staff_id, site_id) values (v_staff, v_site) on conflict do nothing;
  end loop;
  return v_staff;
end $$;

-- 6-5) 勤務員ログイン（/app: スタッフNo＋PIN）。会社識別コードで会社を特定して照合。
create or replace function public.staff_login(p_company_code text, p_staff_no text, p_pin text)
returns table(staff_id uuid, name text, dept text, site_ids uuid[])
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
           coalesce(array(select ss.site_id from public.staff_sites ss where ss.staff_id = v_staff.id), '{}');
end $$;

-- 実行権限（匿名/認証クライアントから呼べるRPC）
grant execute on function public.platform_create_company(text,text)                to authenticated;
grant execute on function public.platform_link_company_admin(uuid,uuid)            to authenticated;
grant execute on function public.company_create_site(text,text,text,text)          to authenticated;
grant execute on function public.company_register_staff(text,text,date,text,text,uuid[],text) to authenticated;
grant execute on function public.staff_login(text,text,text)                       to anon, authenticated;

-- =====================================================================
-- 次段(0401): 現場/勤務員の業務RPC（submit/list/approve を site トークンで内部スコープ強制）、
--             会社/運営コンソール画面のSupabaseバインド、既存 localStorage ストアの移行。
-- =====================================================================
