-- F-10 동일 코스 재도전. 기존 start_running_record(uuid)는 recommendation_candidate
-- 기준이라(추천 방금 받은 후보용) 저장된 코스를 "다시 달리기"할 때는 못 쓴다 —
-- 기록 상세(records/[courseId])에서는 candidate가 아니라 course_id만 갖고 있으니,
-- course_id로 바로 running_record를 만드는 함수가 따로 필요하다.
--
-- complete_running_record와 같은 이유로 security definer를 안 쓴다 — running_record의
-- insert RLS("본인 러닝 기록 생성", auth.uid() = user_id)가 이미 이 함수가 하려는 일을
-- 정확히 허용해주니, 그걸 우회할 필요가 없다. course_id가 실제 존재하는 코스인지는
-- FK 제약(running_record.course_id references course(id))이 검증해준다.
set search_path = public, extensions;

create function public.start_running_record_for_course(p_course_id uuid)
returns table (record_id uuid, course_id uuid)
language sql
as $$
  insert into public.running_record (user_id, course_id, status)
  values (auth.uid(), p_course_id, 'IN_PROGRESS')
  returning id, course_id;
$$;

revoke all on function public.start_running_record_for_course(uuid) from public;
grant execute on function public.start_running_record_for_course(uuid) to authenticated;
