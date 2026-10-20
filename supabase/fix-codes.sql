-- 이미 잘못 붙은 관리번호(하자가 L- 로 붙은 것 등)를 접수 순서대로 다시 매깁니다.
-- 위의 update.sql 을 먼저 실행한 뒤, 이 파일을 한 번만 실행하세요. (번호가 L-001 부터 다시 시작합니다)
alter sequence public.report_seq_f restart with 1;
alter sequence public.report_seq_l restart with 1;
alter sequence public.report_seq_r restart with 1;
update public.reports set code = null;
do $$
declare r record; p text; n bigint;
begin
  for r in select id, kind, lost_found from public.reports order by created_at loop
    p := public.report_prefix(r.kind, r.lost_found);
    n := nextval('public.report_seq_' || p);
    update public.reports set code = upper(p) || '-' || lpad(n::text, 3, '0') where id = r.id;
  end loop;
end $$;
