-- 0417_profile_requests: プロフィールの申請と承認（警備員名簿に載る項目）
-- 依存: 0414〜0416（staff_profiles / staff_credentials / staff_images / staff_profile_views / app_can_view_staff / worker_by_device）。追加のみ・冪等。
--
-- 方針
--   ・承認が要る項目（名簿に載るもの）: 氏名・ふりがな / 現住所 / 本籍（都道府県） / 顔写真 / 本人確認資料 / 資格・教育・健診の記録
--       勤務員が申請 → 本社PC・管理者（支店は担当現場）が承認または差し戻し（理由必須）→ 承認で初めて正式な値になる
--   ・承認が要らない項目: 電話・メール・緊急連絡先・学歴・業務経歴 → 勤務員が保存すると即反映
--   ・現場PCは見るだけ（承認できない。本人確認資料の写真も見られない）
--   ・0414 の直接書き込み RPC（worker_profile_save / worker_credential_* / worker_image_save / worker_image_delete）は、承認を迂回できないよう
--     中身を「申請が必要です」のエラーに置き換える（関数は残す＝旧画面は失敗するだけ）
--   ・マイナンバー・マイナンバーカードは預からない（本人確認資料に選べない旨は画面で案内）
--   ・氏名・住所・写真は個人情報。実データはコード・テスト・ログに書かない

-- ── 1) 列・表 ─────────────────────────────────────────────────────
alter table public.staff_profiles add column if not exists email            text;
alter table public.staff_profiles add column if not exists nearest_station  text;
alter table public.staff_profiles add column if not exists honseki_pref     text;
alter table public.staff_profiles add column if not exists emergency_name     text;
alter table public.staff_profiles add column if not exists emergency_relation text;
alter table public.staff_profiles add column if not exists emergency_phone    text;
alter table public.staff_profiles add column if not exists education    jsonb default '[]'::jsonb;
alter table public.staff_profiles add column if not exists work_history jsonb default '[]'::jsonb;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'staff_profiles_email_fmt') then
    alter table public.staff_profiles add constraint staff_profiles_email_fmt
      check (email is null or (char_length(email) <= 100 and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'staff_profiles_honseki_fmt') then
    alter table public.staff_profiles add constraint staff_profiles_honseki_fmt
      check (honseki_pref is null or honseki_pref ~ '^(北海道|東京都|大阪府|京都府|.{2,3}県)$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'staff_profiles_emergency_fmt') then
    alter table public.staff_profiles add constraint staff_profiles_emergency_fmt
      check ((emergency_name is null or char_length(emergency_name) <= 40)
         and (emergency_relation is null or char_length(emergency_relation) <= 20)
         and (emergency_phone is null or emergency_phone ~ '^(\+[1-9][0-9]{7,14}|0[0-9]{9,10})$')
         and (nearest_station is null or char_length(nearest_station) <= 60));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'staff_profiles_career_fmt') then
    alter table public.staff_profiles add constraint staff_profiles_career_fmt
      check ((education is null or (jsonb_typeof(education) = 'array' and jsonb_array_length(education) <= 10))
         and (work_history is null or (jsonb_typeof(work_history) = 'array' and jsonb_array_length(work_history) <= 20)));
  end if;
end $$;

-- 本人確認資料の写真（運転免許証・パスポート・健康保険証・その他。マイナンバーカードは対象外）
create table if not exists public.staff_id_docs (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  staff_id   uuid not null references public.staff(id) on delete cascade,
  doc_type   text not null,
  mime       text not null,
  data       bytea not null,
  updated_at timestamptz not null default now(),
  constraint staff_id_docs_type check (doc_type in ('license', 'passport', 'health_insurance', 'other')),
  constraint staff_id_docs_mime check (mime in ('image/jpeg', 'image/png', 'image/webp')),
  constraint staff_id_docs_size check (octet_length(data) between 1 and 1100000),
  constraint staff_id_docs_uq unique (staff_id, doc_type)
);

-- 申請（承認が要る項目）
create table if not exists public.profile_requests (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id),
  staff_id    uuid not null references public.staff(id) on delete cascade,
  category    text not null,
  payload     jsonb not null default '{}'::jsonb,
  image       bytea,
  image_mime  text,
  status      text not null default 'pending',
  submitted_at timestamptz not null default now(),
  decided_at  timestamptz,
  decided_by  text,
  note        text,
  constraint profile_requests_category check (category in ('name', 'address', 'honseki', 'face', 'id_doc', 'credential')),
  constraint profile_requests_status check (status in ('pending', 'approved', 'rejected', 'withdrawn')),
  constraint profile_requests_image check (image is null or (image_mime in ('image/jpeg', 'image/png', 'image/webp') and octet_length(image) <= 1100000)),
  constraint profile_requests_note_len check (note is null or char_length(note) <= 300)
);
create index if not exists profile_requests_staff_idx   on public.profile_requests(staff_id, status);
create index if not exists profile_requests_company_idx on public.profile_requests(company_id, status, submitted_at);
-- 同じ項目の申請待ちは1件（資格は複数、本人確認資料は種類ごとに1件）
create unique index if not exists profile_requests_one_pending
  on public.profile_requests(staff_id, category) where status = 'pending' and category in ('name', 'address', 'honseki', 'face');
