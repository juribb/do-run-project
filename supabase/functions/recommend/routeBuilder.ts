/**
 * GraphHopper의 round_trip은 어디를 지나는지 전혀 신경 쓰지 않는 임의 순환 경로를 만든다
 * (내부 휴리스틱에만 의존). 러너 친화적인 길(공원·강변 산책로)을 실제로 지나가는 경로를
 * 만들기 위해, Overpass로 미리 찾아둔 "좋은 길" 위 지점들을 경유지로 삼아 GraphHopper에
 * 다중 경유지 라우팅을 요청한다.
 *
 * (2026-09-15, "아파트 단지를 가로지른다" 피드백 이후 재설계) 처음엔 서로 다른 3방향에
 * 점을 하나씩 찍었는데, 경유지 "사이" 구간은 GraphHopper가 그냥 최단경로로 잇기 때문에
 * 그 구간이 아파트 단지 내부 도로 같은 임의의 지름길이 될 수 있었다 — "좋은 길을 지난다"는
 * 보장이 경유지 그 지점에서만 성립하고 이동 구간에는 전혀 적용이 안 됐던 것.
 *
 * 지금은 같은 산책로(같은 way) 위에서 서로 멀리 떨어진 두 지점(진입점·이탈점)을 골라서
 * 그 사이를 잇게 한다 — 두 점이 같은 선형 경로 위에 있으니 그 구간의 최단경로가 곧
 * 그 산책로 자체일 가능성이 높다. 출발지↔진입점, 이탈점↔출발지 두 구간만 일반 도로
 * 최단경로로 남고, 나머지는 그 산책로를 따라가게 된다.
 *
 * (2026-09-16, "나침반 방향을 무작위로 찍지 말고, 먼저 동네에 뭐가 있는지 조사해서 그걸
 * 기준으로 경로를 짜라" 요청 이후 재설계) 이전엔 여기서 0/120/240도 세 방향에 "이상적인
 * 지점"을 찍고 그 근처에서 좋은 길을 찾았는데, 역삼1동처럼 방향이 어긋나면 실제로 가까이
 * 있는 좋은 길도 놓치는 문제가 있었다. 지금은 findGoodWaypoints가 찾아준 그룹들을 먼저
 * rankGroupsForLoop로 "이 목표 거리에 순환로를 만들기 좋은가"(그룹 길이·근접도) 기준으로
 * 랭킹매긴 뒤, 상위 그룹을 직접 타겟팅한다 — 방향을 추측하지 않고 실제로 있는 것부터
 * 본다는 원칙이다. 같은 이유로 선정릉 같은 "들어갈 수 없는 큰 공원"이나 무료 공원의
 * 둘레를 도는 tryParkPerimeter도 이 파일에 같이 있다(overpass.ts의
 * findParkPerimeterWaypoints 참고).
 *
 * (2026-09-16, "도심은 골목을 복잡하게 도는 대신 사각형이나 일자형처럼 단순한 모양이면
 * 좋겠다" 요청 이후 추가) tryRectangularLoop는 위 방식들과 성격이 다르다 — 공원·강변·
 * 자전거길이 하나도 없는 순수 도심에서는 rankGroupsForLoop가 타겟팅할 그룹 자체가 없어서
 * 이 방식만으로는 아무것도 못 만든다. tryRectangularLoop는 실제로 있는 길에 기대지
 * 않고, 목표 거리로 정사각형 네 꼭짓점을 계산해 GraphHopper에 넘긴다 — 서울 도심의
 * 격자형 도로망 특성상 실제 도로가 이 사각형에 가깝게 이어지는 경우가 많다. 이것도
 * 다른 후보들과 똑같이 badRoadRatio·거리 허용 오차 검증을 거친다.
 */
import { destinationPoint, distanceMeters } from './geometry.ts';
import { fetchViaPointRoute, type GraphHopperRoute } from './graphhopper.ts';
import { findGoodWaypoints, findParkPerimeterWaypoints, type GoodWaypoint } from './overpass.ts';

