/**
 * 조건 입력값을 화면 간에 들고 다니기 위한 클라이언트 상태.
 * PLAN.md Phase 0/6에서 결정된 대로 Zustand를 쓴다.
 *
 * 지금은 홈 화면 → 결과 화면 전달용으로만 쓰지만,
 * Phase 6(로그인 게이트)에서 "로그인 성공 시 조건 복원" 용도로 그대로 재사용된다.
 */
import { create } from 'zustand';

import type { RunningCondition } from '@/types/recommendation';

interface RecommendationConditionState {
  condition: RunningCondition | null;
  setCondition: (condition: RunningCondition) => void;
  clear: () => void;
  /**
   * 추천 화면(recommend.tsx)으로 "다시 돌아가는" 화면들(results.tsx의 "조건 수정",
   * location-picker.tsx의 취소/확인)이 router로 이동하기 직전에 true로 세워둔다.
   * 추천 화면은 탭 화면이라 한 번 결과를 보고 나서도 계속 마운트된 채로 남아있어서
   * (react-navigation 탭 네비게이터 기본 동작), 다시 포커스를 받을 때 이 값을 보고
   * "선택하던 걸 이어가려고 돌아온 것"과 "탭을 눌러 새로 들어온 것"을 구분한다 —
   * 전자는 이전 선택을 유지하고, 후자는 초기화한다(2026-09-18, "다시 들어갔을 때
   * 이전 선택이 유지되는 걸 초기화해달라" 요청).
   */
  preserveOnReturn: boolean;
  markPreserveOnReturn: () => void;
  /** 추천 화면이 포커스를 받을 때 한 번 호출해서 플래그를 읽고 즉시 꺼둔다. */
  consumePreserveOnReturn: () => boolean;
}

export const useRecommendationConditionStore = create<RecommendationConditionState>((set, get) => ({
  condition: null,
  preserveOnReturn: false,
  setCondition: (condition) => set({ condition }),
  clear: () => set({ condition: null }),
  markPreserveOnReturn: () => set({ preserveOnReturn: true }),
  consumePreserveOnReturn: () => {
    const shouldPreserve = get().preserveOnReturn;
    set({ preserveOnReturn: false });
    return shouldPreserve;
  },
}));