create unique index if not exists profile_requests_one_pending_doc
  on public.profile_requests(staff_id, (payload->>'doc_type')) where status = 'pending' and category = 'id_doc';

alter table public.staff_id_docs     enable row level security;
alter table public.profile_requests  enable row level security;
revoke all on public.staff_id_docs, public.profile_requests from anon, authenticated;

-- ── 2) 内部の部品（直接は呼べない）────────────────────────────────────
-- 申請の中身を検査して、整えた payload を返す
create or replace function public.profile_request_normalize(p_category text, p_payload jsonb) returns jsonb
language plpgsql immutable set search_path = public as $$
declare v jsonb := coalesce(p_payload, '{}'::jsonb); t text; k text; d1 date; d2 date; i uuid;
begin
  if jsonb_typeof(v) <> 'object' then raise exception '申請の内容が正しくありません'; end if;
  if p_category = 'name' then
    t := btrim(coalesce(v->>'name', ''));
    if t = '' or char_length(t) > 40 then raise exception '氏名は1〜40文字で入力してください'; end if;
    if char_length(coalesce(v->>'furigana', '')) > 60 then raise exception 'ふりがなは60文字までです'; end if;
    return jsonb_build_object('name', t, 'furigana', nullif(btrim(coalesce(v->>'furigana', '')), ''));
  elsif p_category = 'address' then
    t := btrim(coalesce(v->>'address', ''));
    if t = '' or char_length(t) > 200 then raise exception '現住所は1〜200文字で入力してください'; end if;
    if nullif(btrim(coalesce(v->>'postal_code', '')), '') is not null and btrim(v->>'postal_code') !~ '^[0-9]{3}-?[0-9]{4}$' then
      raise exception '郵便番号の形式が正しくありません（例: 100-0001）'; end if;
    if char_length(coalesce(v->>'nearest_station', '')) > 60 then raise exception '最寄駅は60文字までです'; end if;
    return jsonb_build_object('postal_code', nullif(btrim(coalesce(v->>'postal_code', '')), ''), 'address', t,
                              'nearest_station', nullif(btrim(coalesce(v->>'nearest_station', '')), ''));
  elsif p_category = 'honseki' then
    t := btrim(coalesce(v->>'pref', ''));
    if t !~ '^(北海道|東京都|大阪府|京都府|.{2,3}県)$' then raise exception '本籍は都道府県で入力してください'; end if;
    return jsonb_build_object('pref', t);
  elsif p_category = 'face' then
    return '{}'::jsonb;
  elsif p_category = 'id_doc' then
    k := coalesce(v->>'doc_type', '');
    if k not in ('license', 'passport', 'health_insurance', 'other') then raise exception '本人確認資料の種類が正しくありません（マイナンバーカードは使えません）'; end if;
    return jsonb_build_object('doc_type', k);
  elsif p_category = 'credential' then
    k := coalesce(v->>'action', 'upsert');
    if k not in ('upsert', 'delete') then raise exception '申請の内容が正しくありません'; end if;
    begin i := nullif(v->>'id', '')::uuid; exception when others then raise exception '記録の指定が正しくありません'; end;
    if k = 'delete' then
      if i is null then raise exception '削除する記録を指定してください'; end if;
      return jsonb_build_object('action', 'delete', 'id', i);
    end if;
    if coalesce(v->>'kind', '') not in ('kentei', 'shido', 'shinnin', 'genin', 'kenshin', 'other') then raise exception '種類が正しくありません'; end if;
    if char_length(coalesce(v->>'label', '')) > 60 then raise exception '名称・メモは60文字までです'; end if;
    begin d1 := nullif(v->>'obtained_on', '')::date; d2 := nullif(v->>'expires_on', '')::date;
    exception when others then raise exception '日付の形式が正しくありません'; end;
    if d1 is not null and d2 is not null and d2 < d1 then raise exception '有効期限が取得日より前です'; end if;
    return jsonb_build_object('action', 'upsert', 'id', i, 'kind', v->>'kind', 'label', nullif(btrim(coalesce(v->>'label', '')), ''),
                              'obtained_on', d1, 'expires_on', d2);
  end if;
  raise exception '申請の種類が正しくありません';
