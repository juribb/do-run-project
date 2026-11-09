/**
 * 카카오·구글 로그인 (SPEC.md F-02). Supabase 공식 "네이티브 딥링크" 패턴을 그대로 따른다.
 * https://supabase.com/docs/guides/auth/native-mobile-deep-linking
 *
 * 흐름: 앱 안에서 브라우저 세션을 띄워 로그인 → 우리 앱 스킴(app.config.js의 scheme)으로
 * 돌아오는 URL에서 토큰을 꺼내 Supabase 세션으로 설정한다.
 *
 * 순수 JS라 Expo Go에서도 그대로 동작한다 (지도와 달리 Dev Build가 필요 없다).
 */
import { makeRedirectUri } from 'expo-auth-session';
import * as QueryParams from 'expo-auth-session/build/QueryParams';
import * as WebBrowser from 'expo-web-browser';

import { supabase } from '@/lib/supabase';

export type OAuthProvider = 'kakao' | 'google';

/**
 * Expo Go에서 makeRedirectUri()는 기본적으로 exp://<휴대폰이 잡은 LAN IP>:8081 형태를 만든다.
 * 근데 Supabase Auth 서버(GoTrue)는 리다이렉트 URL의 호스트가 "IP 주소인데 loopback(127.0.0.1)이
 * 아니면" Redirect URL 허용 목록을 확인하지도 않고 무조건 거부하도록 되어 있다
 * (internal/utilities/request.go의 IsRedirectURLValid — net.ParseIP(host)가 성공하면
 * ip.IsLoopback()만 보고 바로 return, 허용 목록 루프는 그 뒤에 있어서 아예 도달하지 못함).
 * preferLocalhost: true를 주면 IP를 "localhost" 문자열로 바꿔주는데, 실제 네트워크 연결에는
 * 이 값이 쓰이지 않는다 — iOS는 exp:// "스킴"만 보고 앱으로 가로채기 때문에 호스트명은
 * GoTrue 검증을 통과시키는 용도일 뿐이다.
 */
const redirectTo = makeRedirectUri({ preferLocalhost: true });

async function createSessionFromUrl(url: string) {
  const { params, errorCode } = QueryParams.getQueryParams(url);
  if (errorCode) throw new Error(errorCode);

  const { access_token, refresh_token } = params;
  if (!access_token || !refresh_token) return null;

  const { data, error } = await supabase.auth.setSession({ access_token, refresh_token });
  if (error) throw error;
  return data.session;
}

/** 로그인 버튼 핸들러에서 호출한다. 성공하면 세션을, 취소/실패면 null을 반환한다. */
export async function signInWithProvider(provider: OAuthProvider) {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error) throw error;
  if (!data?.url) return null;

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success') return null; // 사용자가 취소한 경우 등

  return createSessionFromUrl(result.url);
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

/** 이메일/비밀번호 로그인. 실패하면 에러를 던진다 (호출부에서 메시지를 보여준다). */
export async function signInWithEmail(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.session;
}

/**
 * 이메일/비밀번호 회원가입.
 * Supabase 기본 설정은 이메일 인증을 요구한다 — 그 경우 세션 없이 null을 반환하니
 * 호출부에서 "이메일을 확인해주세요" 안내로 이어간다. (대시보드에서 "Confirm email"을
 * 꺼두면 가입 즉시 세션이 생겨 바로 로그인된다.)
 */
export async function signUpWithEmail(email: string, password: string) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: redirectTo },
  });
  if (error) throw error;
  return data.session; // 이메일 인증이 꺼져 있으면 세션이 바로 온다
}

/** Supabase 에러 메시지를 자주 나오는 것 위주로 한글로 바꿔준다. 나머지는 원문 그대로. */
export function translateAuthError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const known: Record<string, string> = {
    'Invalid login credentials': '이메일 또는 비밀번호가 올바르지 않아요.',
    'User already registered': '이미 가입된 이메일이에요.',
    'Password should be at least 6 characters': '비밀번호는 6자 이상이어야 해요.',
    'Email not confirmed': '이메일 인증이 아직 안 됐어요. 메일함을 확인해주세요.',
  };
  return known[message] ?? message;
}
