-- Supabase 대시보드 > SQL Editor 에 통째로 붙여넣고 Run 하세요.
-- ※ 아래 '0000' 이 관리자 PIN 입니다. 실행 전에 원하는 숫자로 바꾸세요.

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('하자','분실물')),
  detail text not null check (char_length(detail) between 1 and 1000),
  location_label text not null default '' check (char_length(location_label) <= 80),
  pin jsonb not null default '{}'::jsonb,
  photo text,
  shot text,
  status text not null default '미확인' check (status in ('미확인','확인','진행 중','완료')),
  created_at timestamptz not null default now()
);

alter table public.reports enable row level security;
drop policy if exists "reports_read" on public.reports;
drop policy if exists "reports_insert" on public.reports;
create policy "reports_read" on public.reports for select using (true);
create policy "reports_insert" on public.reports for insert with check (status = '미확인');

-- 관리자 PIN 보관 (정책이 없어서 앱에서는 읽을 수 없음)
create table if not exists public.admin_secret (pin text not null);
alter table public.admin_secret enable row level security;
delete from public.admin_secret;
insert into public.admin_secret (pin) values ('0000');

create or replace function public.set_status(rid uuid, new_status text, pin_in text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if pin_in is distinct from (select pin from public.admin_secret limit 1) then
    raise exception 'PIN이 올바르지 않습니다.';
  end if;
  update public.reports set status = new_status where id = rid;
end $$;
grant execute on function public.set_status(uuid, text, text) to anon;

-- 사진 저장소 (공개 읽기, 업로드는 JPEG 4MB 이하만)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('reports', 'reports', true, 4194304, array['image/jpeg'])
on conflict (id) do nothing;
drop policy if exists "reports_upload" on storage.objects;
create policy "reports_upload" on storage.objects for insert to anon with check (bucket_id = 'reports');

-- 글 삭제 (관리자 PIN 필요). 나중에 추가된 부분이라 이 부분만 따로 실행해도 됩니다.
create or replace function public.delete_report(rid uuid, pin_in text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if pin_in is distinct from (select pin from public.admin_secret limit 1) then
    raise exception 'PIN이 올바르지 않습니다.';
  end if;
  delete from public.reports where id = rid;
end $$;
grant execute on function public.delete_report(uuid, text) to anon;

-- 항목 선택 방식 (하자 종류 / 분실물 종류, 분실·습득). 세부 내용은 선택.
alter table public.reports add column if not exists category text not null default '기타' check (char_length(category) <= 20);
alter table public.reports add column if not exists lost_found text check (lost_found in ('분실','습득'));
alter table public.reports drop constraint if exists reports_detail_check;
alter table public.reports add constraint reports_detail_check check (char_length(detail) <= 1000);

-- 처리 후 사진 + 공감 (이 부분만 따로 실행해도 됩니다)
alter table public.reports add column if not exists after_photo text;
alter table public.reports add column if not exists likes integer not null default 0;

create or replace function public.set_after_photo(rid uuid, url text, pin_in text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if pin_in is distinct from (select pin from public.admin_secret limit 1) then
    raise exception 'PIN이 올바르지 않습니다.';
  end if;
  update public.reports set after_photo = url where id = rid;
end $$;
grant execute on function public.set_after_photo(uuid, text, text) to anon;

create or replace function public.like_report(rid uuid, delta int)
returns integer language sql security definer set search_path = public as $$
  update public.reports set likes = greatest(0, likes + (case when delta < 0 then -1 else 1 end)) where id = rid returning likes;
$$;
grant execute on function public.like_report(uuid, int) to anon;

-- 작성자 PIN (접수할 때 정한 4자리로 본인 글 수정·삭제). 이 부분만 따로 실행해도 됩니다.
-- 정책이 없어서 앱에서는 읽을 수 없고, 아래 함수로만 확인합니다.
create table if not exists public.report_pins (report_id uuid primary key references public.reports(id) on delete cascade, pin text not null);
alter table public.report_pins enable row level security;

-- 방금(2분 안에) 접수된 글에만, 아직 PIN 이 없을 때 한 번 정할 수 있다
create or replace function public.set_owner_pin(rid uuid, pin_in text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if pin_in !~ '^[0-9]{4}$' then raise exception 'PIN은 숫자 4자리여야 합니다.'; end if;
  if not exists (select 1 from public.reports where id = rid and created_at > now() - interval '2 minutes') then raise exception 'PIN을 정할 수 없습니다.'; end if;
  insert into public.report_pins (report_id, pin) values (rid, pin_in) on conflict do nothing;
end $$;
grant execute on function public.set_owner_pin(uuid, text) to anon;

create or replace function public.check_owner_pin(rid uuid, pin_in text)
returns boolean language sql security definer set search_path = public as $$
  select exists (select 1 from public.report_pins where report_id = rid and pin = pin_in);
$$;
grant execute on function public.check_owner_pin(uuid, text) to anon;

create or replace function public.update_report(rid uuid, pin_in text, new_category text, new_detail text, new_lost_found text, new_photo text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.check_owner_pin(rid, pin_in) then raise exception 'PIN이 올바르지 않습니다.'; end if;
  update public.reports set category = left(coalesce(nullif(trim(new_category), ''), '기타'), 20), detail = left(coalesce(new_detail, ''), 1000),
    lost_found = case when kind = '분실물' and new_lost_found in ('분실','습득') then new_lost_found else lost_found end,
    photo = coalesce(new_photo, photo) where id = rid;
end $$;
grant execute on function public.update_report(uuid, text, text, text, text, text) to anon;

-- 글 삭제: 관리자 PIN 또는 작성자 PIN (위의 delete_report 를 덮어씁니다)
create or replace function public.delete_report(rid uuid, pin_in text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if pin_in is distinct from (select pin from public.admin_secret limit 1) and not public.check_owner_pin(rid, pin_in) then
    raise exception 'PIN이 올바르지 않습니다.';
  end if;
  delete from public.reports where id = rid;
end $$;

-- 새 함수를 API 에 바로 인식시킵니다.
notify pgrst, 'reload schema';

-- 관리번호 (찾았어요 F-001 / 잃어버렸어요 L-001 / 하자보수 R-001). 이 부분만 따로 실행해도 됩니다.
create sequence if not exists public.report_seq_f;
create sequence if not exists public.report_seq_l;
create sequence if not exists public.report_seq_r;
alter table public.reports add column if not exists code text;

-- 번호가 생기기 전에 접수된 글: 접수 순서대로 번호를 붙인다
do $$
declare r record; p text; n bigint;
begin
  for r in select id, kind, lost_found from public.reports where code is null order by created_at loop
    p := case when r.kind = '하자' then 'r' when r.lost_found = '습득' then 'f' else 'l' end;
    n := nextval('public.report_seq_' || p);
    update public.reports set code = upper(p) || '-' || lpad(n::text, 3, '0') where id = r.id;
  end loop;
end $$;
create unique index if not exists reports_code_key on public.reports (code);

-- 새 글이 들어오면 번호를 자동으로 붙인다
create or replace function public.set_report_code()
returns trigger language plpgsql security definer set search_path = public as $$
declare p text;
begin
  p := case when new.kind = '하자' then 'r' when new.lost_found = '습득' then 'f' else 'l' end;
  new.code := upper(p) || '-' || lpad(nextval('public.report_seq_' || p)::text, 3, '0');
  return new;
end $$;
drop trigger if exists reports_set_code on public.reports;
create trigger reports_set_code before insert on public.reports for each row execute function public.set_report_code();

notify pgrst, 'reload schema';

-- 접수 후 30일이 지나면 자동 삭제 (매일 새벽 4시 = 한국시간 오후 1시). 이 부분만 따로 실행해도 됩니다.
-- 앱도 30일 지난 글은 목록에서 빼기 때문에, 아래 예약 작업이 안 돼도 화면에는 보이지 않습니다.
-- ※ 사진 파일(Storage)은 SQL 로 지울 수 없어 남습니다. 필요하면 Storage > reports 에서 정리하세요.
create or replace function public.purge_old_reports()
returns void language sql security definer set search_path = public as $$
  delete from public.reports where created_at < now() - interval '30 days';
$$;
revoke execute on function public.purge_old_reports() from anon, authenticated, public;

create extension if not exists pg_cron;
select cron.unschedule(jobid) from cron.job where jobname = 'purge-old-reports';
select cron.schedule('purge-old-reports', '0 4 * * *', 'select public.purge_old_reports()');
