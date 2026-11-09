import { useEffect } from 'react';
import { Stack, router, usePathname } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';

// 부수효과만 필요하다 — TaskManager.defineTask는 앱이 뜨자마자(백그라운드에서 깨어난
// 경우 포함) 한 번은 실행돼 있어야 위치 업데이트 콜백이 불린다(backgroundLocationTask.ts 참고).
import '@/lib/backgroundLocationTask';
import { ensureProfileFromOAuthMetadata } from '@/lib/profile';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useProfileStore } from '@/stores/profileStore';

/**
 * 웹에서 카카오 로그인은 팝업 창으로 뜬다 (oauth.ts의 signInWithProvider).
 * 로그인이 끝나면 Supabase가 팝업을 redirectTo(우리 앱 자기 자신)로 다시 보내주는데,
 * 이때 이 함수가 호출돼야 팝업이 "나 로그인 끝났어"를 원래 창(opener)에 postMessage로
 * 알려주고 스스로 닫힌다 — 없으면 팝업이 그냥 새로고침된 우리 앱을 보여주며 멈춰있고,
 * 원래 창의 로그인 Promise는 영영 끝나지 않는다. 모듈 스코프에서 한 번만 호출하면 되고,
 * 네이티브(iOS/Android)에서는 조용히 아무 일도 안 한다 (@platform web 전용 동작).
 */
WebBrowser.maybeCompleteAuthSession();

/**
 * 최상위 레이아웃. 모든 화면이 app/(tabs) 안에 있어서 이 Stack은 사실상 그걸 감싸는
 * 껍데기다 — 어떤 화면으로 이동해도 하단 네비게이션이 계속 보이도록 하기 위한 구조다.
 */
export default function RootLayout() {
  const setSession = useAuthStore((s) => s.setSession);
  const session = useAuthStore((s) => s.session);
  const profile = useProfileStore((s) => s.profile);
  const pathname = usePathname();

  useEffect(() => {
    // 세션이 있으면(로그인 상태) 상단바 프로필 아이콘에 쓸 프로필도 같이 불러온다 —
    // 없으면(로그아웃) 비워서 아이콘이 기본 모양으로 돌아가게 한다.
    function syncProfile(session: Awaited<ReturnType<typeof supabase.auth.getSession>>['data']['session']) {
      if (session) {
        useProfileStore.getState().refresh(session.user.id).catch((e) => console.warn('[profile] 프로필 동기화 실패', e));
      } else {
        useProfileStore.getState().setProfile(null);
      }
    }

    // 앱 시작 시 저장된 세션을 먼저 불러오고,
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      syncProfile(data.session);
    });
    // 이후 로그인/로그아웃이 일어날 때마다 스토어를 갱신한다.
    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      syncProfile(session);
      // 카카오 등 OAuth로 로그인했으면 provider가 준 닉네임/사진을 profiles에 채워둔다
      // (이메일 가입은 signup.tsx에서 이미 직접 물어봐서 여기서 건드릴 필요 없다).
      if (event === 'SIGNED_IN' && session) {
        ensureProfileFromOAuthMetadata(session.user)
          .then(() => syncProfile(session)) // 방금 채운 닉네임/사진을 반영
          .catch((e) => console.warn('[profile] OAuth 프로필 자동 채우기 실패', e));
      }
    });
    return () => subscription.subscription.unsubscribe();
  }, [setSession]);

  useEffect(() => {
    // login.tsx가 소셜 로그인 직후 최초 동의 화면(/consent)으로 보내지만, 그 화면을 보기
    // 전에 앱을 껐다 다시 켠 경우(세션은 남아있고 동의 기록만 없는 상태)를 대비한
    // 안전망이다 — 어느 화면을 열든 이 조건이면 동의 화면으로 되돌린다. 이메일 가입은
    // signup.tsx에서 가입 시점에 동의를 이미 저장하므로 대상에서 제외한다.
    //
    // login.tsx가 로그인 직후 자기가 직접 방금 조회한 최신 프로필로 동의 여부를 판단해서
    // 보내는데(afterOAuthLoginSuccess), 이 효과가 그보다 먼저(또는 동시에) 판단해버리면
    // 문제가 된다 — profileStore.refresh()는 비동기라 로그인 직후 한동안 profile이 아직
    // undefined(조회 전)인 채로 남아있고, 그 사이에 login.tsx가 이미 /login을 벗어나
    // 다른 화면으로 이동해버리면, 이 효과가 "아직 모름" 상태를 "동의 안 함"으로 착각해서
    // 이미 동의한 SNS 사용자도 로그인할 때마다 동의 화면으로 잘못 튕겨나갔다(2026-09-18).
    // profile이 undefined인 동안은 아직 조회 전이라는 뜻이므로 판단을 보류한다.
    if (!session) return;
    if (session.user.app_metadata?.provider === 'email') return;
    if (profile === undefined) return;
    if (profile?.termsAgreedAt) return;
    if (pathname === '/consent' || pathname === '/login') return;
    router.replace('/consent');
  }, [session, profile, pathname]);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
    </Stack>
  );
}
