-- Supabase > SQL Editor 에 이 파일 전체를 붙여넣고 Run 하세요. (여러 번 실행해도 안전합니다)
-- 포함: 주운 물건(습득)의 '세부 내용'도 관리자(와 작성자 본인)만 보게 하기
--  · 새로 접수되는 습득 글의 세부 내용은 누구나 읽는 표(reports)에 저장되지 않고 별도 보관소(report_private)에 저장됩니다.
--  · 이미 접수된 습득 글의 세부 내용도 이 파일을 실행하면 보관소로 옮겨집니다.
-- ※ 먼저 update-private.sql 이 실행되어 있어야 합니다.

alter table public.report_private add column if not exists detail text;

-- 새 인자(세부 내용)가 늘어서 예전 함수는 지우고 다시 만든다
drop function if exists public.set_private_found(uuid, text, text, text, jsonb);
create or replace function public.set_private_found(rid uuid, photo_in text, shot_in text, label_in text, pin_in jsonb, detail_in text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.reports where id = rid and created_at > now() - interval '2 minutes') then raise exception '저장할 수 없습니다.'; end if;
  insert into public.report_private (report_id, photo, shot, label, pin, detail, found_set) values (rid, photo_in, shot_in, left(label_in, 80), pin_in, left(coalesce(detail_in, ''), 1000), true)
  on conflict (report_id) do update set photo = excluded.photo, shot = excluded.shot, label = excluded.label, pin = excluded.pin, detail = excluded.detail, found_set = true
  where public.report_private.found_set is not true;
end $$;
grant execute on function public.set_private_found(uuid, text, text, text, jsonb, text) to anon;

-- 관리자: 사진·위치·세부 내용을 본다
create or replace function public.admin_get_found(rid uuid, pin_in text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if pin_in is distinct from (select pin from public.admin_secret limit 1) then
    raise exception 'PIN이 올바르지 않습니다.';
  end if;
  return (select jsonb_build_object('photo', photo, 'shot', shot, 'label', label, 'pin', pin, 'detail', coalesce(detail, '')) from public.report_private where report_id = rid);
end $$;
grant execute on function public.admin_get_found(uuid, text) to anon;

-- 작성자 본인: 자기 글의 사진·세부 내용을 본다 (수정 화면용)
create or replace function public.owner_get_found(rid uuid, pin_in text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.check_owner_pin(rid, pin_in) then raise exception 'PIN이 올바르지 않습니다.'; end if;
  return (select jsonb_build_object('photo', photo, 'shot', shot, 'label', label, 'pin', pin, 'detail', coalesce(detail, '')) from public.report_private where report_id = rid);
end $$;
grant execute on function public.owner_get_found(uuid, text) to anon;

-- 작성자가 글을 고칠 때: 습득 글의 사진·세부 내용은 보관소에 저장한다 (누구나 읽는 표에 다시 노출되지 않게)
create or replace function public.update_report(rid uuid, pin_in text, new_category text, new_detail text, new_lost_found text, new_photo text)
returns void language plpgsql security definer set search_path = public as $$
declare is_found boolean;
begin
  if not public.check_owner_pin(rid, pin_in) then raise exception 'PIN이 올바르지 않습니다.'; end if;
  select public.report_prefix(kind, lost_found) = 'f' into is_found from public.reports where id = rid;
  update public.reports set category = left(coalesce(nullif(trim(new_category), ''), '기타'), 20),
    detail = case when is_found then '' else left(coalesce(new_detail, ''), 1000) end,
    lost_found = case when kind = chr(48516)||chr(49892)||chr(47932) and new_lost_found in (chr(48516)||chr(49892), chr(49845)||chr(46301)) then new_lost_found else lost_found end,
    photo = case when is_found then photo else coalesce(new_photo, photo) end where id = rid;
  if is_found then
    insert into public.report_private (report_id, photo, detail) values (rid, new_photo, left(coalesce(new_detail, ''), 1000))
    on conflict (report_id) do update set photo = coalesce(excluded.photo, public.report_private.photo), detail = excluded.detail;
  end if;
end $$;
grant execute on function public.update_report(uuid, text, text, text, text, text) to anon;

-- 이미 접수된 습득 글: 세부 내용을 보관소로 옮기고 공개 표에서는 비운다
insert into public.report_private (report_id, detail, found_set)
select id, left(coalesce(detail, ''), 1000), false from public.reports
where public.report_prefix(kind, lost_found) = 'f' and kind = chr(48516)||chr(49892)||chr(47932)
on conflict (report_id) do update set detail = excluded.detail where public.report_private.detail is null;

update public.reports set detail = ''
where public.report_prefix(kind, lost_found) = 'f' and kind = chr(48516)||chr(49892)||chr(47932)
  and exists (select 1 from public.report_private p where p.report_id = reports.id and p.detail is not null);

notify pgrst, 'reload schema';