/**
 * (2026-09-17, "한강 근처면 무조건 한강 길을 뛰게 하고 싶다" 요청 이후 추가) 강 근처
 * 그룹(overpass.ts의 riverAdjacentGroups)이 있으면 순환형·왕복형 후보 생성 시 최우선으로
 * 시도한다 — 다만 거리 허용 오차·도로 품질 기준은 그대로 유지한다(사용자가 명시적으로
 * "거리·품질 기준은 유지"를 선택함). 우선순위는 후보 "생성 순서"뿐 아니라 index.ts의
 * 최종 정렬에도 반영해야 해서, GraphHopperRoute.isRiverPath로 표시해 끝까지 들고 간다.
 */

/** 목표 거리 대비 이 비율 안에 들어야 채택한다 — 벗어나면 반지름을 보정해 한 번 더 시도 */
const DISTANCE_TOLERANCE_RATIO = 0.2;
/**
 * 전체 거리 중 "안 좋은 길"(주거도로·서비스도로 등, graphhopper.ts의 GOOD_ROAD_CLASSES 참고)
 * 비율이 이 값을 넘으면 거리 조건을 만족해도 버린다(2026-09-16, "아파트 단지를 가로지른다"
 * 피드백 이후 추가). 진입점·이탈점 사이는 같은 산책로를 따라가지만 출발지↔진입점,
 * 이탈점↔출발지 구간은 여전히 일반 도로 최단경로라 이 구간이 나쁘면 걸러야 한다.
 * 값은 실측하며 조정할 잠정치다 — 너무 낮으면 좋은 후보까지 버려서 폴백(round_trip)으로
 * 밀려나고, 너무 높으면 원래 문제를 못 거른다.
 */
const BAD_ROAD_RATIO_THRESHOLD = 0.35;
/**
 * 순환 후보로 시도해볼 "좋은 길" 그룹 개수. FINAL_CANDIDATE_COUNT(index.ts)와 맞춰 3개로
 * 잡는다 — 그룹 하나당 GraphHopper를 최대 2번(거리 보정 재시도 포함) 부르기 때문에, 여기
 * 개수가 곧 API 호출량이다(실측: GraphHopper 무료 키가 하루 한도에 걸린 적이 있어서 꼭
 * 필요한 만큼만 돌린다).
 * (2026-09-16, "나침반 방향을 무작위로 찍지 말고 실제 있는 좋은 길 기준으로 골라라" 요청
 * 이후 재설계 — 이전엔 0/120/240도 세 방향에 점을 찍고 "그 근처에 좋은 길이 있으면 다행"
 * 이었는데, 역삼1동처럼 방향이 안 맞으면 실제로 가까이 있는 좋은 길도 놓쳤다. 지금은
 * rankGroupsForLoop가 실제로 발견된 그룹들을 "거리 적합도 + 근접도"로 랭킹매겨서 상위
 * LOOP_CANDIDATE_COUNT개를 직접 타겟팅한다.)
 */
const LOOP_CANDIDATE_COUNT = 3;
/** 좋은 길 탐색 범위 — 목표 거리의 둘레 반경보다 넉넉하게 잡아야 여러 그룹을 찾을 수 있다 */
const SEARCH_RADIUS_FACTOR = (1 / (2 * Math.PI)) * 1.5;
/**
 * 순환 경로를 못 만들 때(예: 한강공원처럼 길쭉한 산책로 하나뿐이라 서로 다른 방향에
 * 진입점을 잡을 수 없는 경우) 시도할 "왕복" 후보 그룹 개수. 가까운 산책로 그룹 순으로
 * 시도한다(2026-09-16, 한강공원 피드백: "순환형이 아니어도 갔던 길을 되돌아오는 게
 * 낫다" — 주거도로를 지나는 억지 순환보다 같은 좋은 길을 왕복하는 게 낫다).
 * 그룹 하나당 두 방향(상류·하류 등)을 다 시도하므로(2026-09-16, "한강 길 양쪽 방향
 * 코스의 특성을 알려달라" 요청 이후 추가), API 호출량은 이 값의 2배다 — 그래서 3에서
 * 2로 줄였다(순환형 후보 개수와 합쳐도 이전과 비슷한 수준을 유지하려는 목적).
 */
