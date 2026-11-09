/**
 * 로그인 상태를 앱 전체에서 구독하기 위한 스토어.
 * 실제 값은 Supabase가 들고 있고, 이 스토어는 그 상태를 화면에서 쓰기 편하게 미러링만 한다.
 * app/_layout.tsx에서 supabase.auth.onAuthStateChange로 이 스토어를 갱신한다.
 */
import type { Session } from '@supabase/supabase-js';
import { create } from 'zustand';

interface AuthState {
  session: Session | null;
  /** 앱 시작 시 저장된 세션을 아직 불러오는 중인지 — true인 동안은 로그인 필요 여부를 판단하지 않는다 */
  isLoading: boolean;
  setSession: (session: Session | null) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  isLoading: true,
  setSession: (session) => set({ session, isLoading: false }),
}));
