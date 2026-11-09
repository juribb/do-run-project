-- 러닝 종료 시 기록 상세 화면(records/[courseId])으로 바로 이동시키려면 course_id가
-- 필요한데, 지금까지 start_running_record는 record_id만 돌려줬다. 반환 타입이 바뀌어서
-- create or replace로는 안 되고(0008의 get_saved_courses와 같은 이유) drop 후 재생성해야 한다.
set search_path = public, extensions;

drop function if exists public.start_running_record(uuid);

create function public.start_running_record(p_candidate_id uuid)
returns table (record_id uuid, course_id uuid)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_course_id uuid;
  v_record_id uuid;
begin
  v_course_id := public.ensure_course_for_candidate(p_candidate_id);

  insert into public.running_record (user_id, course_id, status)
  values (auth.uid(), v_course_id, 'IN_PROGRESS')
  returning id into v_record_id;

  return query select v_record_id, v_course_id;
end;
$$;

revoke all on function public.start_running_record(uuid) from public;
grant execute on function public.start_running_record(uuid) to authenticated;
