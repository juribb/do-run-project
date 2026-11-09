/**
 * 지금 진행 중인 러닝 하나를 들고 있는다. course-detail에서 "이 코스로 달리기"를 누르거나
 * 기록 상세(records/[courseId])에서 "다시 달리기"를 누르면 여기 채워지고, running.tsx
 * 화면이 이 값을 읽어서 그린다 - 계획된 코스 좌표처럼 큰 데이터를 라우트 파라미터로
 * 안 넘기려고 스토어를 거친다.
 *
 * running.tsx는 candidate에서 name·coordinates만 쓴다(fitScore 등 추천 전용 필드는 안 씀) -
 * 그래서 candidate 타입을 CourseCandidate 전체가 아니라 이 두 필드만 요구하는 RunTarget으로
 * 느슨하게 잡았다. "다시 달리기"는 추천 후보가 아니라 저장된 course 행에서 시작하는 거라
 * fitScore·reasonText 같은 추천 전용 값이 아예 없기 때문이다(없는 값을 지어내지 않는다).
 *
 * Expo Go는 백그라운드 위치 추적을 지원하지 않아서(별도 Dev Build 필요), 이 기능은
 * 앱이 화면에 떠 있는 동안(포그라운드)만 위치를 추적한다 - 앱을 나가면 추적이 멈춘다.
 */
import { create } from 'zustand';

import { haversineMeters } from '@/lib/geo';

export interface RunTarget {
  id: string;
  name: string;
  coordinates: [number, number, number][];
}

interface ActiveRunState {
  recordId: string | null;
  /** running_record가 연결된 course.id - 종료 후 기록 상세 화면(records/[courseId])으로 이동할 때 쓴다 */
  courseId: string | null;
  candidate: RunTarget | null;
  startedAt: number | null;
  path: [number, number, number][];
  distanceM: number;
  start: (recordId: string, courseId: string, candidate: RunTarget) => void;
  addPoint: (lng: number, lat: number, elevation: number | null) => void;
  reset: () => void;
}

export const useActiveRunStore = create<ActiveRunState>((set, get) => ({
  recordId: null,
  courseId: null,
  candidate: null,
  startedAt: null,
  path: [],
  distanceM: 0,

  start: (recordId, courseId, candidate) =>
    set({ recordId, courseId, candidate, startedAt: Date.now(), path: [], distanceM: 0 }),

  addPoint: (lng, lat, elevation) => {
    const point: [number, number, number] = [lng, lat, elevation ?? 0];
    const last = get().path[get().path.length - 1];
    const addedDistance = last ? haversineMeters(last[1], last[0], lat, lng) : 0;
    set((state) => ({ path: [...state.path, point], distanceM: state.distanceM + addedDistance }));
  },

  reset: () => set({ recordId: null, courseId: null, candidate: null, startedAt: null, path: [], distanceM: 0 }),
}));
