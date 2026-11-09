/**
 * 방금 계산된 추천 후보 목록을 잠깐 들고 있는 상태.
 *
 * 코스 상세 화면(app/recommend/[candidateId].tsx)이 URL 파라미터로 전체 데이터를
 * 넘겨받는 대신 여기서 id로 조회하는 방식을 쓴다 — Phase 2에서 실제 API 연동 시
 * TanStack Query로 "id로 후보 조회"를 그대로 교체하면 되도록 미리 그 형태를 맞췄다.
 */
import { create } from 'zustand';

import type { CourseCandidate } from '@/types/recommendation';

interface RecommendationResultState {
  candidates: CourseCandidate[];
  setCandidates: (candidates: CourseCandidate[]) => void;
  getById: (id: string) => CourseCandidate | undefined;
}

export const useRecommendationResultStore = create<RecommendationResultState>((set, get) => ({
  candidates: [],
  setCandidates: (candidates) => set({ candidates }),
  getById: (id) => get().candidates.find((c) => c.id === id),
}));
