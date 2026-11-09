-- 저장한 코스를 실제로 조회할 수 있게 하는 작업.
-- 지금까지 recommend Edge Function이 course/course_environment_features에
-- 아무것도 안 채워넣고 있어서 "저장"이 클라이언트 메모리에서만 유지되고 있었다.
--
-- course에는 신호등·계단 개수, 표시용 이름이 저장될 자리가 없어서 추가한다
-- (거리/고도처럼 "코스 자체의 물리적 특성"이라 recommendation_candidate가 아니라
-- 여기 두는 게 맞다 — fit_score/reason_text처럼 "이 추천 시점에만 유효한 값"과는 다르다).
set search_path = public, extensions;

alter table public.course
  add column if not exists name text,
  add column if not exists traffic_light_count integer,
  add column if not exists stair_count integer;

-- 저장한 코스 목록 조회 전용 함수 (SPEC.md 4번 원칙: 전용 함수로 geometry ↔ 좌표 변환).
-- security definer로 RLS를 우회하지만, auth.uid()로 명시적으로 본인 것만 걸러서
-- saved_courses의 RLS("본인 저장 코스 조회")와 동일한 보장을 코드로 재현한다.
create or replace function public.get_saved_courses()
returns table (
  id uuid,
  name text,
  coordinates jsonb,
  distance_m integer,
  ascent_m integer,
  descent_m integer,
  traffic_light_count integer,
  stair_count integer,
  fit_score smallint,
  reason_text text,
  environment_ratios jsonb,
  saved_at timestamptz
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select
    c.id,
    c.name,
    st_asgeojson(c.geometry)::jsonb -> 'coordinates' as coordinates,
    c.distance_m,
    c.ascent_m,
    c.descent_m,
    c.traffic_light_count,
    c.stair_count,
    rc.fit_score,
    rc.reason_text,
    (
      select jsonb_agg(jsonb_build_object('feature', cef.feature_code, 'ratio', cef.ratio))
      from public.course_environment_features cef
      where cef.course_id = c.id
    ) as environment_ratios,
    sc.created_at as saved_at
  from public.saved_courses sc
  join public.course c on c.id = sc.course_id
  left join public.recommendation_candidate rc on rc.id = c.created_from_candidate_id
  where sc.user_id = auth.uid()
  order by sc.created_at desc;
$$;

revoke all on function public.get_saved_courses() from public;
grant execute on function public.get_saved_courses() to authenticated;
