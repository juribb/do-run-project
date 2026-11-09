-- 0007에서는 추천 후보 3개마다 매번 course 행을 만들었는데, 실제로 저장/실행하지 않는
-- 후보가 대부분이라 낭비다. course(특히 geometry)는 사용자가 "저장" 또는
-- "이 코스로 달리기"를 눌렀을 때만 만들도록 바꾼다.
--
-- 그러려면 추천 시점에 계산해둔 신호등/계단/환경비율/표시용 이름을 어딘가에는 잠깐
-- 들고 있어야 하는데, course를 안 만들 거니 recommendation_candidate에 붙여둔다
-- (가벼운 스칼라/jsonb값이라 후보마다 저장해도 부담 없다 — 무거운 건 geometry뿐이었다).
set search_path = public, extensions;

alter table public.recommendation_candidate
  add column if not exists name text,
  add column if not exists traffic_light_count integer,
  add column if not exists stair_count integer,
  add column if not exists environment_ratios jsonb;

-- "저장하기" 또는 "이 코스로 달리기"를 누른 시점에 호출한다.
-- 이미 이 후보로 만든 course가 있으면(=이전에 저장했다가 취소한 경우) 그걸 재사용하고,
-- 없으면 새로 만든다. security definer로 course/course_environment_features에 쓰지만,
-- 후보가 호출한 사람의 것인지 명시적으로 확인해서 RLS를 코드로 재현한다.
create or replace function public.ensure_course_for_candidate(p_candidate_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_candidate record;
  v_course_id uuid;
begin
  select rc.*
  into v_candidate
  from public.recommendation_candidate rc
  join public.recommendation_request rr on rr.id = rc.request_id
  where rc.id = p_candidate_id
    and rr.user_id = auth.uid()
  for update of rc;

  if not found then
    raise exception 'candidate not found or not owned by current user';
  end if;

  if v_candidate.course_id is not null then
    return v_candidate.course_id;
  end if;

  insert into public.course (geometry, distance_m, ascent_m, descent_m, name, traffic_light_count, stair_count, created_from_candidate_id)
  values (
    v_candidate.geometry,
    v_candidate.distance_m,
    v_candidate.ascent_m,
    v_candidate.descent_m,
    v_candidate.name,
    v_candidate.traffic_light_count,
    v_candidate.stair_count,
    v_candidate.id
  )
  returning id into v_course_id;

  update public.recommendation_candidate set course_id = v_course_id where id = v_candidate.id;

  insert into public.course_environment_features (course_id, feature_code, ratio)
  select v_course_id, (item ->> 'feature')::text, (item ->> 'ratio')::numeric
  from jsonb_array_elements(coalesce(v_candidate.environment_ratios, '[]'::jsonb)) as item;

  return v_course_id;
end;
$$;

revoke all on function public.ensure_course_for_candidate(uuid) from public;
grant execute on function public.ensure_course_for_candidate(uuid) to authenticated;

-- 저장하기: course를 보장(get-or-create)하고 saved_courses에 연결한다.
create or replace function public.save_course(p_candidate_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_course_id uuid;
begin
  v_course_id := public.ensure_course_for_candidate(p_candidate_id);

  insert into public.saved_courses (user_id, course_id)
  values (auth.uid(), v_course_id)
  on conflict (user_id, course_id) do nothing;

  return v_course_id;
end;
$$;

revoke all on function public.save_course(uuid) from public;
grant execute on function public.save_course(uuid) to authenticated;

-- 저장 취소: candidate_id로 연결된 course를 찾아서 saved_courses에서만 제거한다
-- (course 행 자체는 남겨둔다 — 다시 저장하면 재사용).
create or replace function public.unsave_course(p_candidate_id uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_course_id uuid;
begin
  select rc.course_id
  into v_course_id
  from public.recommendation_candidate rc
  join public.recommendation_request rr on rr.id = rc.request_id
  where rc.id = p_candidate_id
    and rr.user_id = auth.uid();

  if v_course_id is null then
    return; -- 저장된 적이 없으면 조용히 끝낸다
  end if;

  delete from public.saved_courses where user_id = auth.uid() and course_id = v_course_id;
end;
$$;

revoke all on function public.unsave_course(uuid) from public;
grant execute on function public.unsave_course(uuid) to authenticated;

-- 저장한 코스 목록 조회 — candidate_id도 같이 내려줘야 클라이언트가 "이 후보 저장됨" 상태를
-- recommendation_candidate.id 기준으로 판단할 수 있다 (클라이언트가 쓰는 코스 id는
-- course.id가 아니라 candidate.id로 되돌렸다).
-- 반환 컬럼 구성 자체가 바뀌어서(id → candidate_id) create or replace로는 안 되고 drop 후 재생성해야 한다.
drop function if exists public.get_saved_courses();

create function public.get_saved_courses()
returns table (
  candidate_id uuid,
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
    c.created_from_candidate_id as candidate_id,
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
