-- 0404_site_login.sql — 現場(/s)ログインRPC を確実に用意する（0300未適用でも/s が開けるように）
-- 会社識別コード＋施設コード＋現場PIN を app_site_credentials(0400) と照合。
-- pgcrypto は extensions スキーマ。戻り値型変更に備え DROP してから作成（冪等）。

create extension if not exists pgcrypto with schema extensions;

drop function if exists public.app_site_login(text, text, text);
create or replace function public.app_site_login(p_company_code text, p_site_code text, p_pin text)
returns table(site_id uuid, company_id uuid, site_name text)
language sql stable security definer set search_path = public, extensions as $$
  select c.site_id, c.company_id, c.site_name
    from public.app_site_credentials c
   where c.company_code = p_company_code
     and c.site_code    = p_site_code
     and c.pin_hash     = extensions.crypt(p_pin, c.pin_hash);
$$;

grant execute on function public.app_site_login(text, text, text) to anon, authenticated;
