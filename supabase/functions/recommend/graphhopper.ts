import { fetchWithTimeout } from './fetchWithTimeout.ts';
import { distanceMeters } from './geometry.ts';

/** GraphHopper가 응답 없이 멈추는 경우를 대비한 안전장치 — 평소엔 몇 초 안에 응답이 온다 */
const GRAPHHOPPER_TIMEOUT_MS = 10000;

/**
 * "뛰기 좋은 길"로 인정하는 도로 종류 — 보행/자전거 전용이거나 차량이 드문 길, 그리고
 * secondary/tertiary(강남대로·테헤란로 같은 대로가 보통 이렇게 태깅된다).
 *
 * 중요한 한계(2026-09-16, "차도 중심선에 보도 속성이 있다고 실제 보도가 확보된 것으로
 * 단정하지 마" 피드백 이후 재검토): road_class는 GraphHopper가 매긴 "도로 위계"일 뿐,
 * 그 길에 실제 보도가 있는지는 알려주지 않는다. 여기서 secondary/tertiary를 "좋은 길"에
 * 넣은 건 "간선도로는 보도가 있을 가능성이 residential/service보다 높다"는 추정 근거일
 * 뿐, 확인된 사실이 아니다. primary(간선도로 중에서도 교통량이 가장 많고 교차로·진출입로
 * 부근에서 보도가 끊기거나 아예 없는 경우가 흔하다)는 이 추정조차 신뢰도가 낮아서 뺐다.
 * 실제 sidewalk 태그로 확인하는 값은 overpass.ts의 confirmedSidewalkRatio를 따로 본다 —
 * 이 Set은 어디까지나 "추정 근거"이지 "확인된 보도"가 아니라는 걸 명확히 하기 위해
 * 주석에 남긴다.
 * (2026-09-16, "아파트 단지를 가로지른다" 피드백 이후 처음 도입 — routeBuilder.ts의
 * 품질 필터에서 쓴다.)
 */
const GOOD_ROAD_CLASSES = new Set([
  'footway',
  'path',
  'cycleway',
  'pedestrian',
  'track',
  'steps',
  'living_street',
  'secondary',
  'tertiary',
]);

/**
 * GraphHopper round_trip으로 출발지 복귀 순환 경로를 만든다.
 * intent.md의 데이터 스파이크(2026-09-11)에서 이미 검증된 파라미터 조합이다.
 */
export interface GraphHopperRoute {
  /**
   * [lng, lat, elevation] 순서 — GeoJSON 관례를 따른다. elevation은 `elevation=true`
   * 파라미터로 GraphHopper가 채워주는 값으로, 데이터가 없어서 0으로 비워두는 게 아니다
   * (2026-09-16, "고도 데이터가 없으면 0으로 처리하지 말고 출처와 한계를 기록하라"
   * 피드백 이후 문서화). 출처: GraphHopper 호스티드 API의 기본 SRTM 기반 DEM(수치표고모델,
   * 해상도 약 30m) — 공식 문서에 정확한 소스가 명시돼 있지 않아 "SRTM 계열"이라는 점만
   * 확인 가능하다. 한계: 30m 해상도라 보도 위 짧은 계단·육교·경사로 같은 미세한 고저차는
   * 반영되지 않고, 건물 옥상 통로 등 입체 교차 구간에서 오차가 클 수 있다.
   */
  coordinates: [number, number, number][];
  distanceM: number;
  ascentM: number;
  descentM: number;
  /**
   * 전체 거리 중 "안 좋은 길"(주거도로·서비스도로 등) 비율(0~1). GraphHopper의 무료
   * `details=road_class` 응답으로 계산한다 — 별도 비용·API 없이 실측할 수 있는 값이다.
   * 계산할 근거 데이터 자체가 없으면(예: 옛날 저장된 값) null.
   */
  badRoadRatio: number | null;
  /**
   * 왕복형(routeBuilder.ts의 mirrorOutAndBack)의 반환점 좌표. 이 지점은 의도적으로
   * 180도 꺾이는 지점이라, geometry.ts의 급회전 감지가 "실수로 되돌아간 지점"과 구분할
   * 수 있게 표시해둔다(2026-09-16, "의도한 왕복과 불필요한 반복을 구분하라" 피드백).
   * 순환형/round_trip 경로에는 없다(undefined).
   */
  turnaroundPoint?: { lng: number; lat: number };
  /** 순환형/왕복형/혼합형 표시 — 결과에 근거로 보여준다. round_trip 폴백은 GraphHopper가
   * 임의로 만드는 순환 경로라 LOOP로 분류한다. */
  routeType: 'LOOP' | 'OUT_AND_BACK';
  /**
   * 강·하천(예: 한강) 근처 "좋은 길" 그룹에서 만들어진 경로면 true(2026-09-17, "한강
   * 근처면 무조건 한강 길을 뛰게 하고 싶다" 요청 이후 추가) — routeBuilder.ts가 순환형/
   * 왕복형 그룹을 고를 때 이 표시가 있는 그룹을 최우선으로 시도하고, index.ts의 최종
   * 정렬도 이 값을 최우선 기준으로 삼는다. 강 근처 그룹에서 안 나왔으면 false(공원 둘레·
   * 사각형·round_trip 폴백 등).
   */
  isRiverPath: boolean;
}

