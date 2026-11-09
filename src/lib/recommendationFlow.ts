/**
 * 조건 제출 → 위치 확보 → 실제 추천 API 호출까지의 흐름을 한 곳에 모았다.
 * 실제 호출은 course-search-loading.tsx 화면이 이 함수를 불러서 진행 상태를 보여주며 수행한다
 * (recommend.tsx의 바로 제출, login.tsx/signup.tsx의 로그인 후 이어서 제출 모두 그 화면으로 이동한다).
 */
import * as Location from 'expo-location';

import { requestRecommendation } from '@/lib/api';
import { SEOUL_CITY_HALL } from '@/constants/location';
import { reverseGeocode } from '@/lib/geocoding';
import { useLocationStore } from '@/stores/locationStore';
import type { RunningCondition } from '@/types/recommendation';

/**
 * 저장된 위치가 있으면 그걸 쓰고, 없으면 GPS로 새로 구한다 (홈에서 위치를 안 골랐어도 진행되게).
 * 권한이 없거나 GPS를 못 구하면(시뮬레이터 등) 에러로 막는 대신 서울시청을 기본값으로 써서
 * 추천 자체는 계속 진행되게 한다 — 위치는 location-picker에서 언제든 다시 바꿀 수 있다.
 */
async function resolveLocation() {
  const existing = useLocationStore.getState().location;
  if (existing) return existing;

  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') {
    const location = { ...SEOUL_CITY_HALL, source: 'gps' as const, address: '서울시청 (기본 위치)' };
    useLocationStore.getState().setLocation(location);
    return location;
  }

  try {
    const position = await Location.getCurrentPositionAsync({});
    const lat = position.coords.latitude;
    const lng = position.coords.longitude;
    const address = await reverseGeocode(lat, lng);
    const location = { lat, lng, source: 'gps' as const, address: address ?? undefined };
    useLocationStore.getState().setLocation(location);
    return location;
  } catch (e) {
    console.warn('[recommendationFlow] GPS 위치 확인 실패, 서울시청으로 대체', e);
    const location = { ...SEOUL_CITY_HALL, source: 'gps' as const, address: '서울시청 (기본 위치)' };
    useLocationStore.getState().setLocation(location);
    return location;
  }
}

export async function fetchRecommendationCandidates(condition: RunningCondition) {
  const location = await resolveLocation();
  return requestRecommendation(condition, location);
}
