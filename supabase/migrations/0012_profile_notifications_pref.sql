-- 마이페이지 "알림 설정" 토글 값을 저장한다. 실제 푸시 발송 파이프라인은 아직 없지만,
-- 사용자가 고른 값 자체는 나중에 그 파이프라인을 붙일 때 그대로 쓸 수 있게 지금부터
-- 진짜로 저장해둔다 (표시만 하고 아무 데도 안 남기는 가짜 토글을 만들지 않기 위해서다).
set search_path = public, extensions;

alter table public.profiles
  add column notifications_enabled boolean not null default true;
