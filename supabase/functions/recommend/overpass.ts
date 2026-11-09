/**
 * Overpass API(OpenStreetMap, 무료·키 불필요)로 코스 특성을 실제 데이터로 확인한다.
 * intent.md 원칙: "AI가 존재하지 않는 코스나 데이터를 임의로 생성하면 안 된다" —
 * 여기서 나온 값 이상으로 특성을 추정하지 않는다. 조회 실패 시 null로 남겨
 * "확인 불가"로 표시되게 한다 (mocks/candidates.ts와 같은 원칙).
 */
import { fetchWithRetry } from './fetchWithTimeout.ts';
import {
  boundingBoxOf,
  distanceMeters,
  distancePointToLine,
  findSharpTurnPoints,
  sampleLine,
  sampleRingPoints,
  stitchPath,
  stitchRing,
  type BoundingBox,
} from './geometry.ts';

/**
 * 기본 공개 인스턴스인 overpass-api.de는 Supabase Edge Function 쪽에서 보내는 요청을
 * 계속 406으로 거부한다 (2026-09-15 확인 — environment_ratios가 항상 빈 배열로 저장된
 * 진짜 원인이었다. 헤더를 바꿔봐도, POST/GET을 바꿔봐도 안 됐는데, 실제 배포 환경에서
 * 여러 미러 서버를 동시에 찔러보고서야 overpass-api.de만 유독 거부한다는 걸 확인했다 —
 * 로컬 curl에서는 항상 성공해서 한참을 헤맸다. 같은 요청이 이 미러에서는 정상 응답한다).
 */
const OVERPASS_URL = 'https://maps.mail.ru/osm/tools/overpass/api/interpreter';
/**
 * 신호등/계단/환경특성 조회가 항상 "확인 불가"로 뜨는 문제(2026-09-17)의 진짜 원인은
 * 미러 서버가 아니라 필터 15개를 하나로 합친 쿼리 자체였다 — Supabase 배포 환경에서
 * 직접 찔러보니 그 통짜 쿼리는 항상 타임아웃(3후보 순서대로라 45초)났지만, 필터를
 * 인프라(8개)/환경(7개) 둘로 쪼개 "병렬로" 보내면 같은 미러가 3~5초 안에 둘 다 성공했다
 * (queryOverpass 참고).
 *
 * 재시도를 다시 1번 허용해봤다가 바로 되돌렸다(2026-09-17) — 후보 3개를 순서대로
 * 처리하는 구조라, 재시도 1번을 더하면 최악의 경우 3 × (15초 × 2번) = 90초까지 걸릴 수
 * 있는데, 클라이언트가 서버 응답을 기다리는 한도(src/lib/api.ts REQUEST_TIMEOUT_MS)가
 * 70초라 그 사이에 클라이언트가 먼저 포기해서 "코스를 찾지 못했어요" 오류가 났다.
 * 재시도 없이도(0번) 후보 3개 합쳐 최악 45초라 안전하게 70초 안에 끝난다.
 */
const OVERPASS_TIMEOUT_MS = 15000;
const OVERPASS_RETRIES = 0;
const OVERPASS_HEADERS = {
  'Content-Type': 'text/plain',
  Accept: '*/*',
  'User-Agent': 'running-course-recommendation-mvp (jrii22e@gmail.com)',
};
/** 경로에서 이 거리(미터) 안에 있어야 "그 코스의" 특성으로 인정한다 */
const NEAR_ROUTE_RADIUS_M = 40;
/**
 * 25m는 GraphHopper 경로선과 OSM 노드 위치의 매핑 오차(도로 폭, 교차로 형상 등으로 실제
 * 10~20m씩 벌어지는 경우가 흔함)를 감안하기엔 너무 타이트해서 35m로 늘렸다.
 */
const TRAFFIC_SIGNAL_RADIUS_M = 35;
const STEPS_RADIUS_M = 35;
const SAMPLE_INTERVAL_M = 80;
/**
 * 경로가 급하게 방향을 트는 지점(=다른 도로를 가로지르는 지점일 가능성이 높다)이 실제
 * OSM에 표시된 횡단보도(marked/unmarked/신호등 무관, highway=crossing 전체)에서 이보다
 * 멀면 "표시된 횡단보도 없이 도로를 건넌다"고 판단한다(2026-09-16, "카카오맵 횡단보도
 * 표시와 꽤 벗어난 곳에서 길을 가로지른다" 피드백). TRAFFIC_SIGNAL_RADIUS_M과 같은 이유로
 * (GraphHopper 경로선-OSM 노드 매핑 오차) 25m보다 여유 있게 35m로 잡는다.
 */
const CROSSING_MATCH_RADIUS_M = 35;
/**
 * 보행 금지(foot=no)·통제구역(access=no/private) 확인에 쓰는 반경 — 다른 지표(35m)보다
 * 훨씬 타이트하게 잡는다(2026-09-16, "보행 금지 구간이 다른 선호 점수로 상쇄되지 않게
 * 하라" 피드백 이후 추가). 이건 소프트 필터가 아니라 하드 게이트라서, 오탐(실제로는
 * 안 지나가는데 걸러버림)보다 미탐(놓침)이 나은 다른 지표들과 달리 너무 넓게 잡으면
 * 안전한 경로까지 부당하게 차단하게 된다 — GraphHopper 경로선과 OSM 노드 매핑 오차를
 * 감안한 최소한만 남긴다.
 */
