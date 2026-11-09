/**
 * Supabase 클라이언트 초기화. 앱 어디서든 이 인스턴스 하나만 가져다 쓴다.
 *
 * URL·anon 키는 .env에서 읽는다 (EXPO_PUBLIC_ 접두사가 붙어야 클라이언트 번들에 포함된다).
 * 둘 다 클라이언트에 노출돼도 되는 공개 값이다 — 실제 접근 제어는 DB의 RLS 정책이 한다.
 * service_role 키(관리자 권한)는 절대 여기 들어가면 안 되고, Edge Function 환경변수에만 존재한다.
 *
 * `expo-sqlite/localStorage/install`은 로그인 세션을 기기에 저장해서 앱을 껐다 켜도
 * 로그인이 유지되게 한다 (Expo 공식 가이드 방식). 실제 타겟은 iOS/Android라 네이티브에서만
 * 불러온다 — 웹은 별도 번들러 설정이 필요해서, 브라우저 기본 localStorage를 그대로 쓴다.
 */
import './authStorage'; // 확장자 없이 import — Metro가 플랫폼에 맞는 .native/.web 파일을 고른다
import { createClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    '[supabase] EXPO_PUBLIC_SUPABASE_URL 또는 EXPO_PUBLIC_SUPABASE_ANON_KEY가 비어 있습니다. .env를 확인하세요.',
  );
}

// 웹 서버사이드 렌더링 중에는 localStorage 자체가 없다(브라우저 전용 전역이라).
// 그런 환경에서는 세션 저장을 생략하고 Supabase 기본 동작에 맡긴다 — 우리 실제 타겟은
// iOS/Android라 이 분기는 사실상 내 웹 프리뷰가 죽지 않게 하기 위한 것이다.
const authStorage = typeof localStorage !== 'undefined' ? localStorage : undefined;

export const supabase = createClient(supabaseUrl ?? '', supabaseAnonKey ?? '', {
  auth: {
    storage: authStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// 앱이 백그라운드로 가면 토큰 자동 갱신을 멈추고, 다시 돌아오면 재개한다.
// (Supabase 공식 권장 패턴 — 안 하면 백그라운드에서도 계속 갱신 요청을 보낸다)
AppState.addEventListener('change', (state) => {
  if (state === 'active') {
    supabase.auth.startAutoRefresh();
  } else {
    supabase.auth.stopAutoRefresh();
  }
});
