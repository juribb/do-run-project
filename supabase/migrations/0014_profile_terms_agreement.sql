-- SNS(카카오·구글) 로그인은 회원가입 폼 없이 바로 세션이 생겨서, 이메일 가입처럼
-- 그 자리에서 약관 동의를 받을 화면이 없었다. 그래서 매번 로그인 버튼 누르기 "전에"
-- 체크박스를 띄웠는데, 이러면 이미 동의한 재로그인 사용자한테도 매번 다시 물어보게
-- 된다(2026-09-17, "최초 1회만 동의받게 해달라" 요청). 이 값이 있어야 "이미 동의했다"를
-- 서버에 기록해두고, 다음 로그인부터는 건너뛸 수 있다.
set search_path = public, extensions;

alter table public.profiles
  add column terms_agreed_at timestamptz;