end $$;

-- 申請の現在値（承認画面で「変更前」を見せる）
create or replace function public.profile_request_current(p_staff uuid, p_category text, p_payload jsonb) returns jsonb
language sql stable security definer set search_path = public as $$
  select case p_category
    when 'name'    then jsonb_build_object('name', s.name, 'furigana', p.furigana)
    when 'address' then jsonb_build_object('postal_code', p.postal_code, 'address', p.address, 'nearest_station', p.nearest_station)
    when 'honseki' then jsonb_build_object('pref', p.honseki_pref)
    when 'face'    then jsonb_build_object('registered', exists (select 1 from public.staff_images i where i.staff_id = s.id and i.kind = 'face'))
    when 'id_doc'  then jsonb_build_object('registered', exists (select 1 from public.staff_id_docs d where d.staff_id = s.id and d.doc_type = p_payload->>'doc_type'))
    when 'credential' then (select jsonb_build_object('kind', c.kind, 'label', c.label, 'obtained_on', c.obtained_on, 'expires_on', c.expires_on)
                              from public.staff_credentials c where c.staff_id = s.id and c.id = nullif(p_payload->>'id', '')::uuid)
  end
  from public.staff s left join public.staff_profiles p on p.staff_id = s.id where s.id = p_staff;
$$;

