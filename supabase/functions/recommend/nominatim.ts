/**
 * 출발 지점의 동네 이름을 하나 구해서 코스 이름에 쓴다 (예: "역삼동 5.2km 코스").
 * OpenStreetMap Nominatim — 무료, 키 불필요. 실패해도 추천 자체는 계속 진행한다
 * (이름은 표시 편의용일 뿐 핵심 데이터가 아니다).
 */
import { fetchWithTimeout } from './fetchWithTimeout.ts';

/** 코스 이름용 부가 정보일 뿐이라 오래 기다릴 가치가 없다 — 빨리 포기하고 이름 없이 진행한다 */
const NOMINATIM_TIMEOUT_MS = 6000;

export async function reverseGeocodeNeighborhood(lat: number, lng: number): Promise<string | null> {
  try {
    const url = new URL('https://nominatim.openstreetmap.org/reverse');
    url.searchParams.set('lat', String(lat));
    url.searchParams.set('lon', String(lng));
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('accept-language', 'ko');

    const response = await fetchWithTimeout(
      url,
      {
        // Nominatim 이용 정책상 식별 가능한 User-Agent가 필요하다.
        headers: { 'User-Agent': 'running-course-recommendation-mvp (jrii22e@gmail.com)' },
      },
      NOMINATIM_TIMEOUT_MS,
    );
    if (!response.ok) return null;

    const data = await response.json();
    const address = data?.address ?? {};
    return address.neighbourhood ?? address.suburb ?? address.village ?? address.town ?? address.city_district ?? null;
  } catch (e) {
    console.error('[nominatim] 역지오코딩 실패', e);
    return null;
  }
}
