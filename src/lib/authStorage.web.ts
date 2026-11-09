/**
 * 웹에서만 로드되는 파일 (.web 확장자). 브라우저는 이미 자체 localStorage가 있어서
 * expo-sqlite 폴리필이 필요 없다 — 이 파일은 아무 것도 하지 않는다.
 * (supabase.ts에서 확장자 없이 import하면 Metro가 이 파일을 대신 골라 쓴다.)
 */
export {};