const PROHIBITED_MATCH_RADIUS_M = 12;
/** 이 거리(m) 이상 금지 구간과 겹쳐야 "실제로 그 구간을 지나간다"고 판단한다(짧은 교차는 오탐일 수 있다) */
const PROHIBITED_MIN_OVERLAP_M = 15;
/** 금지 구간 겹침 판정에 쓰는 샘플링 간격 — 하드 게이트라 다른 지표(80m)보다 촘촘하게 본다 */
const PROHIBITED_SAMPLE_INTERVAL_M = 15;

interface OverpassNode {
  type: 'node';
  lat: number;
  lon: number;
  tags?: Record<string, string>;
}
interface OverpassWay {
  type: 'way';
  geometry?: { lat: number; lon: number }[];
  tags?: Record<string, string>;
}
interface OverpassRelation {
  type: 'relation';
  tags?: Record<string, string>;
}
type OverpassElement = OverpassNode | OverpassWay | OverpassRelation;

export interface EnvironmentRatio {
  feature: 'PARK' | 'RIVERSIDE' | 'GREENERY' | 'URBAN';
  ratio: number;
}

export interface CourseCharacteristics {
  environmentRatios: EnvironmentRatio[];
  trafficLightCount: number | null;
  stairCount: number | null;
  /** 표시된 횡단보도 없이 도로를 가로지르는 것으로 보이는 급회전 지점 개수(2026-09-16 추가) */
  unmatchedCrossingCount: number | null;
  /**
   * 전체 거리 중 실제 sidewalk 태그(yes/both/left/right/separate)로 보도가 확인된 구간
   * 비율(0~1). graphhopper.ts의 GOOD_ROAD_CLASSES는 도로 위계로 "보도가 있을 것 같다"고
   * 추정만 하는 값이라, 이 값이 그 추정의 실제 근거가 있는지 보여준다(2026-09-16, "확인된
   * 속성과 추정 근거를 구분하라" 피드백 이후 추가). sidewalk 태그가 없다고 보도가 없다는
   * 뜻은 아니다 — OSM에 그 속성이 아직 안 채워졌을 뿐인 "정보 부족"일 수 있다. 지금은
   * 하드 필터로 쓰지 않고 검증용 지표로만 노출한다. 조회 자체가 실패하면(다른 필드와
   * 같은 원칙) null — "0"이 아니라 "확인 불가"다.
   */
  confirmedSidewalkRatio: number | null;
  /**
   * 이 경로가 확인된 보행 금지(foot=no) 또는 통제구역(access=no/private) 구간을 실제로
   * 지나가는 것으로 보이면 true(2026-09-16, "보행 금지 구간이 다른 선호 점수로 상쇄되지
   * 않게 하라" 피드백 이후 추가) — index.ts가 이 값이 true인 후보는 다른 점수와 무관하게
   * 무조건 제외한다(badRoadRatio/unmatchedCrossingCount처럼 "전부 걸러지면 필터 없이
   * 통과"하는 예외를 두지 않는다). 조회 실패 시 null — "안전하다"가 아니라 "확인 불가"다.
   */
  hasConfirmedProhibitedSegment: boolean | null;
}

export interface GoodWaypoint {
  lat: number;
  lng: number;
}

/** "좋은 길"로 인정하는 보행/자전거 전용 길 태그 — 일반 차도는 제외한다 */
const GOOD_WAY_HIGHWAY_TYPES = ['footway', 'path', 'cycleway', 'pedestrian'];
/** 강·호수 데이터는 실제 산책로와 몇 미터씩 떨어져 있는 경우가 흔해서 여유를 둔다 */
const NEAR_WATER_RADIUS_M = 35;
/** 공원 경계 폴리곤 바로 안쪽/근처 길까지 인정한다 */
const NEAR_PARK_RADIUS_M = 15;
/** 좋은 길 위 후보 지점을 뽑는 간격 — 너무 촘촘하면 경유지 탐색이 무의미해진다 */
const WAYPOINT_SAMPLE_INTERVAL_M = 100;

function bboxToQueryString(bbox: BoundingBox): string {
  return `${bbox.south},${bbox.west},${bbox.north},${bbox.east}`;
}

