-- 회원가입 시 닉네임·프로필 사진을 저장하기 위한 테이블.
-- auth.users는 Supabase가 관리하는 기본 계정 정보(이메일 등)만 있고, 앱 전용 필드는 여기 둔다.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nickname text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "본인 프로필 조회" on public.profiles
  for select using (auth.uid() = id);
create policy "본인 프로필 생성" on public.profiles
  for insert with check (auth.uid() = id);
create policy "본인 프로필 수정" on public.profiles
  for update using (auth.uid() = id);

-- =========================================================
-- 프로필 사진 저장용 Storage 버킷.
-- 파일 경로 규칙: {user_id}/avatar.jpg — 본인 폴더에만 쓸 수 있게 제한한다.
-- 사진 자체는 공개 URL로 바로 보여줄 수 있도록 조회는 누구나 가능하게 한다.
-- =========================================================
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

create policy "프로필 사진은 누구나 조회 가능" on storage.objects
  for select using (bucket_id = 'avatars');

create policy "본인 폴더에만 프로필 사진 업로드" on storage.objects
  for insert with check (
    bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "본인 폴더 프로필 사진만 수정" on storage.objects
  for update using (
    bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]
  );
