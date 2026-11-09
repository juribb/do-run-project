/**
 * 작은 지역(수 km 이내) 안에서만 쓰는 근사 거리 계산.
 * 위경도를 평면 좌표로 살짝 투영해서 계산한다 — 이 정도 규모에서는 오차가 무시할 만하다.
 */

const EARTH_RADIUS_M = 6371000;

/** [lng, lat] 좌표를 기준점(refLat) 근처의 평면 미터 좌표로 변환 */
function toLocalXY(lng: number, lat: number, refLat: number): [number, number] {
  const x = ((lng * Math.PI) / 180) * EARTH_RADIUS_M * Math.cos((refLat * Math.PI) / 180);
  const y = ((lat * Math.PI) / 180) * EARTH_RADIUS_M;
  return [x, y];
}

/** 두 지점 사이 거리(미터) */
export function distanceMeters(lng1: number, lat1: number, lng2: number, lat2: number): number {
  const refLat = (lat1 + lat2) / 2;
  const [x1, y1] = toLocalXY(lng1, lat1, refLat);
  const [x2, y2] = toLocalXY(lng2, lat2, refLat);
  return Math.hypot(x2 - x1, y2 - y1);
}

/** 점 하나와 선분 하나 사이 최단 거리(미터) */
function distancePointToSegment(
  p: [number, number],
  a: [number, number],
  b: [number, number],
): number {
  const [px, py] = p;
  const [ax, ay] = a;
  const [bx, by] = b;
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  let t = lengthSq === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / lengthSq;
  t = Math.max(0, Math.min(1, t));
  const closestX = ax + t * dx;
  const closestY = ay + t * dy;
  return Math.hypot(px - closestX, py - closestY);
}

/**
 * 점 하나와 [lng, lat] 좌표들로 이뤄진 선(도로·경로 등) 사이 최단 거리(미터).
 * line이 점 하나뿐이면(교차로 등) 점-점 거리로 처리한다.
 */
export function distancePointToLine(
  point: { lng: number; lat: number },
  line: { lng: number; lat: number }[],
): number {
  if (line.length === 0) return Infinity;
  const refLat = point.lat;
  const p = toLocalXY(point.lng, point.lat, refLat);
  if (line.length === 1) {
    const a = toLocalXY(line[0].lng, line[0].lat, refLat);
    return Math.hypot(p[0] - a[0], p[1] - a[1]);
  }
  let min = Infinity;
  for (let i = 0; i < line.length - 1; i++) {
    const a = toLocalXY(line[i].lng, line[i].lat, refLat);
    const b = toLocalXY(line[i + 1].lng, line[i + 1].lat, refLat);
    min = Math.min(min, distancePointToSegment(p, a, b));
  }
  return min;
}

/** 기준점에서 방위각(bearingDeg)·거리(distanceM)만큼 떨어진 지점 (구면 근사, 수 km 이내에서는 오차 무시 가능) */
export function destinationPoint(lat: number, lng: number, bearingDeg: number, distanceM: number): { lat: number; lng: number } {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const angularDistance = distanceM / EARTH_RADIUS_M;
  const bearing = toRad(bearingDeg);
  const lat1 = toRad(lat);
  const lng1 = toRad(lng);

  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(angularDistance) + Math.cos(lat1) * Math.sin(angularDistance) * Math.cos(bearing));
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(lat1),
      Math.cos(angularDistance) - Math.sin(lat1) * Math.sin(lat2),
    );

  return { lat: toDeg(lat2), lng: toDeg(lng2) };
}

export interface BoundingBox {
  south: number;
  west: number;
  north: number;
  east: number;
}

/** 경로 좌표들을 감싸는 사각형에 여유(paddingMeters)를 더한 영역 */
export function boundingBoxOf(coords: [number, number, number][], paddingMeters: number): BoundingBox {
  let south = Infinity;
  let west = Infinity;
  let north = -Infinity;
  let east = -Infinity;
  for (const [lng, lat] of coords) {
    south = Math.min(south, lat);
    north = Math.max(north, lat);
    west = Math.min(west, lng);
    east = Math.max(east, lng);
  }
  const latPad = paddingMeters / 111320; // 위도 1도 ≈ 111.32km, 어디서나 거의 일정
  const lngPad = paddingMeters / (111320 * Math.cos((north * Math.PI) / 180) || 1);
  return { south: south - latPad, west: west - lngPad, north: north + latPad, east: east + lngPad };
}

