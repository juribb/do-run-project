/**
 * 저장한 코스 관리 (SPEC.md F-05). Supabase의 saved_courses 테이블에 실제로 저장된다 —
 * candidate.id(recommendation_candidate.id)를 키로 쓴다. course 행 자체는 저장하는
 * 순간에야 DB 함수(save_course)가 만든다 — supabase/functions/recommend/index.ts와
 * migration 0008 참고.
 *
 * fetchSaved()로 한 번 불러와 메모리에 캐시해두고, toggleSave()는 낙관적으로 먼저
 * 화면을 바꾼 뒤 실패하면 되돌린다 — 화면마다 로딩 스피너 없이 즉각 반응하게 하기 위해서다.
 */
import { create } from 'zustand';

import { fetchSavedCourses, saveCourse, unsaveCourse } from '@/lib/savedCourses';
import { useAuthStore } from '@/stores/authStore';
import type { CourseCandidate } from '@/types/recommendation';

interface SavedCoursesState {
  saved: Record<string, CourseCandidate>;
  loaded: boolean;
  isSaved: (id: string) => boolean;
  fetchSaved: () => Promise<void>;
  toggleSave: (candidate: CourseCandidate) => Promise<void>;
}

export const useSavedCoursesStore = create<SavedCoursesState>((set, get) => ({
  saved: {},
  loaded: false,
  isSaved: (id) => Boolean(get().saved[id]),

  fetchSaved: async () => {
    const session = useAuthStore.getState().session;
    if (!session) {
      set({ saved: {}, loaded: true });
      return;
    }
    try {
      const candidates = await fetchSavedCourses();
      const next: Record<string, CourseCandidate> = {};
      for (const candidate of candidates) next[candidate.id] = candidate;
      set({ saved: next, loaded: true });
    } catch (e) {
      console.error('[savedCoursesStore] 저장한 코스 조회 실패', e);
      set({ loaded: true });
    }
  },

  toggleSave: async (candidate) => {
    const session = useAuthStore.getState().session;
    if (!session) return; // 로그인 화면으로 보내는 건 호출부(버튼)의 몫 — 여기서는 그냥 무시한다.

    const alreadySaved = Boolean(get().saved[candidate.id]);

    // 낙관적 업데이트: 서버 응답을 기다리지 않고 먼저 화면을 바꾼다.
    set((state) => {
      const next = { ...state.saved };
      if (alreadySaved) delete next[candidate.id];
      else next[candidate.id] = candidate;
      return { saved: next };
    });

    try {
      if (alreadySaved) {
        await unsaveCourse(candidate.id);
      } else {
        await saveCourse(candidate.id);
      }
    } catch (e) {
      console.error('[savedCoursesStore] 저장 상태 변경 실패', e);
      // 실패하면 낙관적 업데이트를 되돌린다.
      set((state) => {
        const next = { ...state.saved };
        if (alreadySaved) next[candidate.id] = candidate;
        else delete next[candidate.id];
        return { saved: next };
      });
    }
  },
}));