const OUT_AND_BACK_CANDIDATE_COUNT = 2;

interface LatLng {
  lat: number;
  lng: number;
}

interface EntryPoint {
  point: GoodWaypoint;
  group: GoodWaypoint[];
  groupIndex: number;
  distanceFromIdeal: number;
}

/** group 안에서 fromIndex부터 direction(+1/-1)으로 이동하며, 누적 거리가 targetM에 가장 가까운 인덱스를 찾는다 */
function walkAlongGroup(group: GoodWaypoint[], fromIndex: number, direction: 1 | -1, targetM: number): number {
  let index = fromIndex;
  let traveled = 0;
  while (true) {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= group.length) break;
    const step = distanceMeters(group[index].lng, group[index].lat, group[nextIndex].lng, group[nextIndex].lat);
    if (traveled + step > targetM) break;
    traveled += step;
    index = nextIndex;
  }
  return index;
}

/** 진입점과 같은 산책로 위에서 양쪽 방향(+1/-1)으로 목표 거리만큼 걸어간 지점을 각각 찾는다 */
function findBothExitPoints(entry: EntryPoint, remainingM: number): { forward: GoodWaypoint; backward: GoodWaypoint } {
  const { group, groupIndex } = entry;
  const forwardIndex = walkAlongGroup(group, groupIndex, 1, remainingM);
  const backwardIndex = walkAlongGroup(group, groupIndex, -1, remainingM);
  return { forward: group[forwardIndex], backward: group[backwardIndex] };
}

/**
 * 진입점과 같은 산책로 위에서, 출발지로부터 더 멀어지는 방향으로 목표 거리의 절반만큼
 * 떨어진 이탈점을 찾는다. 그 산책로가 짧아서 그만큼 못 가면 갈 수 있는 만큼만 간다.
 */
function findExitPoint(origin: LatLng, entry: EntryPoint, remainingM: number): GoodWaypoint {
  const { forward, backward } = findBothExitPoints(entry, remainingM);
  const forwardDistFromOrigin = distanceMeters(origin.lng, origin.lat, forward.lng, forward.lat);
  const backwardDistFromOrigin = distanceMeters(origin.lng, origin.lat, backward.lng, backward.lat);
  // 출발지에서 더 멀어지는 쪽을 고른다 — 안 그러면 진입점 쪽으로 되돌아가는 방향이 뽑힐 수 있다.
  return forwardDistFromOrigin >= backwardDistFromOrigin ? forward : backward;
}

/** index.ts의 round_trip 폴백에서도 같은 거리 허용 오차 기준을 쓰려고 export한다. */
export function isWithinTolerance(distanceM: number, targetDistanceM: number): boolean {
  const ratio = distanceM / targetDistanceM;
  return ratio >= 1 - DISTANCE_TOLERANCE_RATIO && ratio <= 1 + DISTANCE_TOLERANCE_RATIO;
}

/**
 * badRoadRatio 정보가 없으면(null) 판단할 근거가 없다는 뜻이라 그냥 통과시킨다 — 있으면
 * 임계값과 비교한다. index.ts의 round_trip 폴백에서도 같은 기준을 쓰려고 export한다.
 */
export function passesRoadQuality(route: GraphHopperRoute): boolean {
  return route.badRoadRatio === null || route.badRoadRatio <= BAD_ROAD_RATIO_THRESHOLD;
}

