-- 0004에서 avatars 버킷 생성이 반영되지 않아 다시 시도한다.
-- 이번엔 실패하면 마이그레이션 자체가 실패하도록(예외 발생) 만들어서 원인을 바로 알 수 있게 한다.
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

do $$
begin
  if not exists (select 1 from storage.buckets where id = 'avatars') then
    raise exception 'avatars 버킷 생성 실패 — storage.buckets insert가 반영되지 않음';
  end if;
end $$;
