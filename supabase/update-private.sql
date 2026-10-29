-- Supabase > SQL Editor 에 이 파일 전체를 붙여넣고 Run 하세요. (여러 번 실행해도 안전합니다)
-- 포함: 주운 물건(습득)의 사진·위치를 관리자만 보게 하기
--  · 새로 접수되는 글은 사진·위치가 누구나 읽는 표(reports)에 저장되지 않고 별도 보관소(report_private)에 저장됩니다.
--  · 이미 접수된 습득 글도 이 파일을 실행하면 같은 보관소로 옮겨집니다.
-- ※ 먼저 update-phone.sql 이 실행되어 있어야 합니다 (report_private 표를 씁니다).

alter table public.report_private alter column phone drop not null;
alter table public.report_private add column if not exists photo text;
alter table public.report_private add column if not exists shot text;
alter table public.report_private add column if not exists label text;
alter table public.report_private add column if not exists pin jsonb;
alter table public.report_private add column if not exists found_set boolean not null default false;

-- 전화번호: 보관소에 이미 행이 있어도(사진·위치가 먼저 저장된 경우) 번호를 한 번 채울 수 있다
create or replace function public.set_private_phone(rid uuid, phone_in text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if phone_in !~ '^010-[0-9]{3,4}-[0-9]{4}$' then raise exception '전화번호 형식이 올바르지 않습니다.'; end if;
  if not exists (select 1 from public.reports where id = rid and created_at > now() - interval '2 minutes') then raise exception '전화번호를 정할 수 없습니다.'; end if;
  insert into public.report_private (report_id, phone) values (rid, phone_in)
  on conflict (report_id) do update set phone = excluded.phone where public.report_private.phone is null;
end $$;
grant execute on function public.set_private_phone(uuid, text) to anon;

-- 방금(2분 안에) 접수된 습득 글에만, 아직 정해지지 않았을 때 한 번 저장할 수 있다
create or replace function public.set_private_found(rid uuid, photo_in text, shot_in text, label_in text, pin_in jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.reports where id = rid and created_at > now() - interval '2 minutes') then raise exception '저장할 수 없습니다.'; end if;
  insert into public.report_private (report_id, photo, shot, label, pin, found_set) values (rid, photo_in, shot_in, left(label_in, 80), pin_in, true)
  on conflict (report_id) do update set photo = excluded.photo, shot = excluded.shot, label = excluded.label, pin = excluded.pin, found_set = true
  where public.report_private.found_set is not true;
end $$;
grant execute on function public.set_private_found(uuid, text, text, text, jsonb) to anon;

-- 관리자: 주운 물건의 사진·위치를 본다
create or replace function public.admin_get_found(rid uuid, pin_in text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if pin_in is distinct from (select pin from public.admin_secret limit 1) then
    raise exception 'PIN이 올바르지 않습니다.';
  end if;
  return (select jsonb_build_object('photo', photo, 'shot', shot, 'label', label, 'pin', pin) from public.report_private where report_id = rid);
end $$;
grant execute on function public.admin_get_found(uuid, text) to anon;

-- 작성자가 글을 고칠 때: 습득 글의 사진은 보관소에 저장한다 (누구나 읽는 표에 다시 노출되지 않게)
create or replace function public.update_report(rid uuid, pin_in text, new_category text, new_detail text, new_lost_found text, new_photo text)
returns void language plpgsql security definer set search_path = public as $$
declare is_found boolean;
begin
  if not public.check_owner_pin(rid, pin_in) then raise exception 'PIN이 올바르지 않습니다.'; end if;
  select public.report_prefix(kind, lost_found) = 'f' into is_found from public.reports where id = rid;
  update public.reports set category = left(coalesce(nullif(trim(new_category), ''), '기타'), 20), detail = left(coalesce(new_detail, ''), 1000),
    lost_found = case when kind = chr(48516)||chr(49892)||chr(47932) and new_lost_found in (chr(48516)||chr(49892), chr(49845)||chr(46301)) then new_lost_found else lost_found end,
    photo = case when is_found then photo else coalesce(new_photo, photo) end where id = rid;
  if is_found and new_photo is not null then
    insert into public.report_private (report_id, photo) values (rid, new_photo)
    on conflict (report_id) do update set photo = excluded.photo;
  end if;
end $$;
grant execute on function public.update_report(uuid, text, text, text, text, text) to anon;

-- 이미 접수된 습득 글: 사진·위치를 보관소로 옮기고 공개 표에서는 지운다 (어디에 두었는지/맡겼는지(found)만 남긴다)
insert into public.report_private (report_id, photo, shot, label, pin, found_set)
select id, photo, shot, location_label, pin, true from public.reports
where public.report_prefix(kind, lost_found) = 'f' and kind = chr(48516)||chr(49892)||chr(47932)
on conflict (report_id) do update set photo = excluded.photo, shot = excluded.shot, label = excluded.label, pin = excluded.pin, found_set = true
where public.report_private.found_set is not true;

update public.reports set photo = null, shot = null, location_label = '', pin = jsonb_build_object('found', coalesce(pin->>'found', ''))
where public.report_prefix(kind, lost_found) = 'f' and kind = chr(48516)||chr(49892)||chr(47932)
  and exists (select 1 from public.report_private p where p.report_id = reports.id and p.found_set);

notify pgrst, 'reload schema';