/** group 전체 길이(m) — 이 길이가 목표 거리의 절반보다 짧으면 반환점을 그만큼 못 잡는다 */
function groupLengthM(group: GoodWaypoint[]): number {
  let len = 0;
  for (let i = 0; i < group.length - 1; i++) len += distanceMeters(group[i].lng, group[i].lat, group[i + 1].lng, group[i + 1].lat);
  return len;
}

/**
 * 발견된 "좋은 길" 그룹들을 순환 후보로서의 적합도로 랭킹매긴다 — 방향을 무작위로
 * 추측하는 대신, 실제로 있는 것 중 이 목표 거리에 맞는 순환로를 만들기 좋은 것을 직접
 * 고른다. 두 가지를 본다: (1) 그룹 길이가 필요한 만큼(목표 거리 절반) 되는지 — 짧으면
 * 반환점을 목표만큼 못 잡아서 거리가 안 맞는 순환로가 나온다, (2) 출발지에서 가까운지 —
 * 멀면 접근 구간만으로 예산을 다 써버린다.
 */
function rankGroupsForLoop(
  origin: LatLng,
  groups: GoodWaypoint[][],
  targetDistanceM: number,
  riverAdjacentGroups: Set<GoodWaypoint[]>,
): NearestPointEntry[] {
  const halfTarget = targetDistanceM / 2;
  const scored = nearestPointPerGroup(origin, groups).map((entry) => {
    const remainingM = Math.max(0, halfTarget - entry.distanceFromOrigin);
    const lengthFit = remainingM === 0 ? 1 : Math.min(1, groupLengthM(entry.group) / remainingM);
    const proximityScore = 1 / (1 + entry.distanceFromOrigin / 300);
    return { entry, score: lengthFit * 0.7 + proximityScore * 0.3 };
  });
  // 강 근처 그룹을 무조건 먼저 채운다(개수순 정렬이 아니라 파티션) — "최우선"이라는
  // 요청을 점수 가산이 아니라 확실한 우선순위로 반영한다. 각 파티션 안에서는 기존 점수로
  // 정렬한다.
  const river = scored.filter((s) => riverAdjacentGroups.has(s.entry.group)).sort((a, b) => b.score - a.score);
  const rest = scored.filter((s) => !riverAdjacentGroups.has(s.entry.group)).sort((a, b) => b.score - a.score);
  return [...river, ...rest].slice(0, LOOP_CANDIDATE_COUNT).map(({ entry }) => entry);
}

/** entry/exit 중 출발지에서 가까운 쪽을 먼저 지나가도록 순서를 정해 반환한다 */
function orderByDistanceFromOrigin(origin: LatLng, a: GoodWaypoint, b: GoodWaypoint): [GoodWaypoint, GoodWaypoint] {
  const distA = distanceMeters(origin.lng, origin.lat, a.lng, a.lat);
  const distB = distanceMeters(origin.lng, origin.lat, b.lng, b.lat);
  return distA <= distB ? [a, b] : [b, a];
}

/**
 * entry가 속한 그룹 위에서 진입점(entry)과 이탈점을 잡아 순환 경로를 시도한다. entry는
 * rankGroupsForLoop가 이미 "이 그룹이 좋겠다"고 고른 결과라, 별도의 방향 탐색이 필요
 * 없다 — findExitPoint로 반환점만 잡으면 된다.
 */
