-- 빈 강의실 · 편의시설 · 관리자 기능용 테이블
-- Supabase 대시보드 > SQL Editor 에 통째로 붙여넣고 Run 하세요. (setup.sql 을 이미 실행한 상태에서)
-- 기존 reports(신고) 테이블과 데이터는 건드리지 않습니다. 여러 번 실행해도 안전합니다.
--
-- ※ 맨 아래 '관리자 이메일' 부분을 실제 관리자 이메일로 바꾸고 실행하세요.
--   그 이메일로 Authentication > Users > Add user 에서 계정(비밀번호)을 만들어 두면
--   khu-app.vercel.app/#/admin 에서 로그인할 수 있습니다.

-- ── 관리자 ───────────────────────────────────────────────
create table if not exists public.admins (
  email text primary key
);
alter table public.admins enable row level security;  -- 정책이 없으므로 앱에서 읽거나 쓸 수 없음

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));
$$;
grant execute on function public.is_admin() to anon, authenticated;

-- 신고: 관리자는 로그인해서 처리 상태를 바꿀 수 있다 (기존 PIN 방식 set_status 도 그대로 남아 있음)
drop policy if exists "reports_admin_update" on public.reports;
create policy "reports_admin_update" on public.reports for update using (public.is_admin()) with check (public.is_admin());

-- ── 강의실 ───────────────────────────────────────────────
create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (char_length(code) between 1 and 20),       -- 예: 305
  floor text not null check (floor in ('B1','1F','2F','3F','4F','5F')),
  seats int check (seats is null or seats between 0 and 1000),
  features text not null default '' check (char_length(features) <= 200),     -- 예: 빔프로젝터, 화이트보드
  note text not null default '' check (char_length(note) <= 200),
  study_ok boolean not null default true,                                     -- 빈 시간에 자습 가능으로 보여 줄지
  rentable boolean not null default true,                                     -- 팀플 대여 신청을 받을지
  x double precision, y double precision,                                     -- 평면도 위치 (도면이 있는 층만)
  created_at timestamptz not null default now()
);

-- 학기 정규 시간표 (요일 반복)
create table if not exists public.schedules (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  weekday int not null check (weekday between 1 and 7),                       -- 1=월 … 7=일
  start_time text not null check (start_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  end_time text not null check (end_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  title text not null check (char_length(title) between 1 and 80),
  check (start_time < end_time)
);
create index if not exists schedules_room on public.schedules(room_id);

-- 특정 날짜만 바뀌는 일정: 휴강(그 시간 수업 없음) / 보강·특강(그 시간 사용 중)
create table if not exists public.schedule_exceptions (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  date date not null,
  start_time text not null check (start_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  end_time text not null check (end_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  kind text not null check (kind in ('휴강','보강','특강')),
  title text not null default '' check (char_length(title) <= 80),
  check (start_time < end_time)
);
create index if not exists exceptions_date on public.schedule_exceptions(date);

-- 팀플 대여 신청
create table if not exists public.rentals (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  date date not null,
  start_time text not null check (start_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  end_time text not null check (end_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  name text not null check (char_length(name) between 1 and 40),
  dept text not null default '' check (char_length(dept) <= 40),
  contact text not null check (char_length(contact) between 1 and 60),
  people int not null default 1 check (people between 1 and 200),
  purpose text not null default '' check (char_length(purpose) <= 300),
  status text not null default '대기' check (status in ('대기','승인','거절')),
  admin_note text not null default '' check (char_length(admin_note) <= 200),
  created_at timestamptz not null default now(),
  check (start_time < end_time)
);

-- ── 편의시설 ─────────────────────────────────────────────
create table if not exists public.amenities (
  id uuid primary key default gen_random_uuid(),
  floor text not null check (floor in ('B1','1F','2F','3F','4F','5F')),
  category text not null check (char_length(category) between 1 and 20),      -- 화장실, 정수기, 쓰레기통 …
  label text not null default '' check (char_length(label) <= 40),            -- 예: 여자 화장실
  location text not null default '' check (char_length(location) <= 80),      -- 예: 계단 옆
  details jsonb not null default '[]'::jsonb,                                 -- [["비데","있음"], ["칸 수","4"]]
  x double precision, y double precision,                                     -- 평면도 위치 (도면이 있는 층만)
  created_at timestamptz not null default now()
);

-- ── 권한 (RLS) ───────────────────────────────────────────
-- 강의실·시간표·편의시설: 누구나 읽기, 관리자만 쓰기
do $$
declare t text;
begin
  foreach t in array array['rooms','schedules','schedule_exceptions','amenities'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "%s_read" on public.%I', t, t);
    execute format('drop policy if exists "%s_admin" on public.%I', t, t);
    execute format('create policy "%s_read" on public.%I for select using (true)', t, t);
    execute format('create policy "%s_admin" on public.%I for all using (public.is_admin()) with check (public.is_admin())', t, t);
  end loop;
end $$;

-- 대여: 누구나 '대기' 상태로 신청만 가능. 신청서(이름·연락처)는 관리자만 볼 수 있음
alter table public.rentals enable row level security;
drop policy if exists "rentals_insert" on public.rentals;
drop policy if exists "rentals_admin" on public.rentals;
create policy "rentals_insert" on public.rentals for insert with check (status = '대기' and admin_note = '');
create policy "rentals_admin" on public.rentals for all using (public.is_admin()) with check (public.is_admin());

-- 학생 화면에 '대여 중'을 보여 주기 위한 공개 목록 (승인된 건의 강의실·시간만, 개인정보 없음)
create or replace view public.rental_slots as
  select room_id, date, start_time, end_time from public.rentals where status = '승인';
grant select on public.rental_slots to anon, authenticated;

-- ── 관리자 이메일 등록 ───────────────────────────────────
-- 아래 이메일을 실제 관리자 이메일로 바꾸세요. 여러 명이면 줄을 추가하면 됩니다.
insert into public.admins (email) values ('관리자 이메일') on conflict do nothing;