interface RoadClassDetail {
  0: number; // fromIndex
  1: number; // toIndex(포함) — 다음 구간과 이 인덱스의 지점을 공유한다
  2: string; // road_class 값
}

/** points[fromIndex..toIndex] 구간의 실제 거리(m) — 좌표를 따라간 누적 거리다 */
function segmentDistanceM(coordinates: [number, number, number][], fromIndex: number, toIndex: number): number {
  let distance = 0;
  for (let i = fromIndex; i < toIndex && i + 1 < coordinates.length; i++) {
    const [lng1, lat1] = coordinates[i];
    const [lng2, lat2] = coordinates[i + 1];
    distance += distanceMeters(lng1, lat1, lng2, lat2);
  }
  return distance;
}

/** road_class 구간 정보로 "안 좋은 길" 비율을 계산한다. 정보가 없으면 null(모른다는 뜻이지 0이 아니다). */
function computeBadRoadRatio(coordinates: [number, number, number][], roadClassDetails: RoadClassDetail[] | undefined): number | null {
  if (!roadClassDetails || roadClassDetails.length === 0) return null;

  let totalM = 0;
  let badM = 0;
  for (const [fromIndex, toIndex, roadClass] of roadClassDetails) {
    const segM = segmentDistanceM(coordinates, fromIndex, toIndex);
    totalM += segM;
    if (!GOOD_ROAD_CLASSES.has(roadClass)) badM += segM;
  }
  if (totalM === 0) return null;
  return badM / totalM;
}

/**
 * GraphHopper 무료 키가 요청을 거부할 때 돌려주는 상태코드 — 이 응답을 받으면 다음 키로
 * 넘어간다. 실측(2026-09-16)해보니 응답 바디가 "Minutely API limit heavily violated"라,
 * "하루 크레딧 소진"이 아니라 "분당 요청 수 제한"이었다 — 순환형+왕복형을 동시에
 * 생성하도록 바꾸면서(routeBuilder.ts) 요청 하나당 GraphHopper 호출이 최대 2배로 늘어난
 * 상태에서 짧은 시간에 테스트를 반복해 분당 한도를 넘긴 것이 원인이었다. 키를 여러 개
 * 등록해두면 각 키가 별도의 분당 한도를 갖기 때문에 여전히 도움이 되지만, "하루 종일
 * 못 쓴다"는 뜻은 아니고 보통 1분 정도만 지나면 같은 키로도 다시 된다.
 */
const RATE_LIMITED_STATUS = 429;

/**
 * 여러 API 키를 순서대로 시도한다 — 첫 번째 키가 요청을 거부(429)하면 바로 다음 키로
 * 넘어간다(2026-09-16, "무료 키 두 개를 등록해두고 하나가 막히면 자동으로 바꿔 쓰게
 * 해달라" 요청 이후 추가). 429가 아닌 실패(잘못된 요청 등)는 키를 더 시도해도 똑같이
 * 실패할 거라 바로 반환한다 — 그래야 키가 여러 개여도 정말 막혔을 때만 돈다.
 */