async function tryGroupLoop(
  origin: LatLng,
  entry: NearestPointEntry,
  targetDistanceM: number,
  apiKeys: string[],
  isRiver: boolean,
): Promise<GraphHopperRoute | null> {
  const asEntryPoint: EntryPoint = {
    point: entry.point,
    group: entry.group,
    groupIndex: entry.groupIndex,
    distanceFromIdeal: entry.distanceFromOrigin,
  };
  const remainingM = Math.max(0, targetDistanceM / 2 - entry.distanceFromOrigin);
  const exitPoint = findExitPoint(origin, asEntryPoint, remainingM);
  const [first, second] = orderByDistanceFromOrigin(origin, entry.point, exitPoint);

  const route = await fetchViaPointRoute([origin, first, second, origin], apiKeys);
  if (!route) return null;
  if (isWithinTolerance(route.distanceM, targetDistanceM) && passesRoadQuality(route)) return { ...route, isRiverPath: isRiver };

  // 실측 거리 비율만큼 반환점까지의 거리를 보정해서 한 번만 더 시도한다.
  const adjustedRemainingM = Math.max(0, remainingM * (targetDistanceM / route.distanceM));
  const retryExit = findExitPoint(origin, asEntryPoint, adjustedRemainingM);
  const [retryFirst, retrySecond] = orderByDistanceFromOrigin(origin, entry.point, retryExit);

  const retryRoute = await fetchViaPointRoute([origin, retryFirst, retrySecond, origin], apiKeys);
  if (!retryRoute) return null;
  return isWithinTolerance(retryRoute.distanceM, targetDistanceM) && passesRoadQuality(retryRoute)
    ? { ...retryRoute, isRiverPath: isRiver }
    : null;
}

interface NearestPointEntry {
  group: GoodWaypoint[];
  groupIndex: number;
  point: GoodWaypoint;
  distanceFromOrigin: number;
}

/** 그룹(=산책로)마다 출발지에서 가장 가까운 지점 하나씩을 골라, 가까운 순으로 정렬한다 */
function nearestPointPerGroup(origin: LatLng, groups: GoodWaypoint[][]): NearestPointEntry[] {
  const entries: NearestPointEntry[] = [];
  for (const group of groups) {
    let best: { index: number; point: GoodWaypoint; distance: number } | null = null;
    for (let i = 0; i < group.length; i++) {
      const p = group[i];
      const d = distanceMeters(origin.lng, origin.lat, p.lng, p.lat);
      if (best === null || d < best.distance) best = { index: i, point: p, distance: d };
    }
    if (best) entries.push({ group, groupIndex: best.index, point: best.point, distanceFromOrigin: best.distance });
  }
  return entries.sort((a, b) => a.distanceFromOrigin - b.distanceFromOrigin);
}

/**
 * 왕복 경로 = 갔던 길 그대로 되돌아오는 경로. 실제로 왕복 경로를 요청하는 게 아니라,
 * 편도 경로 하나만 받아서 좌표를 그대로 뒤집어 붙인다 — 그래야 "정확히 같은 길"로
 * 돌아오는 게 보장된다(GraphHopper에 왕복을 그대로 요청하면 최단경로 특성상 갈 때와
 * 돌아올 때 다른 길을 고를 수 있다). 오르막/내리막은 왕복이니 서로 뒤바뀐다.
 * badRoadRatio는 편도와 완전히 같은 길을 두 번 지나는 것이므로 그대로 재사용한다.
 */
function mirrorOutAndBack(outbound: GraphHopperRoute): GraphHopperRoute {
  const returning = outbound.coordinates.slice(0, -1).reverse();
  const [turnLng, turnLat] = outbound.coordinates[outbound.coordinates.length - 1];
  return {
    coordinates: [...outbound.coordinates, ...returning],
    distanceM: outbound.distanceM * 2,
    ascentM: outbound.ascentM + outbound.descentM,
    descentM: outbound.descentM + outbound.ascentM,
    badRoadRatio: outbound.badRoadRatio,
    routeType: 'OUT_AND_BACK',
    turnaroundPoint: { lng: turnLng, lat: turnLat },
    isRiverPath: outbound.isRiverPath,
  };
}

/**
 * entry가 속한 산책로 위에서 지정한 방향으로 목표 거리 절반만큼 걸어가 왕복 경로를
 * 시도한다. 같은 산책로가 출발지 양쪽으로 뻗어 있으면(한강 자전거길처럼) 상류·하류
 * 양쪽을 각각 별도 후보로 시도한다(2026-09-16, "한강 길로 양쪽 방향 코스의 특성을
 * 알려달라" 요청 이후 추가 — 이전엔 findExitPoint가 "출발지에서 더 멀어지는 쪽" 한
 * 방향만 골랐는데, 그러면 반대쪽 방향은 아예 후보에 오르지 못했다).
 */
