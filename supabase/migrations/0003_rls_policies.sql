-- 원칙: 본인 데이터만 읽기/쓰기. course·course_environment_features는 공유 자산이라
-- 비로그인 사용자도 조회할 수 있어야 한다(SPEC.md 18번 — 코스 상세는 로그인 불필요).
-- recommendation_candidate·recommendation_policy는 client가 직접 쓰지 않고
-- 서버(Edge Function, service_role)만 쓴다 — service_role은 RLS를 우회하므로
-- 여기에는 SELECT 정책만 두거나(candidate), 아무 정책도 두지 않는다(policy).

-- =========================================================
-- recommendation_request — 본인 것만 전체 접근
-- =========================================================
alter table public.recommendation_request enable row level security;

create policy "본인 추천 요청 조회" on public.recommendation_request
  for select using (auth.uid() = user_id);
create policy "본인 추천 요청 생성" on public.recommendation_request
  for insert with check (auth.uid() = user_id);

-- =========================================================
-- recommendation_candidate — 본인 요청에 속한 후보만 조회. 쓰기는 서버(service_role)만.
-- =========================================================
alter table public.recommendation_candidate enable row level security;

create policy "본인 요청의 후보만 조회" on public.recommendation_candidate
  for select using (
    exists (
      select 1 from public.recommendation_request r
      where r.id = recommendation_candidate.request_id
        and r.user_id = auth.uid()
    )
  );

-- =========================================================
-- course — 공유 자산: 로그인 여부와 무관하게 누구나 조회 가능. 쓰기는 서버만.
-- =========================================================
alter table public.course enable row level security;

create policy "코스는 누구나 조회 가능" on public.course
  for select using (true);

-- =========================================================
-- course_environment_features — course와 동일하게 공개 조회
-- =========================================================
alter table public.course_environment_features enable row level security;

create policy "환경 특성은 누구나 조회 가능" on public.course_environment_features
  for select using (true);

-- =========================================================
-- saved_courses — 본인이 저장한 코스만 조회/추가/삭제
-- =========================================================
alter table public.saved_courses enable row level security;

create policy "본인 저장 코스 조회" on public.saved_courses
  for select using (auth.uid() = user_id);
create policy "본인 저장 코스 추가" on public.saved_courses
  for insert with check (auth.uid() = user_id);
create policy "본인 저장 코스 삭제" on public.saved_courses
  for delete using (auth.uid() = user_id);

-- =========================================================
-- running_record — 본인 기록만 전체 접근
-- =========================================================
alter table public.running_record enable row level security;

create policy "본인 러닝 기록 조회" on public.running_record
  for select using (auth.uid() = user_id);
create policy "본인 러닝 기록 생성" on public.running_record
  for insert with check (auth.uid() = user_id);
create policy "본인 러닝 기록 수정" on public.running_record
  for update using (auth.uid() = user_id);

-- =========================================================
-- course_reviews — 본인 평가만 조회/작성/수정(upsert)
-- =========================================================
alter table public.course_reviews enable row level security;

create policy "본인 평가 조회" on public.course_reviews
  for select using (auth.uid() = user_id);
create policy "본인 평가 작성" on public.course_reviews
  for insert with check (auth.uid() = user_id);
create policy "본인 평가 수정" on public.course_reviews
  for update using (auth.uid() = user_id);

-- =========================================================
-- course_report — 본인이 낸 신고만 조회/작성 (신고는 제출 후 수정하지 않는다)
-- =========================================================
alter table public.course_report enable row level security;

create policy "본인 신고 조회" on public.course_report
  for select using (auth.uid() = user_id);
create policy "본인 신고 작성" on public.course_report
  for insert with check (auth.uid() = user_id);

-- =========================================================
-- recommendation_policy — 클라이언트는 접근 불가. Supabase 대시보드(관리자)에서만 조회/수정.
-- RLS만 켜두고 정책을 하나도 안 만들면 anon·authenticated는 전부 거부되고,
-- 대시보드 SQL Editor(postgres 역할)와 service_role은 RLS 자체를 우회한다.
-- =========================================================
alter table public.recommendation_policy enable row level security;