/** 경로를 일정 간격으로 샘플링한 점 목록 (환경 비율 계산에 쓴다) */
export function sampleLine(coords: [number, number, number][], everyMeters: number): { lng: number; lat: number }[] {
  if (coords.length === 0) return [];
  const samples: { lng: number; lat: number }[] = [{ lng: coords[0][0], lat: coords[0][1] }];
  let accumulated = 0;
  for (let i = 1; i < coords.length; i++) {
    const [lng0, lat0] = coords[i - 1];
    const [lng1, lat1] = coords[i];
    accumulated += distanceMeters(lng0, lat0, lng1, lat1);
    if (accumulated >= everyMeters) {
      samples.push({ lng: lng1, lat: lat1 });
      accumulated = 0;
    }
  }
  return samples;
}

type LngLat = { lng: number; lat: number };

function samePoint(a: LngLat, b: LngLat): boolean {
  return a.lng === b.lng && a.lat === b.lat;
}

/**
 * 여러 개의 선(way 조각들)을 끝점이 맞닿는 대로 이어붙여 하나의 연속된 선으로 만든다.
 * OSM은 긴 길(공원 경계, 자전거길, 둘레길 등)을 교차로·출입구마다 여러 way로 쪼개서
 * 저장하는 경우가 많아서(2026-09-16, "선정릉 담장 둘레를 경유지로 쓰고 싶다" 요청 이후
 * 추가 — 선정릉 경계가 4개 way, 잠원한강공원 근처 자전거길도 5~6개 조각으로 쪼개져
 * 있었다), 하나로 이어야 그 길 전체 길이를 알 수 있다. 시작 조각을 무작위로 골라도 양쪽
 * 끝 어디로든 이어붙일 수 있게 머리(head)·꼬리(tail) 양쪽에서 다음 조각을 찾는다 —
 * 안 그러면 처음 고른 조각이 전체 길의 "중간"일 때 한쪽 방향만 이어지고 반대쪽은
 * 놓친다. 끝점이 실제로 정확히 겹치는 OSM 데이터를 전제로 한다(부동소수점 오차 없이
 * 같은 노드를 공유) — 더 이상 못 이으면 그 상태에서 멈추고, 남은 조각이 있으면(모두
 * 하나로 못 이어지면) null을 돌려준다.
 */
function chainWays(ways: LngLat[][]): LngLat[] | null {
  const remaining = ways.map((w) => w.slice());
  if (remaining.length === 0) return null;

  let chain = remaining.shift()!;
  while (remaining.length > 0) {
    const tail = chain[chain.length - 1];
    const tailIdx = remaining.findIndex((w) => samePoint(w[0], tail) || samePoint(w[w.length - 1], tail));
    if (tailIdx !== -1) {
      const [next] = remaining.splice(tailIdx, 1);
      chain = samePoint(next[0], tail) ? [...chain, ...next.slice(1)] : [...chain, ...next.slice(0, -1).reverse()];
      continue;
    }

    const head = chain[0];
    const headIdx = remaining.findIndex((w) => samePoint(w[0], head) || samePoint(w[w.length - 1], head));
    if (headIdx !== -1) {
      const [next] = remaining.splice(headIdx, 1);
      chain = samePoint(next[next.length - 1], head) ? [...next.slice(0, -1), ...chain] : [...next.slice(1).reverse(), ...chain];
      continue;
    }

    return null; // 남은 조각 중 어느 쪽으로도 이을 수 있는 게 없다 — 이어붙이기 실패
  }
  return chain;
}

/**
 * chainWays로 이어붙인 뒤, 시작점과 끝점이 같은 "닫힌 고리"인지까지 확인한다 — 공원
 * 경계처럼 항상 닫혀 있어야 하는 폴리곤에 쓴다(overpass.ts의 findParkPerimeterWaypoints).
 */
export function stitchRing(ways: LngLat[][]): LngLat[] | null {
  const chain = chainWays(ways);
  if (!chain) return null;
  return samePoint(chain[0], chain[chain.length - 1]) ? chain : null;
}

/**
 * chainWays로 이어붙인 열린 경로를 그대로 돌려준다 — 닫힌 고리일 필요가 없는 자전거길·
 * 둘레길처럼 A지점에서 B지점으로 뻗어있는 길에 쓴다(2026-09-16, "한강 자전거길이 짧은
 * 조각으로 쪼개져 있어서 왕복 거리를 짧은 조각 하나에서밖에 못 잡는다" 문제 이후 추가 —
 * overpass.ts의 findGoodWaypoints가 같은 이름의 way 조각들을 묶어 이걸로 이어붙인다).
 */
export function stitchPath(ways: LngLat[][]): LngLat[] | null {
  return chainWays(ways);
}

/**
 * 닫힌 고리(폴리곤 경계)를 따라 일정 개수의 점을 균등한 호 길이 간격으로 뽑는다.
 * GraphHopper에 경유지로 넘겨서, 그 지점들 사이 최단경로가 폴리곤(예: 공원) 안을
 * 가로지르지 못하니 자연스럽게 바깥 둘레를 따라가게 만드는 데 쓴다(routeBuilder.ts).
 */
