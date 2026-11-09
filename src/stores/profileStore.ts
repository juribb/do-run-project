/**
 * 프로필(닉네임·아바타)을 앱 전역에서 공유한다. 상단바 오른쪽 프로필 아이콘(_layout.tsx의
 * HeaderAuthAction)이 실제 프로필 사진을 보여주려면, 마이페이지가 아닌 곳에서도 이 값을
 * 알아야 한다 — profile.tsx 안에서만 로컬 state로 들고 있으면 다른 화면 헤더에서는 못 쓴다.
 */
import { create } from 'zustand';

import { getProfile, type Profile } from '@/lib/profile';

interface ProfileState {
  /**
   * undefined = 아직 조회 전(로그인 직후 refresh()가 끝나기 전 짧은 순간), null = 조회
   * 완료했지만 프로필 행이 없음/로그아웃 상태. 이 둘을 구분해야 하는 이유는 app/_layout.tsx의
   * 약관 동의 안전망 효과가 "아직 모름"과 "확인했는데 동의 기록이 없음"을 구분해야 하기
   * 때문이다 — 구분 못 하면 로그인 직후 refresh()가 끝나기 전에 이 값이 null인 순간을
   * "동의 안 함"으로 오해해서, 이미 동의한 SNS 사용자도 로그인할 때마다 동의 화면으로
   * 잘못 튕겨나간다(2026-09-18 버그).
   */
  profile: Profile | null | undefined;
  setProfile: (profile: Profile | null) => void;
  refresh: (userId: string) => Promise<void>;
}

export const useProfileStore = create<ProfileState>((set) => ({
  profile: undefined,
  setProfile: (profile) => set({ profile }),
  refresh: async (userId) => {
    // 조회 전에 undefined로 되돌린다 — 그대로 두면 다른 사용자로 전환하는 순간(로그아웃
    // 없이 재로그인 등) 방금 전 사용자의 프로필이 "확인 완료" 상태로 잠깐 남아, 안전망
    // 효과가 새 사용자를 이전 사용자의 동의 여부로 잘못 판단할 수 있다.
    set({ profile: undefined });
    const profile = await getProfile(userId);
    set({ profile });
  },
}));
