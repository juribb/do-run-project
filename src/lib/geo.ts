/** 작은 규모(한 번의 러닝, 최대 수십 km)에서 충분히 정확한 두 좌표 사이 거리(미터) 계산 */
export function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const EARTH_RADIUS_M = 6371000;

/** [lng, lat] 좌표를 기준점(refLat) 근처의 평면 미터 좌표로 변환 (작은 범위 근사) */
function toLocalXY(lng: number, lat: number, refLat: number): [number, number] {
  const x = ((lng * Math.PI) / 180) * EARTH_RADIUS_M * Math.cos((refLat * Math.PI) / 180);
  const y = ((lat * Math.PI) / 180) * EARTH_RADIUS_M;
  return [x, y];
}

function distancePointToSegment(p: [number, number], a: [number, number], b: [number, number]): number {
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
 * 현재 위치와 계획된 경로(coordinates, [lng, lat, ele][]) 사이의 최단 거리(미터).
 * "경로 이탈" 감지용 — supabase/functions/recommend/geometry.ts의 distancePointToLine과 같은 방식이다.
 */
export function distanceToRouteMeters(point: { lat: number; lng: number }, route: [number, number, number][]): number {
  if (route.length === 0) return Infinity;
  const refLat = point.lat;
  const p = toLocalXY(point.lng, point.lat, refLat);
  if (route.length === 1) {
    const a = toLocalXY(route[0][0], route[0][1], refLat);
    return Math.hypot(p[0] - a[0], p[1] - a[1]);
  }
  let min = Infinity;
  for (let i = 0; i < route.length - 1; i++) {
    const a = toLocalXY(route[i][0], route[i][1], refLat);
    const b = toLocalXY(route[i + 1][0], route[i + 1][1], refLat);
    min = Math.min(min, distancePointToSegment(p, a, b));
  }
  return min;
}
