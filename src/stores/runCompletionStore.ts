/**
 * 러닝 완료 화면(run-complete.tsx)에 보여줄 방금 끝난 러닝의 요약값만 들고 있는다.
 * activeRunStore는 러닝 완료 처리(completeRunningRecord)가 끝나면 바로 reset()되기 때문에,
 * 완료 화면이 그 이후에 봐야 할 값(코스 이름·거리·시간·페이스)을 따로 옮겨 담아야 한다.
 */
import { create } from 'zustand';

interface RunCompletionSummary {
  recordId: string;
  courseId: string;
  courseName: string;
  distanceM: number;
  durationS: number;
  avgPaceSPerKm: number | null;
}

interface RunCompletionState {
  summary: RunCompletionSummary | null;
  set: (summary: RunCompletionSummary) => void;
}

export const useRunCompletionStore = create<RunCompletionState>((set) => ({
  summary: null,
  set: (summary) => set({ summary }),
}));
