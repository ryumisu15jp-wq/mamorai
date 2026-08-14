-- 隊員と現場の割り当て(staff_sites)を補修する（勤務員登録が0名/空のとき）
-- 原因: seed実行の順序等で staff_sites が入らず、site_list_staff が0件になる。
-- 対象: 会社 HTH-8759 / 現場 BVL-01。安全・冪等（何度実行してもOK）。

-- 1) 現場を会社へ確実に紐付け（company_id が空/不一致なら補正）
update public.sites
   set company_id = (select id from public.companies where code = 'HTH-8759')
 where code = 'BVL-01'
   and company_id is distinct from (select id from public.companies where code = 'HTH-8759');

-- 2) 会社の全隊員を現場(BVL-01)へ割当（未割当のみ追加）
insert into public.staff_sites(staff_id, site_id)
select s.id, (select id from public.sites where code = 'BVL-01')
  from public.staff s
 where s.company_id = (select id from public.companies where code = 'HTH-8759')
   and not exists (
     select 1 from public.staff_sites ss
      where ss.staff_id = s.id
        and ss.site_id = (select id from public.sites where code = 'BVL-01'));

-- 3) 確認（6名返れば成功）
select staff_no, name, pin_current, pin_must_change
  from public.site_list_staff('HTH-8759', 'BVL-01');
