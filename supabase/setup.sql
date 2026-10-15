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
