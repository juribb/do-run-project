-- "이 코스로 달리기" 기능. running_record는 이미 0001에 정의돼 있고
-- RLS(본인 것만 조회/생성/수정)도 0003에 이미 걸려있다 — 여기선 필요한 함수 2개만 추가한다.
set search_path = public, extensions;

-- 러닝 시작: 아직 저장한 적 없는 후보로도 바로 달릴 수 있어야 하니(SPEC.md — 저장은 선택),
-- ensure_course_for_candidate()로 course를 보장(get-or-create)한 뒤 IN_PROGRESS 기록을 만든다.
create or replace function public.start_running_record(p_candidate_id uuid)
returns uuid
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

  return v_record_id;
end;
$$;

revoke all on function public.start_running_record(uuid) from public;
grant execute on function public.start_running_record(uuid) to authenticated;

-- 러닝 종료: actual_path는 PostGIS geometry라 일반 update로 못 넣는다 — linestring_z_from_coords()
-- (migration 0002)로 변환해서 넣는 전용 함수가 필요하다. security definer를 안 써서(기본값=invoker)
-- "본인 러닝 기록 수정" RLS가 그대로 적용된다 — 남의 기록은 이 함수로도 못 고친다.
create or replace function public.complete_running_record(
  p_record_id uuid,
  p_distance_m integer,
  p_duration_s integer,
  p_avg_pace_s_per_km integer,
  p_actual_path jsonb
)
returns void
language sql
set search_path = public, extensions
as $$
  update public.running_record
  set
    status = 'COMPLETED',
    finished_at = now(),
    distance_m = p_distance_m,
    duration_s = p_duration_s,
    avg_pace_s_per_km = p_avg_pace_s_per_km,
    actual_path = public.linestring_z_from_coords(p_actual_path)
  where id = p_record_id;
$$;

revoke all on function public.complete_running_record(uuid, integer, integer, integer, jsonb) from public;
grant execute on function public.complete_running_record(uuid, integer, integer, integer, jsonb) to authenticated;
