/**
 * 러닝 조건의 출발 지점 좌표. SPEC.md의 recommendation_request.origin_lat/origin_lng에
 * 대응하는 값 — 아직 API 연결 전이라 지금은 화면 간 전달용으로만 쓴다.
 */
import { create } from 'zustand';

export interface SelectedLocation {
  lat: number;
  lng: number;
  /** GPS로 자동으로 잡은 위치인지, 지도에서 직접 옮긴 위치인지 구분 (표시 문구에 쓴다) */
  source: 'gps' | 'manual';
  /** 역지오코딩으로 구한 사람이 읽을 수 있는 주소. 실패하면 없을 수 있다 (그때는 좌표로 대체 표시) */
  address?: string;
}

interface LocationState {
  location: SelectedLocation | null;
  setLocation: (location: SelectedLocation) => void;
}

export const useLocationStore = create<LocationState>((set) => ({
  location: null,
  setLocation: (location) => set({ location }),
}));
