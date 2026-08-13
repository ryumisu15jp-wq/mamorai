-- [Auth] 一括セットアップ（テーブル/RPC/シード + テストユーザーのロール登録まで）
-- Supabase の SQL Editor に「全文」貼り付けて Run。冪等（何回流してもOK）。
create extension if not exists pgcrypto with schema extensions;

-- 1) プロフィール（ロールと所属）
create table if not exists public.app_profiles (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  role       text not null check (role in ('company_admin','company_manager','platform_admin')),
  company_id uuid,
  site_id    uuid,
  created_at timestamptz not null default now()
);
alter table public.app_profiles enable row level security;
drop policy if exists app_profiles_self_read on public.app_profiles;
create policy app_profiles_self_read on public.app_profiles
  for select using (user_id = auth.uid());

-- 2) 現場ログイン資格情報（会社コード×施設コード×PINハッシュ）
create table if not exists public.app_site_credentials (
  id           uuid primary key default gen_random_uuid(),
  company_code text not null,
  site_code    text not null,
  pin_hash     text not null,
  site_id      uuid not null,
  company_id   uuid not null,
  site_name    text,
  active       boolean not null default true,
  unique (company_code, site_code)
);
alter table public.app_site_credentials enable row level security;

-- 3) 現場ログイン RPC（コード＋PIN照合。一致時のみ現場情報を返す）
create or replace function public.app_site_login(p_company_code text, p_site_code text, p_pin text)
returns table (site_id uuid, company_id uuid, site_name text)
language sql
security definer
set search_path = public, extensions
as $$
  select c.site_id, c.company_id, c.site_name
  from public.app_site_credentials c
  where c.active
    and c.company_code = upper(p_company_code)
    and c.site_code = upper(p_site_code)
    and c.pin_hash = extensions.crypt(p_pin, c.pin_hash)
$$;
revoke all on function public.app_site_login(text, text, text) from public;
grant execute on function public.app_site_login(text, text, text) to anon, authenticated;

-- 4) テスト現場シード（TRA-8821 / LALA-01 / PIN 1234）
insert into public.app_site_credentials (company_code, site_code, pin_hash, site_id, company_id, site_name)
values ('TRA-8821', 'LALA-01', extensions.crypt('1234', extensions.gen_salt('bf')),
        gen_random_uuid(), gen_random_uuid(), 'ららテラス立川')
on conflict (company_code, site_code) do nothing;

-- 5) テストユーザーのロール登録（あなたの2ユーザーのUID）
insert into public.app_profiles (user_id, role) values
  ('977ab75a-3d58-448a-9607-18b036c211e9', 'company_admin'),
  ('51cf005d-0442-42dc-a90d-097423e12052', 'platform_admin')
on conflict (user_id) do update set role = excluded.role;