async function tryOutAndBack(
  origin: LatLng,
  entry: NearestPointEntry,
  targetDistanceM: number,
  apiKeys: string[],
  direction: 'forward' | 'backward',
  isRiver: boolean,
): Promise<GraphHopperRoute | null> {
  const legTargetM = targetDistanceM / 2;
  const remainingM = legTargetM - entry.distanceFromOrigin;
  // 진입점 자체가 이미 목표 거리 절반을 넘으면(산책로가 출발지에서 너무 멀면) 포기한다.
  if (remainingM <= 0) return null;

  const asEntryPoint: EntryPoint = {
    point: entry.point,
    group: entry.group,
    groupIndex: entry.groupIndex,
    distanceFromIdeal: entry.distanceFromOrigin,
  };
  const { forward, backward } = findBothExitPoints(asEntryPoint, remainingM);
  const turnaround = direction === 'forward' ? forward : backward;
  // 그 방향으로 더 갈 곳이 없으면(길의 끝이라 진입점과 같은 지점이 나오면) 의미 없는
  // 왕복이니 버린다.
  if (turnaround.lng === entry.point.lng && turnaround.lat === entry.point.lat) return null;

  const outboundRoute = await fetchViaPointRoute([origin, entry.point, turnaround], apiKeys);
  if (!outboundRoute) return null;

  const fullRoute = mirrorOutAndBack({ ...outboundRoute, isRiverPath: isRiver });
  return isWithinTolerance(fullRoute.distanceM, targetDistanceM) ? fullRoute : null;
}

/**
 * 순환 경로를 못 만들 때(예: 한강공원처럼 길쭉한 산책로 하나뿐이라 진입점·이탈점을
 * 서로 다른 방향에 잡을 수 없는 경우) 시도하는 왕복 경로 후보들. 가까운 산책로 순으로
 * 시도해서, 갔던 길을 그대로 되돌아오더라도 "좋은 길" 위에 계속 있게 한다. 산책로 하나당
 * 상류·하류(또는 동쪽·서쪽) 양쪽 방향을 각각 별도 후보로 시도한다.
 */
async function buildOutAndBackRoutes(
  origin: LatLng,
  groups: GoodWaypoint[][],
  targetDistanceM: number,
  apiKeys: string[],
  riverAdjacentGroups: Set<GoodWaypoint[]>,
): Promise<GraphHopperRoute[]> {
  const ranked = nearestPointPerGroup(origin, groups);
  // 순환형과 같은 이유로, 강 근처 그룹을 무조건 먼저 채운다.
  const river = ranked.filter((e) => riverAdjacentGroups.has(e.group));
  const rest = ranked.filter((e) => !riverAdjacentGroups.has(e.group));
  const candidates = [...river, ...rest].slice(0, OUT_AND_BACK_CANDIDATE_COUNT);
  const results = await Promise.all(
    candidates.flatMap((entry) => {
      const isRiver = riverAdjacentGroups.has(entry.group);
      return [
        tryOutAndBack(origin, entry, targetDistanceM, apiKeys, 'forward', isRiver),
        tryOutAndBack(origin, entry, targetDistanceM, apiKeys, 'backward', isRiver),
      ];
    }),
  );
  return results.filter((r): r is GraphHopperRoute => r !== null);
}