export function sampleRingPoints(ring: { lng: number; lat: number }[], count: number): { lng: number; lat: number }[] {
  if (ring.length < 2 || count <= 0) return [];
  let totalM = 0;
  for (let i = 0; i < ring.length - 1; i++) totalM += distanceMeters(ring[i].lng, ring[i].lat, ring[i + 1].lng, ring[i + 1].lat);
  if (totalM === 0) return [];

  const stepM = totalM / count;
  const points: { lng: number; lat: number }[] = [];
  let target = 0;
  let accumulated = 0;
  let segIndex = 0;
  for (let k = 0; k < count; k++) {
    target += stepM;
    while (segIndex < ring.length - 1) {
      const segLen = distanceMeters(ring[segIndex].lng, ring[segIndex].lat, ring[segIndex + 1].lng, ring[segIndex + 1].lat);
      if (accumulated + segLen >= target) {
        const t = segLen === 0 ? 0 : (target - accumulated) / segLen;
        const a = ring[segIndex];
        const b = ring[segIndex + 1];
        points.push({ lng: a.lng + (b.lng - a.lng) * t, lat: a.lat + (b.lat - a.lat) * t });
        break;
      }
      accumulated += segLen;
      segIndex++;
    }
  }
  return points;
}

/** 북쪽 기준 시계방향 방위각(0~360도) */
function bearingDeg(lng1: number, lat1: number, lng2: number, lat2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const y = Math.sin(toRad(lng2 - lng1)) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) - Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lng2 - lng1));
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** 두 방위각 사이의 차이(0~180도, 방향 무관) */
function angleDiffDeg(a: number, b: number): number {
  const diff = Math.abs(a - b) % 360;
  return diff > 180 ? 360 - diff : diff;
}

/**
 * 방향이 angleThresholdDeg 이상 꺾이는 지점들의 좌표를 찾는다.
 * GraphHopper 원본 좌표는 너무 촘촘해서 그대로 쓰면 자잘한 노이즈까지 "커브"로 잡히니,
 * stepMeters 간격으로 리샘플링한 뒤 구간 사이 방위각 변화를 비교한다 —
 * 러너가 실제로 "여기서 방향을 크게 틀었다"고 느낄 법한 지점만 잡는 게 목적이다.
 * countSharpTurns(개수만 필요)와 overpass.ts의 횡단보도 위치 대조(실제 좌표가 필요)가
 * 둘 다 이 지점들을 쓴다.
 *
 * excludeNear를 주면 그 지점 반경 안의 회전은 "급회전"으로 세지 않는다 — 왕복형의
 * 반환점은 의도적으로 180도 꺾이는 지점이라, 이걸 그냥 세면 왕복형이 실수로 되돌아간
 * 경로와 똑같이 불이익을 받는다(2026-09-16, "의도한 왕복과 불필요한 반복을 구분하라"
 * 피드백 이후 추가 — routeBuilder.ts가 mirrorOutAndBack의 반환점 좌표를 넘긴다).
 */
export function findSharpTurnPoints(
  coords: [number, number, number][],
  stepMeters = 15,
  angleThresholdDeg = 60,
  excludeNear?: { point: { lng: number; lat: number }; radiusM: number },
): { lng: number; lat: number }[] {
  const points = sampleLine(coords, stepMeters);
  if (points.length < 3) return [];

  const turnPoints: { lng: number; lat: number }[] = [];
  let prevBearing: number | null = null;
  for (let i = 1; i < points.length; i++) {
    const b = bearingDeg(points[i - 1].lng, points[i - 1].lat, points[i].lng, points[i].lat);
    if (prevBearing !== null && angleDiffDeg(b, prevBearing) >= angleThresholdDeg) {
      const candidate = points[i - 1];
      const isExcluded =
        excludeNear !== undefined &&
        distanceMeters(candidate.lng, candidate.lat, excludeNear.point.lng, excludeNear.point.lat) <= excludeNear.radiusM;
      if (!isExcluded) turnPoints.push(candidate);
    }
    prevBearing = b;
  }
  return turnPoints;
}

/** 급커브(방향이 angleThresholdDeg 이상 꺾이는 지점) 개수를 센다. */
export function countSharpTurns(
  coords: [number, number, number][],
  stepMeters = 15,
  angleThresholdDeg = 60,
  excludeNear?: { point: { lng: number; lat: number }; radiusM: number },
): number {
  return findSharpTurnPoints(coords, stepMeters, angleThresholdDeg, excludeNear).length;
}