async function fetchWithKeyRotation(url: URL, apiKeys: string[]): Promise<Response | null> {
  let lastResponse: Response | null = null;
  for (let i = 0; i < apiKeys.length; i++) {
    url.searchParams.set('key', apiKeys[i]);
    let response: Response;
    try {
      response = await fetchWithTimeout(url, {}, GRAPHHOPPER_TIMEOUT_MS);
    } catch (e) {
      console.error('[graphhopper] 네트워크 오류(타임아웃 포함)', e);
      return null;
    }
    if (response.status !== RATE_LIMITED_STATUS) return response;
    console.error(`[graphhopper] ${i + 1}번째 키 요청 거부(429)`, apiKeys.length > i + 1 ? '— 다음 키로 재시도' : '— 더 시도할 키 없음');
    lastResponse = response;
  }
  return lastResponse;
}

export async function fetchRoundTripRoute(
  originLat: number,
  originLng: number,
  targetDistanceM: number,
  seed: number,
  apiKeys: string[],
): Promise<GraphHopperRoute | null> {
  const url = new URL('https://graphhopper.com/api/1/route');
  url.searchParams.set('point', `${originLat},${originLng}`);
  url.searchParams.set('vehicle', 'foot');
  url.searchParams.set('algorithm', 'round_trip');
  url.searchParams.set('round_trip.distance', String(targetDistanceM));
  url.searchParams.set('round_trip.seed', String(seed));
  url.searchParams.set('elevation', 'true');
  url.searchParams.set('points_encoded', 'false');
  url.searchParams.append('details', 'road_class');

  const response = await fetchWithKeyRotation(url, apiKeys);
  if (!response) return null;
  if (!response.ok) {
    console.error('[graphhopper] 요청 실패', response.status, await response.text());
    return null;
  }

  const data = await response.json();
  const path = data?.paths?.[0];
  if (!path) return null;

  const coordinates = path.points.coordinates as [number, number, number][];
  return {
    coordinates,
    distanceM: Math.round(path.distance),
    ascentM: Math.round(path.ascend ?? 0),
    descentM: Math.round(path.descend ?? 0),
    badRoadRatio: computeBadRoadRatio(coordinates, path.details?.road_class),
    routeType: 'LOOP',
    // round_trip은 GraphHopper가 임의로 만드는 순환 경로라 특정 강 그룹에서 나온 게
    // 아니다 — 강 근처를 우연히 지나갈 수는 있어도 "그 강 길을 의도적으로 탄" 게 아니라 false.
    isRiverPath: false,
  };
}

/**
 * 여러 지점을 순서대로 지나가는 경로를 요청한다 — round_trip처럼 GraphHopper가 알아서
 * 임의 순환 경로를 짜는 게 아니라, 점들을 넘긴 순서대로 잇는 일반 라우팅이다.
 * "좋은 길"(공원·강변) 위 지점들을 경유지로 넘겨서 그 길을 실제로 지나가는 순환 경로를
 * 강제로 만들기 위해 쓴다(routeBuilder.ts 참고).
 */
export async function fetchViaPointRoute(
  points: { lat: number; lng: number }[],
  apiKeys: string[],
): Promise<GraphHopperRoute | null> {
  const url = new URL('https://graphhopper.com/api/1/route');
  for (const p of points) {
    url.searchParams.append('point', `${p.lat},${p.lng}`);
  }
  url.searchParams.set('vehicle', 'foot');
  url.searchParams.set('elevation', 'true');
  url.searchParams.set('points_encoded', 'false');
  url.searchParams.append('details', 'road_class');

  const response = await fetchWithKeyRotation(url, apiKeys);
  if (!response) return null;
  if (!response.ok) {
    console.error('[graphhopper] 경유지 경로 요청 실패', response.status, await response.text());
    return null;
  }

  const data = await response.json();
  const path = data?.paths?.[0];
  if (!path) return null;

  const coordinates = path.points.coordinates as [number, number, number][];
  return {
    coordinates,
    distanceM: Math.round(path.distance),
    ascentM: Math.round(path.ascend ?? 0),
    descentM: Math.round(path.descend ?? 0),
    badRoadRatio: computeBadRoadRatio(coordinates, path.details?.road_class),
    // 왕복형으로 쓸지(routeBuilder.ts의 mirrorOutAndBack) 순환형 경유지 경로로 쓸지,
    // 강 근처 그룹에서 나온 건지는 호출한 쪽만 알 수 있어서 일단 기본값(LOOP, false)으로
    // 두고, 필요하면 호출한 쪽에서 덮어쓴다.
    routeType: 'LOOP',
    isRiverPath: false,
  };
}