/**
 * 신호등·계단·환경특성이 항상 "확인 불가"로 뜨는 문제(2026-09-17)를 조사해보니, 필터
 * 15개를 하나로 합친 쿼리를 mail.ru 미러가 처리 못 해서 항상(3후보 × 15초 타임아웃 =
 * 45초) 실패하고 있었다. 실측: 같은 미러에 필터 8개(인프라)·7개(환경) 쿼리를 "병렬로"
 * 나눠 보내니 3.4초 만에 둘 다 성공(236개+47개=283개, 통짜 쿼리로 로컬에서 받은 것과
 * 정확히 같은 총량) — 미러 자체가 아니라 쿼리 하나의 크기가 문제였다. 둘 중 하나라도
 * 실패하면(원칙대로) 전체를 null로 남긴다 — 절반만 있는 데이터로 환경특성 비율 등을
 * 잘못 계산(예: 조회 실패를 "그런 요소 없음"으로 오인)하지 않기 위해서다.
 */
async function runOverpassQuery(query: string, label: string): Promise<OverpassElement[] | null> {
  const startedAt = Date.now();
  try {
    const response = await fetchWithRetry(
      OVERPASS_URL,
      { method: 'POST', headers: OVERPASS_HEADERS, body: query },
      OVERPASS_TIMEOUT_MS,
      OVERPASS_RETRIES,
    );
    const elapsedMs = Date.now() - startedAt;
    if (!response.ok) {
      console.error(`[overpass] ${label} 요청 실패(재시도 후에도)`, response.status, elapsedMs, 'ms', await response.text());
      return null;
    }
    const data = await response.json();
    console.log(`[overpass] ${label} 요청 성공`, elapsedMs, 'ms', data.elements?.length ?? 0, '개 요소');
    return data.elements ?? [];
  } catch (e) {
    console.error(`[overpass] ${label} 네트워크 오류(타임아웃 포함)`, Date.now() - startedAt, 'ms', e);
    return null;
  }
}

async function queryOverpass(bbox: BoundingBox): Promise<OverpassElement[] | null> {
  const bboxStr = bboxToQueryString(bbox);
  const infraQuery = `
    [out:json][timeout:25];
    (
      node["highway"="traffic_signals"](${bboxStr});
      node["crossing"="traffic_signals"](${bboxStr});
      node["crossing:signals"="yes"](${bboxStr});
      node["highway"="crossing"](${bboxStr});
      way["highway"="steps"](${bboxStr});
      way["sidewalk"~"^(yes|both|left|right|separate)$"](${bboxStr});
      way["foot"="no"](${bboxStr});
      way["access"~"^(no|private)$"](${bboxStr});
    );
    out geom;
  `;
  const environmentQuery = `
    [out:json][timeout:25];
    (
      way["leisure"="park"](${bboxStr});
      way["natural"="water"](${bboxStr});
      way["waterway"="river"](${bboxStr});
      way["waterway"="stream"](${bboxStr});
      way["landuse"="forest"](${bboxStr});
      way["natural"="wood"](${bboxStr});
      way["leisure"="garden"](${bboxStr});
    );
    out geom;
  `;

  const [infra, environment] = await Promise.all([
    runOverpassQuery(infraQuery, '인프라(8필터)'),
    runOverpassQuery(environmentQuery, '환경(7필터)'),
  ]);
  if (infra === null || environment === null) return null;
  return [...infra, ...environment];
}

function wayLine(way: OverpassWay): { lng: number; lat: number }[] {
  return (way.geometry ?? []).map((p) => ({ lng: p.lon, lat: p.lat }));
}