-- 承認したときの反映
create or replace function public.profile_request_apply(r public.profile_requests) returns void
language plpgsql security definer set search_path = public as $$
declare v jsonb := r.payload; n int; cid uuid;
begin
  if r.category = 'name' then
    update public.staff set name = v->>'name' where id = r.staff_id;
    insert into public.staff_profiles(staff_id, company_id, furigana) values (r.staff_id, r.company_id, v->>'furigana')
      on conflict (staff_id) do update set furigana = excluded.furigana, updated_at = now();
  elsif r.category = 'address' then
    insert into public.staff_profiles(staff_id, company_id, postal_code, address, nearest_station)
      values (r.staff_id, r.company_id, v->>'postal_code', v->>'address', v->>'nearest_station')
      on conflict (staff_id) do update set postal_code = excluded.postal_code, address = excluded.address,
             nearest_station = excluded.nearest_station, updated_at = now();
  elsif r.category = 'honseki' then
    insert into public.staff_profiles(staff_id, company_id, honseki_pref) values (r.staff_id, r.company_id, v->>'pref')
      on conflict (staff_id) do update set honseki_pref = excluded.honseki_pref, updated_at = now();
  elsif r.category = 'face' then
    if r.image is null then raise exception '写真がありません'; end if;
    insert into public.staff_images(company_id, staff_id, kind, mime, data) values (r.company_id, r.staff_id, 'face', r.image_mime, r.image)
      on conflict (staff_id) where kind = 'face' do update set mime = excluded.mime, data = excluded.data, updated_at = now();
  elsif r.category = 'id_doc' then
    if r.image is null then raise exception '写真がありません'; end if;
    insert into public.staff_id_docs(company_id, staff_id, doc_type, mime, data) values (r.company_id, r.staff_id, v->>'doc_type', r.image_mime, r.image)
      on conflict (staff_id, doc_type) do update set mime = excluded.mime, data = excluded.data, updated_at = now();
  elsif r.category = 'credential' then
    if v->>'action' = 'delete' then
      delete from public.staff_credentials where id = (v->>'id')::uuid and staff_id = r.staff_id;
      if not found then raise exception '対象の記録が見つかりません（すでに削除されています）'; end if;
    elsif nullif(v->>'id', '') is not null then
      update public.staff_credentials set kind = v->>'kind', label = v->>'label', obtained_on = (v->>'obtained_on')::date,
             expires_on = (v->>'expires_on')::date, updated_at = now()
       where id = (v->>'id')::uuid and staff_id = r.staff_id returning id into cid;
      if cid is null then raise exception '対象の記録が見つかりません（すでに削除されています）'; end if;
    else
      select count(*) into n from public.staff_credentials c where c.staff_id = r.staff_id;
      if n >= 30 then raise exception '登録できる記録は30件までです'; end if;
      insert into public.staff_credentials(company_id, staff_id, kind, label, obtained_on, expires_on)
        values (r.company_id, r.staff_id, v->>'kind', v->>'label', (v->>'obtained_on')::date, (v->>'expires_on')::date) returning id into cid;
    end if;
    if r.image is not null and v->>'action' <> 'delete' then
      insert into public.staff_images(company_id, staff_id, kind, credential_id, mime, data) values (r.company_id, r.staff_id, 'credential', cid, r.image_mime, r.image)
        on conflict (credential_id) where kind = 'credential' do update set mime = excluded.mime, data = excluded.data, updated_at = now();
    end if;
  end if;
end $$;

-- 本人・本社・現場が見る個人情報（0414 を拡張: 新しい項目・申請の状況・本人確認資料の登録状況）
create or replace function public.staff_profile_json(p_staff uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'staff_no', s.staff_no, 'name', s.name, 'dob', s.dob, 'phone', s.phone,
    'furigana', p.furigana, 'postal_code', p.postal_code, 'address', p.address,
    'nearest_station', p.nearest_station, 'email', p.email, 'honseki_pref', p.honseki_pref,
    'emergency', jsonb_build_object('name', p.emergency_name, 'relation', p.emergency_relation, 'phone', p.emergency_phone),
    'education', coalesce(p.education, '[]'::jsonb), 'work_history', coalesce(p.work_history, '[]'::jsonb),
    'has_face', exists (select 1 from public.staff_images i where i.staff_id = s.id and i.kind = 'face'),
    'id_docs', coalesce((select jsonb_agg(d.doc_type order by d.doc_type) from public.staff_id_docs d where d.staff_id = s.id), '[]'::jsonb),
    'credentials', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', c.id, 'kind', c.kind, 'label', c.label, 'obtained_on', c.obtained_on, 'expires_on', c.expires_on,
               'has_image', exists (select 1 from public.staff_images i where i.credential_id = c.id))
             order by c.expires_on nulls last, c.created_at)
        from public.staff_credentials c where c.staff_id = s.id), '[]'::jsonb),
    'requests', coalesce((
      select jsonb_agg(jsonb_build_object('id', q.id, 'category', q.category, 'status', q.status, 'note', q.note,
               'submitted_at', q.submitted_at, 'decided_at', q.decided_at, 'payload', q.payload, 'has_image', q.image is not null)
             order by q.submitted_at desc)
        from public.profile_requests q
       where q.staff_id = s.id and (q.status = 'pending' or (q.status = 'rejected' and q.decided_at > now() - interval '30 days'))), '[]'::jsonb))
    from public.staff s left join public.staff_profiles p on p.staff_id = s.id
   where s.id = p_staff;
$$;

