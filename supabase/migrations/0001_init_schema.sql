-- SPEC.md 4번 데이터 모델 구현.
-- 단위 규약(SPEC.md 확정값): 거리 m 정수, 시간 초 정수, 페이스 초/km 정수, 시각 timestamptz.

create extension if not exists postgis;
create extension if not exists "pgcrypto"; -- gen_random_uuid()

-- Supabase는 postgis를 public이 아니라 extensions 스키마에 설치한다.
-- geometry 타입을 매번 extensions.geometry로 쓰지 않도록 이 세션의 검색 경로에 추가한다.
set search_path = public, extensions;

-- =========================================================
-- 1. recommendation_request — 사용자가 입력한 추천 조건
-- =========================================================
create table if not exists public.recommendation_request (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  origin_lat double precision not null,
  origin_lng double precision not null,
  target_distance_km smallint not null check (target_distance_km in (3, 5, 7, 10)),
  slope_pref text not null check (slope_pref in ('FLAT', 'SOME_HILL', 'ANY')),
  environment_prefs text[] not null default '{}',
  extra_conditions text[] not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists idx_recommendation_request_user on public.recommendation_request(user_id);

-- =========================================================
-- 2. recommendation_candidate — 추천 요청 1건이 만들어낸 후보(최대 3개)
--    원칙: 점수·근거·알고리즘 버전은 스냅샷으로 고정 저장 (재계산하지 않는다).
--    course_id는 course 테이블과 서로를 참조하므로 FK는 0001 마지막에 따로 건다.
-- =========================================================
create table if not exists public.recommendation_candidate (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.recommendation_request(id) on delete cascade,
  rank smallint not null check (rank between 1 and 3),
  distance_m integer not null,
  ascent_m integer not null,
  descent_m integer not null,
  fit_score smallint not null check (fit_score between 0 and 100),
  reason_text text not null,
  algorithm_version text not null,
  geometry geometry(LineStringZ, 4326) not null,
  course_id uuid, -- FK는 course 테이블 생성 후 추가
  created_at timestamptz not null default now()
);
create index if not exists idx_recommendation_candidate_request on public.recommendation_candidate(request_id);
create index if not exists idx_recommendation_candidate_course on public.recommendation_candidate(course_id);

-- =========================================================
-- 3. course — 저장하거나 실제 러닝에 쓰인 정식 코스 (공유 자산, 전역)
-- =========================================================
create table if not exists public.course (
  id uuid primary key default gen_random_uuid(),
  geometry geometry(LineStringZ, 4326) not null,
  distance_m integer not null,
  ascent_m integer not null,
  descent_m integer not null,
  created_from_candidate_id uuid references public.recommendation_candidate(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_course_geometry on public.course using gist(geometry);

-- 순환 참조 마무리: candidate.course_id → course.id
alter table public.recommendation_candidate
  add constraint fk_candidate_course foreign key (course_id) references public.course(id) on delete set null;

-- =========================================================
-- 4. course_environment_features — 코스의 환경 특성 비율 (중첩 가능, 합이 1 초과 가능)
-- =========================================================
create table if not exists public.course_environment_features (
  course_id uuid not null references public.course(id) on delete cascade,
  feature_code text not null check (feature_code in ('PARK', 'RIVERSIDE', 'URBAN', 'GREENERY')),
  ratio numeric(4, 3) not null check (ratio >= 0 and ratio <= 1),
  primary key (course_id, feature_code)
);

-- =========================================================
-- 5. saved_courses — 사용자와 저장한 코스의 북마크 관계
--    SPEC.md 4번 표에는 빠져 있지만 F-05·intent.md 원본 데이터 모델에 있고
--    이미 만든 "저장한 코스" 화면이 실제로 필요로 하는 테이블이라 추가한다.
-- =========================================================
create table if not exists public.saved_courses (
  user_id uuid not null references auth.users(id) on delete cascade,
  course_id uuid not null references public.course(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, course_id)
);

-- =========================================================
-- 6. running_record — 한 번의 실제 러닝 기록
-- =========================================================
create table if not exists public.running_record (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  course_id uuid not null references public.course(id),
  status text not null default 'IN_PROGRESS' check (status in ('IN_PROGRESS', 'COMPLETED', 'ABORTED')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  distance_m integer,
  duration_s integer,
  avg_pace_s_per_km integer,
  actual_path geometry(LineStringZ, 4326),
  created_at timestamptz not null default now()
);
create index if not exists idx_running_record_user on public.running_record(user_id);
create index if not exists idx_running_record_course on public.running_record(course_id);

-- =========================================================
-- 7. course_reviews — 만족도·적합성 평가. (user_id, course_id) 1개, 재도전 시 upsert
-- =========================================================
create table if not exists public.course_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  course_id uuid not null references public.course(id) on delete cascade,
  is_positive boolean not null,
  comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, course_id)
);

-- =========================================================
-- 8. course_report — 코스 문제 신고 (한 러닝에서 여러 건 가능)
-- =========================================================
create table if not exists public.course_report (
  id uuid primary key default gen_random_uuid(),
  running_record_id uuid not null references public.running_record(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reason text not null check (
    reason in ('CONSTRUCTION', 'BLOCKED', 'MAP_ERROR', 'ENV_INFO_ERROR', 'MISMATCH', 'OTHER')
  ),
  detail text,
  created_at timestamptz not null default now()
);
create index if not exists idx_course_report_running_record on public.course_report(running_record_id);

-- =========================================================
-- 9. recommendation_policy — 관리자 UI 없이 스키마만 유지 (대시보드에서 직접 조회/수정)
-- =========================================================
create table if not exists public.recommendation_policy (
  feature_key text primary key,
  weight numeric not null,
  updated_at timestamptz not null default now()
);