/**
 * 출발지 근처의 "좋은 길"(공원 안 또는 강변의 보행/자전거 전용 길) 위 지점들을, 실제
 * 하나로 이어진 길(way) 단위로 묶어서 찾는다. GraphHopper의 round_trip은 어디를 지나는지
 * 전혀 신경 쓰지 않는 임의 순환 경로를 만드는데, 러너 친화적인 길을 실제로 지나가게
 * 하려면 이런 지점을 경유지로 넘겨야 한다(routeBuilder.ts).
 *
 * 서로 다른 3방향에 점을 하나씩 찍는 대신 way 단위로 묶어서 돌려주는 이유(2026-09-15,
 * "아파트 단지를 가로지른다" 피드백 이후): 경유지 사이 구간은 GraphHopper가 그냥
 * 최단경로로 잇기 때문에, 서로 다른 산책로 위의 점 3개를 찍으면 그 사이를 잇는 구간이
 * 아파트 단지 내부 도로처럼 임의의 최단경로가 될 수 있다. 반면 "같은 way 위의 두 지점"을
 * 골라 그 사이를 잇게 하면, 그 구간의 최단경로가 곧 그 길 자체가 될 가능성이 높다
 * (routeBuilder.ts가 이 묶음 정보를 그렇게 활용한다).
 *
 * 근처에 해당하는 길이 없으면 빈 배열을 돌려주고, 호출한 쪽이 round_trip 방식으로 폴백한다.
 *
 * 두 가지를 실제 데이터로 확인하고 반영했다(2026-09-15 스파이크):
 * 1) 한강처럼 폭이 넓은 강은 OSM의 waterway=river 선이 강 "중심선"이라 실제 산책로와
 *    수백m씩 떨어져 있다 — 반면 그 강을 따라가는 공원(예: 뚝섬한강공원)은 leisure=park로
 *    잘 매핑돼 있고 산책로가 대부분 그 폴리곤 경계 15m 안쪽에 있어서, 공원 기준 검색이
 *    강 기준 검색보다 훨씬 안정적이다. 강 기준 검색은 폭이 좁은 하천(성내천 등)을 잡는
 *    보조 수단으로만 남겨둔다.
 * 2) Overpass의 around 필터는 대상이 way(선)일 때 매우 느려서(도로 등 큰 way 하나에도
 *    타임아웃) way를 그대로 못 쓰고, 반드시 node(w. ...)로 점 집합으로 바꾼 뒤에 around를
 *    걸어야 한다 — 그래야 공개 Overpass 서버에서도 몇 초 안에 응답이 온다.
 *
 * 3) (2026-09-16, "자전거 도로 위주로 확인해달라" 요청 이후 추가) 안양천처럼 하천 자체가
 *    river로 태깅된 경우 위 1)의 "강 중심선이 멀리 떨어져 있다" 문제가 똑같이 발생하는데,
 *    한강과 달리 그 하천 산책로 전체가 leisure=park 폴리곤으로 매핑돼 있지도 않아서(공원
 *    보조 수단도 못 씀), 물/공원 근처 조건만으로는 자전거도로를 아예 못 찾는 사각지대가
 *    있었다. highway=cycleway는 그 자체로 이미 "차량과 분리된 러너 친화적인 길"이라는
 *    판단 근거가 충분해서(graphhopper.ts의 GOOD_ROAD_CLASSES와 같은 기준), 물/공원 근접
 *    조건 없이 검색 범위 안의 모든 cycleway를 별도로 추가한다. 단, 안양천 자전거길처럼
 *    foot=no(보행자 통행 금지)로 태깅된 자전거 전용 구간은 러너용 "좋은 길"이 아니므로
 *    모든 clause에서 제외한다(태그가 아예 없는 길은 그대로 포함— 명시적으로 금지된
 *    경우만 걸러낸다는 원칙).
 *
 * 4) (2026-09-16, "둘레길도 마저 반영해달라" 요청 이후 추가했다가 같은 날 되돌림)
 *    route=hiking relation의 멤버 way들을 cycleway와 같은 방식으로 추가했었는데,
 *    relation 확장 비용 때문에 쿼리가 무거워져서 무료 Overpass 미러가 이 쿼리에서만
 *    504(타임아웃)를 냈다 — 그 결과 findGoodWaypoints 전체가 실패해서 잘 되던 한강공원
 *    기능까지 같이 깨졌다(잠원한강공원 실측에서 발견). 신뢰성을 우선해 되돌렸다 — 다시
 *    넣으려면 반드시 별도의 독립된 쿼리로 분리해야 한다.
 */
export interface GoodWaypointsResult {
  groups: GoodWaypoint[][];
  /**
   * 강·하천에서 RIVER_PRIORITY_RADIUS_M 안에 있는 그룹들 — routeBuilder.ts가 "한강
   * 근처면 무조건 한강 길을 우선 시도하라"(2026-09-17 요청)는 데 쓴다. 참조(reference)로
   * 판별하므로 이 함수가 돌려준 groups 배열의 원소를 그대로 써야 매칭된다(필터링으로
   * 배열 원소 자체가 새로 복사되지만 않으면 된다).
   */
  riverAdjacentGroups: Set<GoodWaypoint[]>;
}

/**
 * 한강처럼 폭이 넓은 강은 실제 자전거길이 중심선에서 수백m 떨어져 있을 수 있어서
 * (overpass.ts 상단 주석의 1번 참고), 자전거길을 "근처 좋은 길"로 인정하는 기준(35m)보다
 * 훨씬 넉넉하게 잡는다 — 여기서는 포함 여부가 아니라 "우선순위"만 매기는 것이라, 넓게
 * 잡아도 엉뚱한 길까지 순환/왕복 경로로 강제하는 위험이 없다.
 */
const RIVER_PRIORITY_RADIUS_M = 400;

