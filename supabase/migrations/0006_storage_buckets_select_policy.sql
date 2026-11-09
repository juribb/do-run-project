-- storage.objects에는 조회 규칙을 만들었지만 storage.buckets 자체에는 안 만들어서
-- 버킷이 실제로 있어도(0005에서 확인됨) API로 목록 조회가 안 됐다. 조회만 허용한다.
create policy "버킷 목록은 누구나 조회 가능" on storage.buckets
  for select using (true);