/**
 * 출발지 근처 큰 공원의 둘레를 도는 후보를 시도한다. overpass.ts가 찾아준 경계 위 3개
 * 점(원점+3점+원점=5개, GraphHopper 무료 플랜의 5개 제한에 맞춘 값)을 그대로 GraphHopper에
 * 순서대로 넘긴다 — 반지름 보정 재시도가 없다(공원 경계는 고정된 크기라 우리가 조절할
 * 수 있는 값이 아니다). 거리가 안 맞으면(그 공원 자체가 목표 거리보다 훨씬 크거나 작으면)
 * 그냥 버린다 — 지어내지 않는다는 원칙.
 *
 * fee=yes(선정릉처럼 안쪽에 못 들어가는 곳)일 때만 passesRoadQuality(badRoadRatio)를
 * 건너뛴다(2026-09-16, 선정릉 실측 후 추가): 담장 옆 인도가 OSM에 residential로 태깅돼
 * badRoadRatio가 0.67까지 나왔는데, 이건 "아파트 단지 내부 도로처럼 임의로 고른 나쁜 길"이
 * 아니라 — 공원이라는 물리적 장애물 때문에 그 길을 지나갈 수밖에 없는 구조다. 반면
 * fee=no인 무료 공원(2026-09-16, "무료 공원까지 확장해달라" 요청으로 추가)은 내부에 진짜
 * 보행로가 있을 수 있어서 GraphHopper가 안쪽 산책로를 골라줄 수도 있다 — 이 경우는 일반
 * 순환형과 다를 바 없는 실제 좋은 길이므로, 도로 등급 기준을 그대로 적용해 "안쪽도 아니고
 * 바깥도 나쁜 길"인 경우까지 통과시키지 않는다.
 */
async function tryParkPerimeter(origin: LatLng, targetDistanceM: number, apiKeys: string[]): Promise<GraphHopperRoute | null> {
  const searchRadiusM = targetDistanceM * SEARCH_RADIUS_FACTOR;
  const result = await findParkPerimeterWaypoints(origin.lat, origin.lng, searchRadiusM);
  if (!result) return null;

  const route = await fetchViaPointRoute([origin, ...result.points, origin], apiKeys);
  if (!route) return null;
  if (!isWithinTolerance(route.distanceM, targetDistanceM)) return null;
  return result.feeYes || passesRoadQuality(route) ? route : null;
}

/** 정사각형 한 변 = 목표 거리(둘레) / 4 */
const SQUARE_SIDE_FACTOR = 1 / 4;
/**
 * 정사각형 네 꼭짓점을 시도해볼 방향(도) — 서울 도심 도로망은 실제로는 정북 기준으로
 * 어느 정도씩 돌아가 있어서(강남대로·테헤란로 축 등), 방향을 하나만 시도하면 그 지역
 * 도로망과 안 맞아 거리·품질 필터에 다 걸릴 수 있다. 두 방향(0도, 45도)을 시도해서
 * 실제 도로망과 더 잘 맞는 쪽을 고른다.
 */
const SQUARE_ORIENTATIONS_DEG = [0, 45];

/**
 * 출발지를 한 꼭짓점 삼아 정사각형 모양 순환 경로를 시도한다(2026-09-16, "도심은 골목을
 * 복잡하게 도는 대신 사각형이나 일자형처럼 단순한 모양이면 좋겠다" 요청 이후 추가).
 * 지금까지의 순환형(rankGroupsForLoop)은 "실제로 있는 좋은 길"이 있어야만 성립하는데,
 * 공원·강변·자전거길이 하나도 없는 순수 도심(예: 오피스 밀집 지역)에서는 애초에 시도할
 * 그룹 자체가 없다. 반면 이 방식은 실제로 있는 길에 기대지 않고, 목표 거리로 정사각형
 * 네 꼭짓점을 계산해서 GraphHopper에 순서대로 넘긴다 — 서울 도심의 격자형 도로망 특성상
 * 실제 도로가 이 사각형에 가깝게 이어지는 경우가 많다. 결과가 실제로 좋은 길인지는
 * 다른 후보와 똑같이 badRoadRatio·거리 허용 오차로 검증한다 — "사각형이니까 무조건
 * 통과"시키지 않는다.
 */