export async function findGoodWaypoints(
  originLat: number,
  originLng: number,
  searchRadiusM: number,
): Promise<GoodWaypointsResult> {
  const bbox = boundingBoxOf([[originLng, originLat, 0]], searchRadiusM);
  const bboxStr = bboxToQueryString(bbox);
  // foot=no(보행자 통행 금지로 명시된 자전거 전용 구간)와 access=no/private(사유지·통제
  // 구역)는 태그가 명시적으로 있을 때만 제외한다 — 태그 자체가 없는 길은 "보행 가능"이
  // 아니라 "정보 부족"이지만, 최소한 "명시적으로 금지"된 것만은 확실히 걸러낸다는 원칙
  // (2026-09-16, "보행 허용/금지/정보 부족을 구분하라" 피드백 이후 모든 절에 동일 적용
  // — 이전엔 cycleway 절에만 foot=no를 걸었고 access는 어디에도 안 걸었다).
  // Overpass에서 없는 태그는 항상 "!=" 부등식을 만족하는 것으로 취급된다.
  const accessAllowed = '["foot"!="no"]["access"!="no"]["access"!="private"]';
  const highwayFilter = `["highway"~"^(${GOOD_WAY_HIGHWAY_TYPES.join('|')})$"]${accessAllowed}`;
  // route=hiking(둘레길) relation 조회는 여기 있었다가 뺐다(2026-09-16, 잠원한강공원
  // 실측에서 발견): relation 확장 비용 때문에 쿼리가 무거워져서, 우리가 쓰는 무료 Overpass
  // 미러(maps.mail.ru)가 이 쿼리에서만 504(타임아웃)를 냈다 — 그 결과 findGoodWaypoints
  // 전체가 실패해서 물/공원/자전거길까지 다 같이 못 찾고 조용히 round_trip 폴백으로
  // 밀려났다. 검증도 안 된 기능 하나 때문에 이미 잘 검증된 한강공원 기능이 깨지는 건
  // 안 맞아서, 신뢰성을 우선해 되돌린다. 다시 넣는다면 반드시 별도의 독립된 쿼리로
  // 분리해서, 그게 실패해도 나머지에는 영향이 없게 해야 한다.
  // .waterways는 around 필터용으로만 쓰던 임시 집합이었는데, 그 지오메트리 자체도
  // out geom으로 같이 받아온다 — 이번에 추가한 "강 근처 길 우선순위" 판정에 쓴다
  // (2026-09-17, "한강 근처면 무조건 한강 길을 뛰게 하고 싶다" 요청 이후 추가). relation
  // 확장이 없는 단순 geometry 출력이라 비용이 크지 않다(어제 route=hiking 추가로 겪은
  // 타임아웃 문제와는 다른 종류다).
  const query = `
    [out:json][timeout:25];
    (
      way["waterway"~"^(river|stream)$"](${bboxStr});
      way["natural"="water"](${bboxStr});
    ) -> .waterways;
    .waterways out geom;
    node(w.waterways) -> .waterway_nodes;
    way["leisure"="park"](${bboxStr}) -> .parks;
    (
      way(around.waterway_nodes:${NEAR_WATER_RADIUS_M})(${bboxStr})${highwayFilter};
      way(around.parks:${NEAR_PARK_RADIUS_M})(${bboxStr})${highwayFilter};
      way["highway"="cycleway"]${accessAllowed}(${bboxStr});
    );
    out geom;
  `;

  try {
    const response = await fetchWithRetry(
      OVERPASS_URL,
      { method: 'POST', headers: OVERPASS_HEADERS, body: query },
      OVERPASS_TIMEOUT_MS,
      OVERPASS_RETRIES,
    );
    if (!response.ok) {
      console.error('[overpass] 좋은 길 조회 실패(재시도 후에도)', response.status, await response.text());
      return { groups: [], riverAdjacentGroups: new Set() };
    }
    const data = await response.json();
    const elements: OverpassElement[] = data.elements ?? [];
    // .waterways out geom으로 같이 받아온 강·하천 way — highway 태그가 없는 것으로 구분한다.
    const waterwayWays: OverpassWay[] = elements.filter(
      (e): e is OverpassWay => e.type === 'way' && (!!e.tags?.waterway || e.tags?.natural === 'water'),
    );
    const ways: OverpassWay[] = elements.filter((e): e is OverpassWay => e.type === 'way' && !!e.tags?.highway);

    // way(=실제 하나로 이어진 산책로)별로 점을 묶어서 돌려준다 — 같은 way 안의 점들은
    // 순서대로 그 길을 따라 나열돼 있어서, routeBuilder.ts가 "같은 길 위의 두 지점"을
    // 골라 그 사이를 잇게 할 수 있다(그래야 최단경로가 실제로 그 길을 따라간다).
    //
    // 같은 이름의 way 조각(예: "한강남자전거길"이 교차로·출입구마다 여러 way로 쪼개진
    // 경우)은 먼저 stitchPath로 하나로 이어붙인 뒤 묶는다(2026-09-16, 잠원한강공원
    // 실측에서 발견 — 조각 하나하나가 짧아서 왕복 거리를 그 조각 하나에서밖에 못
    // 잡았다). 이름이 없거나 못 이으면(실제로 연속이 아니거나 데이터가 안 맞으면)
    // 원래대로 way 하나씩 따로 취급한다 — 지어내지 않는다는 원칙.
    const wayGroups: GoodWaypoint[][] = [];
    function addGroupFromLine(line: { lng: number; lat: number }[]) {
      if (line.length === 0) return;
      const coords: [number, number, number][] = line.map((p) => [p.lng, p.lat, 0]);
      const sampled = sampleLine(coords, WAYPOINT_SAMPLE_INTERVAL_M);
      if (sampled.length > 0) wayGroups.push(sampled);
    }

    const namedWays = new Map<string, OverpassWay[]>();
    const unnamedWays: OverpassWay[] = [];
    for (const way of ways) {
      const name = way.tags?.name;
      if (name) {
        const list = namedWays.get(name) ?? [];
        list.push(way);
        namedWays.set(name, list);
      } else {
        unnamedWays.push(way);
      }
    }

    for (const group of namedWays.values()) {
      if (group.length === 1) {
        addGroupFromLine(wayLine(group[0]));
        continue;
      }
      const stitched = stitchPath(group.map(wayLine));
      if (stitched) {
        addGroupFromLine(stitched);
      } else {
        for (const way of group) addGroupFromLine(wayLine(way));
      }
    }
    for (const way of unnamedWays) addGroupFromLine(wayLine(way));

    // 강·하천에서 RIVER_PRIORITY_RADIUS_M 안에 있는 그룹을 표시한다(2026-09-17, "한강
    // 근처면 무조건 한강 길을 우선 시도하라" 요청 이후 추가) — routeBuilder.ts가 이
    // 정보로 순환형·왕복형 후보 생성 시 우선순위를 준다. 강이 근처에 없으면(대부분의
    // 도심 지역) 빈 Set을 돌려준다 — 지어내지 않는다.
    const waterwayLines = waterwayWays.map(wayLine);
    const riverAdjacentGroups = new Set<GoodWaypoint[]>();
    if (waterwayLines.length > 0) {
      for (const group of wayGroups) {
        const isNear = group.some((p) => waterwayLines.some((line) => distancePointToLine(p, line) <= RIVER_PRIORITY_RADIUS_M));
        if (isNear) riverAdjacentGroups.add(group);
      }
    }

    return { groups: wayGroups, riverAdjacentGroups };
  } catch (e) {
    console.error('[overpass] 좋은 길 조회 네트워크 오류(타임아웃 포함)', e);
    return { groups: [], riverAdjacentGroups: new Set() };
  }
}

