-- 運営(/tradmin)アカウントの発行手順
-- ------------------------------------------------------------------
-- /tradmin は「メール＋パスワード」（Supabase Auth）でログインします。PINは使いません。
-- 作成は2ステップ:
--   ① Supabaseダッシュボード → Authentication → Users → "Add user" で
--      運営用メール＋パスワードのユーザーを作成（例: admin@tryangrow.com）。
--   ② 下のSQLを SQL Editor で実行し、そのユーザーに platform_admin ロールを付与。
-- ------------------------------------------------------------------
-- ※ メールアドレスを実際の運営アカウントに置き換えてください。
insert into public.app_profiles (user_id, role)
select id, 'platform_admin'
  from auth.users
 where email = 'admin@tryangrow.com'
on conflict (user_id) do update set role = 'platform_admin';

-- 確認:
-- select u.email, p.role from auth.users u join public.app_profiles p on p.user_id = u.id
--  where p.role = 'platform_admin';