create or replace function public.staff_id_doc_b64(p_staff uuid, p_doc_type text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('mime', d.mime, 'base64', replace(encode(d.data, 'base64'), E'\n', ''))
    from public.staff_id_docs d where d.staff_id = p_staff and d.doc_type = p_doc_type;
$$;

-- ── 3) 勤務員アプリ（端末シークレットで本人だけ）───────────────────────
-- 承認が要る項目を直接書く旧RPCは、迂回できないようエラーにする（旧画面は失敗するだけ）
create or replace function public.worker_profile_save(p_device_secret text, p_furigana text, p_postal_code text, p_address text, p_phone text) returns void
language plpgsql security definer set search_path = public as $$
begin raise exception 'この項目は申請が必要になりました。アプリを最新の画面に更新してください'; end $$;
create or replace function public.worker_credential_save(p_device_secret text, p_id uuid, p_kind text, p_label text, p_obtained_on date, p_expires_on date) returns uuid
language plpgsql security definer set search_path = public as $$
begin raise exception 'この項目は申請が必要になりました。アプリを最新の画面に更新してください'; end $$;
create or replace function public.worker_credential_delete(p_device_secret text, p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin raise exception 'この項目は申請が必要になりました。アプリを最新の画面に更新してください'; end $$;
create or replace function public.worker_image_save(p_device_secret text, p_kind text, p_credential_id uuid, p_mime text, p_base64 text) returns void
language plpgsql security definer set search_path = public as $$
begin raise exception 'この項目は申請が必要になりました。アプリを最新の画面に更新してください'; end $$;
create or replace function public.worker_image_delete(p_device_secret text, p_kind text, p_credential_id uuid default null) returns void
language plpgsql security definer set search_path = public as $$
begin raise exception 'この項目は申請が必要になりました。アプリを最新の画面に更新してください'; end $$;

-- 連絡先（電話・メール・緊急連絡先）: 承認なしで即反映
create or replace function public.worker_contact_save(
  p_device_secret text, p_phone text, p_email text, p_emergency_name text, p_emergency_relation text, p_emergency_phone text
) returns void language plpgsql security definer set search_path = public as $$
declare w record;
  v_phone text := nullif(regexp_replace(coalesce(p_phone, ''), '[-\s]', '', 'g'), '');
  v_ephone text := nullif(regexp_replace(coalesce(p_emergency_phone, ''), '[-\s]', '', 'g'), '');
  v_email text := nullif(btrim(coalesce(p_email, '')), '');
begin
  select * into w from public.worker_by_device(p_device_secret);
  if v_phone is not null and v_phone !~ '^(\+[1-9][0-9]{7,14}|0[0-9]{9,10})$' then raise exception '電話番号の形式が正しくありません（例: 09012345678）'; end if;
  if v_ephone is not null and v_ephone !~ '^(\+[1-9][0-9]{7,14}|0[0-9]{9,10})$' then raise exception '緊急連絡先の電話番号の形式が正しくありません'; end if;
  if v_email is not null and (char_length(v_email) > 100 or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$') then raise exception 'メールアドレスの形式が正しくありません'; end if;
  if char_length(coalesce(p_emergency_name, '')) > 40 then raise exception '緊急連絡先の氏名は40文字までです'; end if;
  if char_length(coalesce(p_emergency_relation, '')) > 20 then raise exception '緊急連絡先の続柄は20文字までです'; end if;
  insert into public.staff_profiles(staff_id, company_id, email, emergency_name, emergency_relation, emergency_phone, updated_at)
    values (w.staff_id, w.company_id, v_email, nullif(btrim(coalesce(p_emergency_name, '')), ''), nullif(btrim(coalesce(p_emergency_relation, '')), ''), v_ephone, now())
  on conflict (staff_id) do update set email = excluded.email, emergency_name = excluded.emergency_name,
         emergency_relation = excluded.emergency_relation, emergency_phone = excluded.emergency_phone, updated_at = now();
  update public.staff set phone = v_phone where id = w.staff_id;
end $$;

-- 経歴（学歴・業務経歴）: 承認なしで即反映。学歴は10件・業務経歴は20件まで
create or replace function public.worker_career_save(p_device_secret text, p_education jsonb, p_work_history jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare w record; e jsonb; edu jsonb := '[]'::jsonb; wh jsonb := '[]'::jsonb; y1 int; y2 int;
begin
  select * into w from public.worker_by_device(p_device_secret);
  if jsonb_typeof(coalesce(p_education, '[]'::jsonb)) <> 'array' or jsonb_typeof(coalesce(p_work_history, '[]'::jsonb)) <> 'array' then raise exception '経歴の形式が正しくありません'; end if;
  if jsonb_array_length(coalesce(p_education, '[]'::jsonb)) > 10 then raise exception '学歴は10件までです'; end if;
  if jsonb_array_length(coalesce(p_work_history, '[]'::jsonb)) > 20 then raise exception '業務経歴は20件までです'; end if;
  for e in select * from jsonb_array_elements(coalesce(p_education, '[]'::jsonb)) loop
    if btrim(coalesce(e->>'school', '')) = '' or char_length(e->>'school') > 60 then raise exception '学校名は1〜60文字で入力してください'; end if;
    begin y1 := nullif(e->>'entered_year', '')::int; y2 := nullif(e->>'graduated_year', '')::int;
    exception when others then raise exception '入学年・卒業年は数字で入力してください'; end;
    if (y1 is not null and y1 not between 1900 and 2100) or (y2 is not null and y2 not between 1900 and 2100) then raise exception '入学年・卒業年は西暦4桁で入力してください'; end if;
    edu := edu || jsonb_build_array(jsonb_build_object('school', btrim(e->>'school'), 'entered_year', y1, 'graduated_year', y2));
  end loop;
  for e in select * from jsonb_array_elements(coalesce(p_work_history, '[]'::jsonb)) loop
    if btrim(coalesce(e->>'company', '')) = '' or char_length(e->>'company') > 60 then raise exception '勤務先・業種は1〜60文字で入力してください'; end if;
    if char_length(coalesce(e->>'detail', '')) > 200 then raise exception '仕事内容は200文字までです'; end if;
    if coalesce(e->>'from', '') <> '' and (e->>'from') !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then raise exception '期間は「2020-04」の形式で入力してください'; end if;
    if coalesce(e->>'to', '') <> '' and (e->>'to') !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then raise exception '期間は「2020-04」の形式で入力してください'; end if;
    wh := wh || jsonb_build_array(jsonb_build_object('company', btrim(e->>'company'), 'detail', nullif(btrim(coalesce(e->>'detail', '')), ''),
                                                    'from', nullif(e->>'from', ''), 'to', nullif(e->>'to', '')));
  end loop;
  insert into public.staff_profiles(staff_id, company_id, education, work_history, updated_at) values (w.staff_id, w.company_id, edu, wh, now())
  on conflict (staff_id) do update set education = excluded.education, work_history = excluded.work_history, updated_at = now();
end $$;

-- 申請する（承認が要る項目）。同じ項目の申請待ちがあれば置き換える（資格は複数、本人確認資料は種類ごと）
create or replace function public.worker_request_submit(
  p_device_secret text, p_category text, p_payload jsonb, p_image_base64 text default null, p_mime text default null
) returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare w record; v jsonb; v_img bytea; v_id uuid; n int;
begin
  select * into w from public.worker_by_device(p_device_secret);
  v := public.profile_request_normalize(p_category, p_payload);
  if p_image_base64 is not null and p_image_base64 <> '' then
    if p_mime not in ('image/jpeg', 'image/png', 'image/webp') then raise exception '画像の形式は JPEG・PNG・WebP です'; end if;
    if length(p_image_base64) > 1500000 then raise exception '画像が大きすぎます。撮り直してください'; end if;
    begin v_img := decode(p_image_base64, 'base64'); exception when others then raise exception '画像を読み取れませんでした'; end;
    if octet_length(v_img) < 1 then raise exception '画像を読み取れませんでした'; end if;
  end if;
  if p_category in ('face', 'id_doc') and v_img is null then raise exception '写真を添えてください'; end if;
  if p_category <> 'credential' and p_category not in ('face', 'id_doc') then v_img := null; end if;
  if p_category = 'credential' then
    select count(*) into n from public.profile_requests q where q.staff_id = w.staff_id and q.category = 'credential' and q.status = 'pending';
    if n >= 20 then raise exception '承認待ちの申請が多すぎます。承認されてから申請してください'; end if;
    -- 同じ記録への申請待ちは置き換える
    if nullif(v->>'id', '') is not null then
      update public.profile_requests set status = 'withdrawn', decided_at = now(), note = '再申請で置き換え', image = null
       where staff_id = w.staff_id and category = 'credential' and status = 'pending' and payload->>'id' = v->>'id';
    end if;
  elsif p_category = 'id_doc' then
    update public.profile_requests set status = 'withdrawn', decided_at = now(), note = '再申請で置き換え', image = null
     where staff_id = w.staff_id and category = 'id_doc' and status = 'pending' and payload->>'doc_type' = v->>'doc_type';
  else
    update public.profile_requests set status = 'withdrawn', decided_at = now(), note = '再申請で置き換え', image = null
     where staff_id = w.staff_id and category = p_category and status = 'pending';
  end if;
  insert into public.profile_requests(company_id, staff_id, category, payload, image, image_mime)
    values (w.company_id, w.staff_id, p_category, v, v_img, case when v_img is null then null else p_mime end) returning id into v_id;
  return v_id;
end $$;

create or replace function public.worker_request_withdraw(p_device_secret text, p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare w record;
begin
  select * into w from public.worker_by_device(p_device_secret);
  update public.profile_requests set status = 'withdrawn', decided_at = now(), note = '本人が取り下げ', image = null
   where id = p_id and staff_id = w.staff_id and status = 'pending';
end $$;

-- ── 4) 本社PC・管理者・支店（承認）──────────────────────────────────
create or replace function public.company_list_requests() returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_company uuid := public.app_company_id();
begin
  if v_company is null then raise exception '権限がありません'; end if;
  return coalesce((
    select jsonb_agg(x order by x->>'submitted_at') from (
      select jsonb_build_object('id', q.id, 'staff_no', s.staff_no, 'name', s.name, 'category', q.category, 'payload', q.payload,
               'current', public.profile_request_current(q.staff_id, q.category, q.payload),
               'has_image', q.image is not null, 'submitted_at', q.submitted_at) as x
        from public.profile_requests q join public.staff s on s.id = q.staff_id
       where q.company_id = v_company and q.status = 'pending' and public.app_can_view_staff(q.staff_id)) z), '[]'::jsonb);
end $$;

create or replace function public.company_request_image(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r public.profile_requests;
begin
  select * into r from public.profile_requests where id = p_id and company_id = public.app_company_id();
  if r.id is null or not public.app_can_view_staff(r.staff_id) then raise exception '見られる申請ではありません'; end if;
  insert into public.staff_profile_views(company_id, staff_id, viewer_kind, viewer, what)
    values (r.company_id, r.staff_id, 'hq', public.app_actor_label(), case r.category when 'face' then 'face' when 'id_doc' then 'id_doc' else 'credential' end);
  if r.image is null then return null; end if;
  return jsonb_build_object('mime', r.image_mime, 'base64', replace(encode(r.image, 'base64'), E'\n', ''));
end $$;

create or replace function public.company_request_decide(p_id uuid, p_approve boolean, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
declare r public.profile_requests; v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  select * into r from public.profile_requests where id = p_id and company_id = public.app_company_id() for update;
  if r.id is null or not public.app_can_view_staff(r.staff_id) then raise exception '承認できる申請ではありません'; end if;
  if r.status <> 'pending' then raise exception 'この申請はすでに処理されています'; end if;
  if v_note is not null and char_length(v_note) > 300 then raise exception 'コメントは300文字までです'; end if;
  if p_approve then
    perform public.profile_request_apply(r);
    update public.profile_requests set status = 'approved', decided_at = now(), decided_by = public.app_actor_label(), note = v_note, image = null where id = r.id;
  else
    if v_note is null then raise exception '差し戻しの理由を入力してください'; end if;
    update public.profile_requests set status = 'rejected', decided_at = now(), decided_by = public.app_actor_label(), note = v_note, image = null where id = r.id;
  end if;
end $$;

-- 本人確認資料の写真（本社PC・管理者・支店だけ。現場PCは見られない）
create or replace function public.company_staff_id_doc(p_staff_no text, p_doc_type text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_staff uuid; v_company uuid;
begin
  select s.id, s.company_id into v_staff, v_company from public.staff s where s.staff_no = p_staff_no and s.company_id = public.app_company_id();
  if v_staff is null or not public.app_can_view_staff(v_staff) then raise exception '見られる勤務員ではありません'; end if;
  insert into public.staff_profile_views(company_id, staff_id, viewer_kind, viewer, what) values (v_company, v_staff, 'hq', public.app_actor_label(), 'id_doc');
  return public.staff_id_doc_b64(v_staff, p_doc_type);
end $$;

-- 一覧に「承認待ちの件数」を足す（0415 の拡張）
create or replace function public.company_list_staff() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_company uuid := public.app_company_id(); v_today date := (now() at time zone 'Asia/Tokyo')::date;
begin
  if v_company is null then raise exception '権限がありません'; end if;
  return coalesce((
    select jsonb_agg(x order by x->>'staff_no') from (
      select jsonb_build_object(
        'staff_no', s.staff_no, 'name', s.name, 'is_active', coalesce(s.is_active, true),
        'sites', coalesce((select jsonb_agg(st.name order by st.name)
                             from public.staff_sites ss join public.sites st on st.id = ss.site_id
                            where ss.staff_id = s.id), '[]'::jsonb),
        'has_profile', exists (select 1 from public.staff_profiles p where p.staff_id = s.id and (p.address is not null or p.furigana is not null)),
        'has_face', exists (select 1 from public.staff_images i where i.staff_id = s.id and i.kind = 'face'),
        'credential_count', (select count(*) from public.staff_credentials c where c.staff_id = s.id),
        'expired_count', (select count(*) from public.staff_credentials c where c.staff_id = s.id and c.expires_on < v_today),
        'soon_count', (select count(*) from public.staff_credentials c where c.staff_id = s.id and c.expires_on >= v_today and c.expires_on <= v_today + 30),
        'pending_count', (select count(*) from public.profile_requests q where q.staff_id = s.id and q.status = 'pending')
      ) as x
      from public.staff s
     where s.company_id = v_company and public.app_can_view_staff(s.id)
    ) q), '[]'::jsonb);
end $$;

-- ── 5) 権限 ──────────────────────────────────────────────────────
revoke all on function public.profile_request_normalize(text,jsonb) from public, anon, authenticated;
revoke all on function public.profile_request_current(uuid,text,jsonb) from public, anon, authenticated;
revoke all on function public.profile_request_apply(public.profile_requests) from public, anon, authenticated;
revoke all on function public.staff_id_doc_b64(uuid,text) from public, anon, authenticated;
revoke all on function public.worker_contact_save(text,text,text,text,text,text) from public;
revoke all on function public.worker_career_save(text,jsonb,jsonb) from public;
revoke all on function public.worker_request_submit(text,text,jsonb,text,text) from public;
revoke all on function public.worker_request_withdraw(text,uuid) from public;
revoke all on function public.company_list_requests() from public, anon;
revoke all on function public.company_request_image(uuid) from public, anon;
revoke all on function public.company_request_decide(uuid,boolean,text) from public, anon;
revoke all on function public.company_staff_id_doc(text,text) from public, anon;
grant execute on function public.worker_contact_save(text,text,text,text,text,text) to anon, authenticated;
grant execute on function public.worker_career_save(text,jsonb,jsonb) to anon, authenticated;
grant execute on function public.worker_request_submit(text,text,jsonb,text,text) to anon, authenticated;
grant execute on function public.worker_request_withdraw(text,uuid) to anon, authenticated;
grant execute on function public.company_list_requests() to authenticated;
grant execute on function public.company_request_image(uuid) to authenticated;
grant execute on function public.company_request_decide(uuid,boolean,text) to authenticated;
grant execute on function public.company_staff_id_doc(text,text) to authenticated;