/** 이 정도는 돼야 "둘레를 도는" 코스로 의미가 있다 — 너무 작은 공원(어린이공원 등)까지 잡지 않는다 */
const MIN_PARK_PERIMETER_M = 800;
/** 원점+3점+원점 = 5개, GraphHopper 무료 플랜의 "Max Locations: 5" 한도에 정확히 맞춘다 */
const PARK_WAYPOINT_COUNT = 3;

export interface ParkPerimeterResult {
  points: GoodWaypoint[];
  /** true면 안쪽에 못 들어가는 시설(선정릉 등) — routeBuilder.ts가 도로 등급 필터를 면제해준다 */
  feeYes: boolean;
}

/**
 * 출발지 근처의 큰 공원 경계를 도는 경유지 3개를 찾는다(2026-09-16, "선정릉처럼 공원
 * 자체가 아니라 담장 바깥 공공도로를 도는 코스도 반영해달라" 요청 이후 추가, 이후 "무료
 * 공원까지 확장해달라" 요청으로 fee=yes 제한을 없앰). 선정릉처럼 fee=yes인 곳은 내부에
 * 일반인이 다니는 보행 네트워크가 없어서(있어도 유료 구역), 경계 위 세 점을 GraphHopper에
 * 순서대로 넘기면 그 사이 최단경로가 안쪽을 가로지르지 못하고 자연스럽게 바깥 도로(담장
 * 옆 인도)를 따라가게 된다. 무료 공원은 내부에 진짜 보행로가 있을 수 있어서 GraphHopper가
 * 오히려 내부 산책로를 골라줄 수도 있는데, 그것도 나쁘지 않다 — 어느 쪽이든 이 3점을
 * 지나는 실제 경로가 나오고, fee=no일 때는 도로 등급 필터(passesRoadQuality)를 그대로
 * 적용해서 "내부 산책로도 아니고 바깥도 나쁜 길"인 경우는 걸러낸다.
 *
 * 이런 큰 공원은 OSM에서 relation(멀티폴리곤)으로 저장되고, 그 경계가 여러 way로
 * 쪼개져 있는 경우가 많아(실측: 선정릉도 4개 way) stitchRing으로 하나의 고리로
 * 이어붙인 뒤 균등 간격으로 점을 뽑는다 — 못 이으면(데이터가 안 맞으면) null을 돌려주고
 * 호출한 쪽이 이 후보 없이 진행한다(지어내지 않는다는 원칙).
 */
