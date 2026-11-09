/**
 * 카카오맵을 보여주는 웹 페이지(WebView 안에서 로드) 관련 상수·타입.
 *
 * @react-native-kakao/map이 사실상 관리 중단 상태라 네이티브 지도 SDK 대신,
 * 카카오맵 JS SDK를 올려둔 정적 페이지를 WebView로 띄우는 방식을 쓴다.
 * 페이지 소스: https://github.com/juribb/running-course-map-web
 * (카카오 JS 키는 도메인 등록으로 보호되는 공개 값이라 페이지에 그대로 들어있다 — 숨길 필요 없음)
 *
 * 이 페이지는 두 가지 용도로 쓴다 (URL의 ?mode= 쿼리로 구분):
 * - mode 없음(기본) — 출발 지점 선택용. 지도를 탭/드래그해서 위치를 고르는 모드 (location-picker.tsx).
 * - mode=route — 코스 상세/러닝 실행 화면에서 정해진 경로를 보여주는 모드 (course-detail, running).
 *   이 모드에서는 마커 드래그/지도 클릭으로 위치를 바꾸는 상호작용이 없다. 러닝 실행 중에는
 *   같은 모드에 UPDATE_POSITION 메시지로 현재 위치·이동 경로를 계속 얹어서 그린다.
 */
export const MAP_PAGE_URL = 'https://juribb.github.io/running-course-map-web/';
/**
 * v=6은 캐시 무효화용 — GitHub Pages(캐시 10분)와 WebView 자체 캐시 둘 다 URL로 캐시 키를
 * 잡기 때문에, 페이지 내용이 바뀌면 여기 숫자를 올려야 기기가 예전 버전을 계속 쓰는 걸 막는다.
 * (route 모드/DRAW_ROUTE를 처음 추가했을 때 이 값이 없어서 캐시된 구버전이 계속 떴었다.)
 */
export const ROUTE_MAP_PAGE_URL = `${MAP_PAGE_URL}?mode=route&v=6`;

/** RN → 웹페이지로 보내는 메시지 */
export type MapOutboundMessage =
  | { type: 'SET_CENTER'; lat: number; lng: number }
  /** coordinates의 3번째 값(고도)로 구간별 오르막/내리막 색을 계산해서 그린다 */
  | { type: 'DRAW_ROUTE'; coordinates: [number, number, number][] }
  /** 러닝 실행 중 현재 위치 마커를 옮기고, 지금까지 이동한 경로를 이어 그린다 */
  | { type: 'UPDATE_POSITION'; lat: number; lng: number };

/** 웹페이지 → RN으로 오는 메시지 */
export type MapInboundMessage = { type: 'READY' } | { type: 'LOCATION_SELECTED'; lat: number; lng: number };

export function parseMapInboundMessage(raw: string): MapInboundMessage | null {
  try {
    const data = JSON.parse(raw);
    if (data?.type === 'READY') return { type: 'READY' };
    if (data?.type === 'LOCATION_SELECTED' && typeof data.lat === 'number' && typeof data.lng === 'number') {
      return { type: 'LOCATION_SELECTED', lat: data.lat, lng: data.lng };
    }
    return null;
  } catch {
    return null;
  }
}
