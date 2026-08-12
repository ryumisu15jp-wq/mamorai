-- [Auth] 実認証スキーマ（追加のみ・非破壊）
-- 会社/運営: Supabase Auth ユーザ ← app_profiles でロール解決
-- 施設(現場): app_site_login RPC（会社コード＋施設コード＋PIN照合。PINはハッシュ保存）
create extension if not exists pgcrypto;

-- 1) プロフィール: auth.users のロールと所属
create table if not exists app_profiles (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  role       text not null check (role in ('company_admin','company_manager','platform_admin')),
  company_id uuid,
  site_id    uuid,
  created_at timestamptz not null default now()
);
alter table app_profiles enable row level security;
-- 本人のみ自分のプロフィールを読める
drop policy if exists app_profiles_self_read on app_profiles;
create policy app_profiles_self_read on app_profiles
  for select using (user_id = auth.uid());

-- 2) 現場ログイン用の資格情報（会社コード×施設コード×PINハッシュ）
create table if not exists app_site_credentials (
  id           uuid primary key default gen_random_uuid(),
  company_code text not null,
  site_code    text not null,
  pin_hash     text not null,           -- crypt(pin, gen_salt('bf'))
  site_id      uuid not null,
  company_id   uuid not null,
  site_name    text,
  active       boolean not null default true,
  unique (company_code, site_code)
);
alter table app_site_credentials enable row level security;
-- 直接の読み取りは不可（RPC(SECURITY DEFINER)経由のみ）。ポリシーを作らない＝anon/authは0行。

-- 3) 現場ログイン RPC: コード＋PINを照合し、一致時のみ現場情報を返す
create or replace function app_site_login(p_company_code text, p_site_code text, p_pin text)
returns table (site_id uuid, company_id uuid, site_name text)
language sql
security definer
set search_path = public
as $$
  select c.site_id, c.company_id, c.site_name
  from app_site_credentials c
  where c.active
    and c.company_code = upper(p_company_code)
    and c.site_code = upper(p_site_code)
    and c.pin_hash = crypt(p_pin, c.pin_hash)
$$;
revoke all on function app_site_login(text, text, text) from public;
grant execute on function app_site_login(text, text, text) to anon, authenticated;

-- 4) テスト用シード（本番では実データに差し替え）。PINは bcrypt でハッシュ化して保存。
--    会社: TRA-8821 / 施設: LALA-01 / PIN: 1234
insert into app_site_credentials (company_code, site_code, pin_hash, site_id, company_id, site_name)
values ('TRA-8821', 'LALA-01', crypt('1234', gen_salt('bf')),
        gen_random_uuid(), gen_random_uuid(), 'ららテラス立川')
on conflict (company_code, site_code) do nothing;
