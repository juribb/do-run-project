-- course_reviews는 0001에서 만들어졌지만 (is_positive boolean + comment) 클라이언트에서
-- 한 번도 안 썼다 — 이번에 "러닝 완료 및 코스 평가" 화면을 실제로 붙이면서, Stitch 시안의
-- 5단계 만족도 · 조건 일치도 · 좋았던 점 태그를 담을 수 있게 컬럼을 바꾼다. 기존 로우가
-- 없어서(한 번도 안 쓰인 테이블) NOT NULL 컬럼을 기본값 없이 바로 추가해도 안전하다.
set search_path = public, extensions;

alter table public.course_reviews
  drop column is_positive;

alter table public.course_reviews
  add column satisfaction smallint not null check (satisfaction between 1 and 5),
  add column match_score smallint not null check (match_score in (25, 50, 75, 100)),
  add column liked_tags text[] not null default '{}';