async function tryRectangularLoop(origin: LatLng, targetDistanceM: number, apiKeys: string[]): Promise<GraphHopperRoute[]> {
  const side = targetDistanceM * SQUARE_SIDE_FACTOR;
  const attempts = SQUARE_ORIENTATIONS_DEG.map(async (bearingDeg) => {
    const c2 = destinationPoint(origin.lat, origin.lng, bearingDeg, side);
    const c3 = destinationPoint(c2.lat, c2.lng, bearingDeg + 90, side);
    const c4 = destinationPoint(c3.lat, c3.lng, bearingDeg + 180, side);
    const route = await fetchViaPointRoute([origin, c2, c3, c4, origin], apiKeys);
    if (!route) return null;
    return isWithinTolerance(route.distanceM, targetDistanceM) && passesRoadQuality(route) ? route : null;
  });
  const results = await Promise.all(attempts);
  return results.filter((r): r is GraphHopperRoute => r !== null);
}

/**
 * 출발지 근처의 "좋은 길"을 지나는 경로 후보들을 만든다. 순환형과 왕복형을 동시에
 * 시도해서 둘 다 후보 풀에 넣는다 — 어느 한쪽을 강제로 우선하지 않는다(2026-09-16,
 * "순환형을 강제하지 마, 왕복형도 정상적인 추천 결과로 허용해달라" 피드백 이후 변경.
 * 이전에는 순환형이 하나라도 나오면 왕복형은 아예 시도조차 안 했는데, 그러면 "골목을
 * 돌아 억지로 만든 순환형"이 "단순한 왕복형"보다 항상 우선시되는 구조적 문제가 있었다).
 * 최종 선택은 index.ts의 급회전 수 기준 정렬이 맡는다 — 왕복형의 반환점은 급회전으로
 * 안 세므로(geometry.ts) 공정하게 비교된다. 근처에 좋은 길이 아예 없으면 빈 배열을
 * 돌려주고, 호출한 쪽이 round_trip 방식으로 폴백한다.
 */
export async function buildWaypointBasedRoutes(
  originLat: number,
  originLng: number,
  targetDistanceM: number,
  apiKeys: string[],
): Promise<GraphHopperRoute[]> {
  const origin: LatLng = { lat: originLat, lng: originLng };
  const searchRadiusM = targetDistanceM * SEARCH_RADIUS_FACTOR;

  const [waypointsResult, parkPerimeterRoute, rectangularRoutes] = await Promise.all([
    findGoodWaypoints(originLat, originLng, searchRadiusM),
    tryParkPerimeter(origin, targetDistanceM, apiKeys),
    tryRectangularLoop(origin, targetDistanceM, apiKeys),
  ]);
  const { groups: allGroups, riverAdjacentGroups } = waypointsResult;
  const parkPerimeterRoutes = parkPerimeterRoute ? [parkPerimeterRoute] : [];

  // 점이 1개뿐인 way는 진입점·이탈점을 다르게 잡을 수 없어서 제외한다. filter는 배열
  // 원소(참조)를 그대로 유지하므로 riverAdjacentGroups의 Set 멤버십은 안 깨진다.
  const goodWayGroups = allGroups.filter((group) => group.length >= 2);
  if (goodWayGroups.length === 0) return [...parkPerimeterRoutes, ...rectangularRoutes];

  const rankedEntries = rankGroupsForLoop(origin, goodWayGroups, targetDistanceM, riverAdjacentGroups);

  const [loopResults, outAndBackRoutes] = await Promise.all([
    Promise.all(
      rankedEntries.map((entry) => tryGroupLoop(origin, entry, targetDistanceM, apiKeys, riverAdjacentGroups.has(entry.group))),
    ),
    buildOutAndBackRoutes(origin, goodWayGroups, targetDistanceM, apiKeys, riverAdjacentGroups),
  ]);
  const loopRoutes = loopResults.filter((r): r is GraphHopperRoute => r !== null);

  return [...loopRoutes, ...outAndBackRoutes, ...parkPerimeterRoutes, ...rectangularRoutes];
}