export async function findParkPerimeterWaypoints(
  originLat: number,
  originLng: number,
  searchRadiusM: number,
): Promise<ParkPerimeterResult | null> {
  const bbox = boundingBoxOf([[originLng, originLat, 0]], searchRadiusM);
  const bboxStr = bboxToQueryString(bbox);
  const query = `
    [out:json][timeout:25];
    relation["leisure"="park"](${bboxStr}) -> .parks;
    .parks out tags;
    way(r.parks);
    out geom;
  `;

  try {
    const response = await fetchWithRetry(OVERPASS_URL, { method: 'POST', headers: OVERPASS_HEADERS, body: query }, OVERPASS_TIMEOUT_MS, OVERPASS_RETRIES);
    if (!response.ok) {
      console.error('[overpass] 공원 경계 조회 실패(재시도 후에도)', response.status, await response.text());
      return null;
    }
    const data = await response.json();
    const elements: OverpassElement[] = data.elements ?? [];
    const relations = elements.filter((e): e is OverpassRelation => e.type === 'relation');
    const ways: OverpassWay[] = elements.filter((e): e is OverpassWay => e.type === 'way');
    if (relations.length === 0 || ways.length === 0) return null;

    // 여러 공원이 한 번에 잡히면(드물다) 첫 번째 것만 쓴다 — 여러 개를 정확히 구분해
    // 묶으려면 각 way가 어느 relation 소속인지 추가 조회가 필요해서, 이번에는 가장 흔한
    // "근처에 하나" 상황만 다룬다.
    const feeYes = relations[0].tags?.fee === 'yes';
    const lines = ways.map(wayLine);
    const ring = stitchRing(lines);
    if (!ring) return null;

    let perimeterM = 0;
    for (let i = 0; i < ring.length - 1; i++) {
      perimeterM += distanceMeters(ring[i].lng, ring[i].lat, ring[i + 1].lng, ring[i + 1].lat);
    }
    if (perimeterM < MIN_PARK_PERIMETER_M) return null;

    const points = sampleRingPoints(ring, PARK_WAYPOINT_COUNT);
    return points.length === PARK_WAYPOINT_COUNT ? { points, feeYes } : null;
  } catch (e) {
    console.error('[overpass] 공원 경계 조회 네트워크 오류(타임아웃 포함)', e);
    return null;
  }
}

/**
 * 여러 후보 경로의 특성을 조회한다. 한 번에 합쳐서 조회하는 방법도 시도해봤는데
 * (2026-09-15), 후보들이 서로 다른 방향으로 나 있어서 bbox를 합치면 범위가 몇 배로
 * 커져서 무료 Overpass 미러가 아예 타임아웃(504)나 버렸다 — 데이터를 못 받는 것보다는
 * 후보마다 따로, 순서대로 조회하는 게(느려도 확실히 데이터가 온다) 낫다고 판단해서
 * 되돌렸다. 동시 요청은 서버가 못 받아줘서(실측: 3개 동시 중 2개 실패) 반드시 순서대로.
 */
export interface RouteForCharacteristics {
  coordinates: [number, number, number][];
  /** 왕복형의 반환점 — 있으면 그 지점 근처의 급회전은 "도로 횡단"으로 오인하지 않는다 */
  turnaroundPoint?: { lng: number; lat: number };
}

export async function fetchCourseCharacteristicsForRoutes(routes: RouteForCharacteristics[]): Promise<CourseCharacteristics[]> {
  const list: CourseCharacteristics[] = [];
  for (const { coordinates, turnaroundPoint } of routes) {
    const bbox = boundingBoxOf(coordinates, NEAR_ROUTE_RADIUS_M + 20);
    const elements = await queryOverpass(bbox);
    if (elements === null) {
      // 조회 실패 — 없는 데이터를 지어내지 않고 전부 "확인 불가"로 남긴다.
      list.push({
        environmentRatios: [],
        trafficLightCount: null,
        stairCount: null,
        unmatchedCrossingCount: null,
        confirmedSidewalkRatio: null,
        hasConfirmedProhibitedSegment: null,
      });
    } else {
      list.push(computeCharacteristics(coordinates, elements, turnaroundPoint));
    }
  }
  return list;
}

