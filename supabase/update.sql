-- Supabase > SQL Editor 에 이 파일 전체를 붙여넣고 Run 하세요. (여러 번 실행해도 안전합니다)
-- 포함: 관리번호(F/L/R-001) 자동 생성 + 30일 지난 글 자동 삭제

-- 관리번호 (찾았어요 F-001 / 잃어버렸어요 L-001 / 하자보수 R-001). 이 부분만 따로 실행해도 됩니다.
create sequence if not exists public.report_seq_f;
create sequence if not exists public.report_seq_l;
create sequence if not exists public.report_seq_r;
alter table public.reports add column if not exists code text;

-- 접수 종류 -> 접두사. 한글 글자를 SQL 에 직접 쓰지 않고 글자 코드로 비교한다
-- (붙여넣을 때 한글이 다른 형태로 바뀌어도 틀리지 않게)
create or replace function public.report_prefix(k text, lf text)
returns text language sql immutable as $$
  select case when normalize(k, nfc) = chr(54616)||chr(51088) then 'r' when normalize(lf, nfc) = chr(49845)||chr(46301) then 'f' else 'l' end;
$$;

-- 번호가 생기기 전에 접수된 글: 접수 순서대로 번호를 붙인다
do $$
declare r record; p text; n bigint;
begin
  for r in select id, kind, lost_found from public.reports where code is null order by created_at loop
    p := public.report_prefix(r.kind, r.lost_found);
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
  p := public.report_prefix(new.kind, new.lost_found);
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
