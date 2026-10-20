-- Supabase > SQL Editor 에 이 파일 전체를 붙여넣고 Run 하세요. (여러 번 실행해도 안전합니다)
-- 포함: 분실물 '물품 설명', 전화번호(선택, 010-xxx(x)-xxxx 형식) + 공개/비공개(관리자만)

alter table public.reports add column if not exists item_desc text check (char_length(item_desc) <= 200);
-- 공개로 정한 전화번호만 여기 들어간다 (이 표는 누구나 읽을 수 있다)
alter table public.reports add column if not exists phone_public text check (char_length(phone_public) <= 20);

-- 공개 전화번호도 같은 형식만 받는다 (이미 들어간 값은 건드리지 않는다)
alter table public.reports drop constraint if exists reports_phone_public_format;
alter table public.reports add constraint reports_phone_public_format check (phone_public is null or phone_public ~ '^010-[0-9]{3,4}-[0-9]{4}$') not valid;

-- 비공개 전화번호: 정책이 없어서 앱에서 직접 읽을 수 없다. 관리자 PIN 으로 함수를 통해서만 본다.
create table if not exists public.report_private (report_id uuid primary key references public.reports(id) on delete cascade, phone text not null);
alter table public.report_private enable row level security;

-- 방금(2분 안에) 접수된 글에만, 아직 번호가 없을 때 한 번 정할 수 있다
create or replace function public.set_private_phone(rid uuid, phone_in text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if phone_in !~ '^010-[0-9]{3,4}-[0-9]{4}$' then raise exception '전화번호 형식이 올바르지 않습니다.'; end if;
  if not exists (select 1 from public.reports where id = rid and created_at > now() - interval '2 minutes') then raise exception '전화번호를 정할 수 없습니다.'; end if;
  insert into public.report_private (report_id, phone) values (rid, phone_in) on conflict do nothing;
end $$;
grant execute on function public.set_private_phone(uuid, text) to anon;

-- 관리자: 공개든 비공개든 전화번호를 본다
create or replace function public.admin_get_phone(rid uuid, pin_in text)
returns text language plpgsql security definer set search_path = public as $$
begin
  if pin_in is distinct from (select pin from public.admin_secret limit 1) then
    raise exception 'PIN이 올바르지 않습니다.';
  end if;
  return coalesce((select phone from public.report_private where report_id = rid), (select phone_public from public.reports where id = rid));
end $$;
grant execute on function public.admin_get_phone(uuid, text) to anon;

notify pgrst, 'reload schema';