function computeCharacteristics(
  coordinates: [number, number, number][],
  elements: OverpassElement[],
  turnaroundPoint?: { lng: number; lat: number },
): CourseCharacteristics {
  const routeLine = coordinates.map(([lng, lat]) => ({ lng, lat }));
  const samples = sampleLine(coordinates, SAMPLE_INTERVAL_M);

  const parkWays = elements.filter((e): e is OverpassWay => e.type === 'way' && e.tags?.leisure === 'park');
  const waterWays = elements.filter(
    (e): e is OverpassWay => e.type === 'way' && (e.tags?.natural === 'water' || e.tags?.waterway === 'river' || e.tags?.waterway === 'stream'),
  );
  const greeneryWays = elements.filter(
    (e): e is OverpassWay =>
      e.type === 'way' && (e.tags?.landuse === 'forest' || e.tags?.natural === 'wood' || e.tags?.leisure === 'garden'),
  );
  const stepsWays = elements.filter((e): e is OverpassWay => e.type === 'way' && e.tags?.highway === 'steps');
  const sidewalkWays = elements.filter(
    (e): e is OverpassWay => e.type === 'way' && ['yes', 'both', 'left', 'right', 'separate'].includes(e.tags?.sidewalk ?? ''),
  );
  const prohibitedWays = elements.filter(
    (e): e is OverpassWay =>
      e.type === 'way' && (e.tags?.foot === 'no' || e.tags?.access === 'no' || e.tags?.access === 'private'),
  );
  // 차량 교차로 신호(highway=traffic_signals)와 별개로, 횡단보도 신호(crossing=traffic_signals /
  // crossing:signals=yes)도 러너 입장에서는 똑같이 "신호 대기"라 둘 다 센다.
  const trafficSignalNodes = elements.filter(
    (e): e is OverpassNode =>
      e.type === 'node' &&
      (e.tags?.highway === 'traffic_signals' || e.tags?.crossing === 'traffic_signals' || e.tags?.['crossing:signals'] === 'yes'),
  );
  // 신호 유무와 무관하게 "표시된 횡단보도"로 인정하는 전체 집합 — 급회전 지점이 실제
  // 횡단보도 근처에서 일어나는지 대조하는 데 쓴다(trafficSignalNodes보다 넓은 범위).
  const crossingNodes = elements.filter((e): e is OverpassNode => e.type === 'node' && e.tags?.highway === 'crossing');

  function ratioNear(ways: OverpassWay[]): number {
    if (samples.length === 0 || ways.length === 0) return 0;
    const lines = ways.map(wayLine);
    let matched = 0;
    for (const sample of samples) {
      const isNear = lines.some((line) => distancePointToLine(sample, line) <= NEAR_ROUTE_RADIUS_M);
      if (isNear) matched++;
    }
    return matched / samples.length;
  }

  const parkRatio = ratioNear(parkWays);
  const riversideRatio = ratioNear(waterWays);
  const greeneryRatio = ratioNear(greeneryWays);
  const confirmedSidewalkRatio = ratioNear(sidewalkWays);

  // "도심" 판정은 별도 OSM 태그가 없어서, 자연 요소(공원·하천·녹지) 중 어디에도
  // 가깝지 않은 구간의 비율로 근사한다 — 데이터가 없는 걸 지어내는 게 아니라
  // 있는 데이터(자연 요소 부재)로부터 도출한 값이라는 점에서 원칙에 어긋나지 않는다.
  const naturalLines = [...parkWays, ...waterWays, ...greeneryWays].map(wayLine);
  const urbanMatches = samples.filter(
    (sample) => !naturalLines.some((line) => distancePointToLine(sample, line) <= NEAR_ROUTE_RADIUS_M),
  ).length;
  const urbanRatio = samples.length > 0 ? urbanMatches / samples.length : 0;

  const trafficLightCount = trafficSignalNodes.filter(
    (node) => distancePointToLine({ lng: node.lon, lat: node.lat }, routeLine) <= TRAFFIC_SIGNAL_RADIUS_M,
  ).length;

  const stairCount = stepsWays.filter((way) => {
    const line = wayLine(way);
    return line.some((point) => distancePointToLine(point, routeLine) <= STEPS_RADIUS_M);
  }).length;

  // 경로가 급하게 방향을 트는 지점 = 다른 도로를 가로지르는 지점일 가능성이 높다.
  // 그 지점 근처(CROSSING_MATCH_RADIUS_M 안)에 실제 OSM 횡단보도가 하나도 없으면
  // "표시된 횡단보도 없이 도로를 건넌다"고 판단한다(2026-09-16 피드백 이후 추가).
  const turnPoints = findSharpTurnPoints(
    coordinates,
    undefined,
    undefined,
    turnaroundPoint ? { point: turnaroundPoint, radiusM: CROSSING_MATCH_RADIUS_M } : undefined,
  );
  const unmatchedCrossingCount = turnPoints.filter(
    (point) => !crossingNodes.some((node) => distancePointToLine(point, [{ lng: node.lon, lat: node.lat }]) <= CROSSING_MATCH_RADIUS_M),
  ).length;

  // 하드 게이트라 80m 간격 samples보다 촘촘하게(15m) 다시 표본을 뽑아서, 짧은 금지 구간도
  // 놓치지 않는다. 연속으로 겹치는 구간 길이를 누적해서, 순간적으로 스치는 오탐이 아니라
  // 실제로 "그 구간을 지나간다"고 볼 수 있을 때만(PROHIBITED_MIN_OVERLAP_M 이상) true로 본다.
  const prohibitedLines = prohibitedWays.map(wayLine);
  let hasConfirmedProhibitedSegment = false;
  if (prohibitedLines.length > 0) {
    const fineSamples = sampleLine(coordinates, PROHIBITED_SAMPLE_INTERVAL_M);
    let consecutiveOverlapM = 0;
    for (const sample of fineSamples) {
      const isNearProhibited = prohibitedLines.some((line) => distancePointToLine(sample, line) <= PROHIBITED_MATCH_RADIUS_M);
      if (isNearProhibited) {
        consecutiveOverlapM += PROHIBITED_SAMPLE_INTERVAL_M;
        if (consecutiveOverlapM >= PROHIBITED_MIN_OVERLAP_M) {
          hasConfirmedProhibitedSegment = true;
          break;
        }
      } else {
        consecutiveOverlapM = 0;
      }
    }
  }

  return {
    environmentRatios: [
      { feature: 'PARK', ratio: parkRatio },
      { feature: 'RIVERSIDE', ratio: riversideRatio },
      { feature: 'GREENERY', ratio: greeneryRatio },
      { feature: 'URBAN', ratio: urbanRatio },
    ],
    trafficLightCount,
    stairCount,
    unmatchedCrossingCount,
    confirmedSidewalkRatio,
    hasConfirmedProhibitedSegment,
  };
}
