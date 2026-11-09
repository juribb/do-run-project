/**
 * 경로 "모양" 품질 측정·정리 (2026-10-05, "코스 모양이 이상하다" 피드백 이후 추가).
 *
 * 경유지 라우팅(routeBuilder.ts)은 경유지가 최단경로에서 벗어난 샛길에 있으면 그 지점까지
 * 갔다가 같은 길로 되돌아오는 "가지(spur)"가 생기고, 진입점·이탈점이 출발지 근처 같은
 * 길 위에 있으면 갔던 길을 그대로 되돌아오는 "막대사탕" 모양이 된다. 급회전 개수만으로는
 * 이런 모양을 구분하지 못해서(가지 끝점은 급회전 1개로만 센다), 겹침·교차·둥근 정도를
 * 따로 잰다. 순수 좌표 계산이라 외부 API를 쓰지 않는다.
 */

type Coord3 = [number, number, number];

const EARTH_RADIUS_M = 6371000;
const DEG = Math.PI / 180;

interface Pt {
  x: number;
  y: number;
  ele: number;
}

interface Resampled {
  pts: Pt[];
  stepM: number;
  refLat: number;
}

function toXY(lng: number, lat: number, refLat: number): [number, number] {
  return [lng * DEG * EARTH_RADIUS_M * Math.cos(refLat * DEG), lat * DEG * EARTH_RADIUS_M];
}

function toLngLat(x: number, y: number, refLat: number): [number, number] {
  return [x / (EARTH_RADIUS_M * Math.cos(refLat * DEG)) / DEG, y / EARTH_RADIUS_M / DEG];
}

/** 경로를 정확히 같은 간격(stepM에 가장 가깝게 맞춘 값)으로 다시 찍는다. 고도도 같이 보간한다. */
function resample(coords: Coord3[], stepM: number): Resampled | null {
  if (coords.length < 2) return null;
  const refLat = coords[0][1];
  const vertices = coords.map(([lng, lat, ele]) => {
    const [x, y] = toXY(lng, lat, refLat);
    return { x, y, ele: ele ?? 0 };
  });

  const cumulative = [0];
  for (let i = 1; i < vertices.length; i++) {
    cumulative.push(cumulative[i - 1] + Math.hypot(vertices[i].x - vertices[i - 1].x, vertices[i].y - vertices[i - 1].y));
  }
  const total = cumulative[cumulative.length - 1];
  if (total < stepM) return null;

  const intervals = Math.max(1, Math.round(total / stepM));
  const step = total / intervals;
  const pts: Pt[] = [];
  let seg = 0;
  for (let k = 0; k <= intervals; k++) {
    const s = k * step;
    while (seg < vertices.length - 2 && cumulative[seg + 1] < s) seg++;
    const segLen = cumulative[seg + 1] - cumulative[seg];
    const t = segLen === 0 ? 0 : Math.min(1, Math.max(0, (s - cumulative[seg]) / segLen));
    const a = vertices[seg];
    const b = vertices[seg + 1];
    pts.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, ele: a.ele + (b.ele - a.ele) * t });
  }
  return { pts, stepM: step, refLat };
}

export interface ShapeMetrics {
  /** 이전에 지나간 길을 다시 지나는 구간 비율(0~1). 갔던 길 되돌아오기·막대사탕 모양일수록 크다. */
  overlapRatio: number;
  /** 경로가 스스로 가로지르는 횟수(8자 모양 등). 출발지 근처 시작·끝 접합부는 세지 않는다. */
  selfCrossings: number;
  /** 4πA/P² — 원=1, 정사각형≈0.78, 가늘고 긴 경로는 0에 가깝다. 순환형 판단에만 의미가 있다. */
  compactness: number;
}

const OVERLAP_STEP_M = 10;
/** 이 거리(경로상 간격)보다 가까운 점끼리는 "같은 길 되돌아오기"로 안 본다 — 이웃한 점이라서 */
const OVERLAP_MIN_PATH_GAP_M = 80;
const OVERLAP_RADIUS_M = 12;
const CROSSING_STEP_M = 25;
const CROSSING_MIN_SEGMENT_GAP = 3;
const CROSSING_IGNORE_NEAR_START_M = 40;
/** sin(25°) — 이보다 얕은 각도로 만나는 선분은 교차가 아니라 겹침으로 본다 */
const CROSSING_MIN_SIN_ANGLE = 0.42;

function properIntersection(p1: Pt, p2: Pt, p3: Pt, p4: Pt): { x: number; y: number } | null {
  const d1x = p2.x - p1.x;
  const d1y = p2.y - p1.y;
  const d2x = p4.x - p3.x;
  const d2y = p4.y - p3.y;
  const denom = d1x * d2y - d1y * d2x;
  if (Math.abs(denom) < 1e-9) return null; // 평행·일직선(겹침은 overlapRatio가 따로 본다)
  // 같은 길을 되돌아오는 구간은 샘플링 위치가 살짝 어긋나서 거의 평행한 두 선분이 미세하게
  // "교차"한 것처럼 잡힌다 — 실제 가로지름은 어느 정도 각도가 있으니 거의 평행한 건 뺀다.
  const sinAngle = Math.abs(denom) / (Math.hypot(d1x, d1y) * Math.hypot(d2x, d2y));
  if (sinAngle < CROSSING_MIN_SIN_ANGLE) return null;
  const ex = p3.x - p1.x;
  const ey = p3.y - p1.y;
  const t = (ex * d2y - ey * d2x) / denom;
  const u = (ex * d1y - ey * d1x) / denom;
  if (t > 0 && t < 1 && u > 0 && u < 1) return { x: p1.x + t * d1x, y: p1.y + t * d1y };
  return null;
}

/**
 * 왕복형은 뒤 절반이 앞 절반의 거울상이라(mirrorOutAndBack) 그대로 재면 겹침이 항상 100%다 —
 * 편도 구간만 따로 잰다.
 */
export function analyzeShape(coords: Coord3[], opts?: { isOutAndBack?: boolean }): ShapeMetrics {
  const target = opts?.isOutAndBack ? coords.slice(0, Math.ceil(coords.length / 2)) : coords;
  const fine = resample(target, OVERLAP_STEP_M);
  if (!fine || fine.pts.length < 4) return { overlapRatio: 0, selfCrossings: 0, compactness: 1 };

  const { pts, stepM } = fine;
  const gapSamples = Math.ceil(OVERLAP_MIN_PATH_GAP_M / stepM);
  const radiusSq = OVERLAP_RADIUS_M * OVERLAP_RADIUS_M;
  let retraced = 0;
  for (let i = gapSamples; i < pts.length; i++) {
    for (let j = 0; j <= i - gapSamples; j++) {
      const dx = pts[i].x - pts[j].x;
      const dy = pts[i].y - pts[j].y;
      if (dx * dx + dy * dy <= radiusSq) {
        retraced++;
        break;
      }
    }
  }
  const overlapRatio = retraced / pts.length;

  const coarse = resample(target, CROSSING_STEP_M);
  if (!coarse || coarse.pts.length < 5) return { overlapRatio, selfCrossings: 0, compactness: 1 };
  const c = coarse.pts;
  const origin = c[0];
  let selfCrossings = 0;
  for (let a = 0; a < c.length - 1; a++) {
    for (let b = a + CROSSING_MIN_SEGMENT_GAP; b < c.length - 1; b++) {
      const hit = properIntersection(c[a], c[a + 1], c[b], c[b + 1]);
      if (!hit) continue;
      if (Math.hypot(hit.x - origin.x, hit.y - origin.y) <= CROSSING_IGNORE_NEAR_START_M) continue;
      selfCrossings++;
    }
  }

  let area2 = 0;
  for (let i = 0; i < c.length; i++) {
    const p = c[i];
    const q = c[(i + 1) % c.length];
    area2 += p.x * q.y - q.x * p.y;
  }
  const perimeter = (c.length - 1) * coarse.stepM;
  const compactness = perimeter === 0 ? 1 : Math.min(1, (4 * Math.PI * Math.abs(area2 / 2)) / (perimeter * perimeter));

  return { overlapRatio, selfCrossings, compactness };
}

const SPUR_STEP_M = 5;
/** 가지 양쪽 다리가 이 거리 안에서 겹쳐야 "같은 길을 갔다 되돌아온 것"으로 본다 */
const SPUR_TOLERANCE_M = 8;
/** 이보다 짧은 되돌이(편도 기준)는 지도에서 눈에 안 띄고 코너 돌기와 구분이 안 돼서 건드리지 않는다 */
const SPUR_MIN_LENGTH_M = 30;
const SPUR_MAX_LENGTH_M = 400;
const SPUR_MAX_PASSES = 3;

export interface SpurRemoval {
  coordinates: Coord3[];
  distanceM: number;
  removedAscentM: number;
  removedDescentM: number;
}

function polylineLength(coords: Coord3[], refLat: number): number {
  let total = 0;
  let prev = toXY(coords[0][0], coords[0][1], refLat);
  for (let i = 1; i < coords.length; i++) {
    const cur = toXY(coords[i][0], coords[i][1], refLat);
    total += Math.hypot(cur[0] - prev[0], cur[1] - prev[1]);
    prev = cur;
  }
  return total;
}

/**
 * 경로 중간에 "갔다가 같은 길로 되돌아오는 가지"가 있으면 그 부분을 잘라낸다. 가지는 대칭이라
 * 끝점(반환점) 양쪽으로 같은 거리만큼 떨어진 두 점이 계속 거의 겹친다 — 그 성질로 찾는다.
 * 순환형에만 쓴다(왕복형은 되돌아오는 게 의도된 구조). 잘라낼 게 없으면 null(원본 유지).
 * 거리는 줄지만 고도 변화는 가지의 오르내림만큼만 빼서 근사한다(가지는 올라간 만큼 내려오므로
 * 오르막·내리막 양쪽에서 같은 양이 빠진다).
 */
export function removeSpurs(coords: Coord3[]): SpurRemoval | null {
  let current = coords;
  let removedAscentM = 0;
  let removedDescentM = 0;
  let changed = false;

  for (let pass = 0; pass < SPUR_MAX_PASSES; pass++) {
    const resampled = resample(current, SPUR_STEP_M);
    if (!resampled) break;
    const { pts, stepM, refLat } = resampled;
    const n = pts.length;
    const length = (n - 1) * stepM;
    const half = stepM / 2;

    const posAt = (s: number): Pt => {
      const f = s / stepM;
      const i0 = Math.min(n - 1, Math.max(0, Math.floor(f)));
      const i1 = Math.min(n - 1, i0 + 1);
      const t = Math.min(1, Math.max(0, f - i0));
      const a = pts[i0];
      const b = pts[i1];
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, ele: a.ele + (b.ele - a.ele) * t };
    };

    const found: { a: number; b: number }[] = [];
    for (let k = 1; k < 2 * (n - 1); k++) {
      const tip = k * half;
      let reach = 0;
      for (let u = half; u <= SPUR_MAX_LENGTH_M && tip - u >= 0 && tip + u <= length; u += half) {
        const p = posAt(tip - u);
        const q = posAt(tip + u);
        if (Math.hypot(p.x - q.x, p.y - q.y) > SPUR_TOLERANCE_M) break;
        reach = u;
      }
      if (reach >= SPUR_MIN_LENGTH_M) found.push({ a: tip - reach, b: tip + reach });
    }
    if (found.length === 0) break;

    found.sort((x, y) => y.b - y.a - (x.b - x.a));
    const chosen: { a: number; b: number }[] = [];
    for (const spur of found) {
      if (!chosen.some((c) => spur.a < c.b && spur.b > c.a)) chosen.push(spur);
    }
    chosen.sort((x, y) => x.a - y.a);

    const eps = 1e-6;
    const items: { s: number; pt: Pt }[] = [];
    for (let i = 0; i < n; i++) {
      const s = i * stepM;
      if (!chosen.some((c) => s >= c.a - eps && s <= c.b + eps)) items.push({ s, pt: pts[i] });
    }
    for (const c of chosen) {
      const pa = posAt(c.a);
      const pb = posAt(c.b);
      const junction =
        c.a <= eps ? pa : c.b >= length - eps ? pb : { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2, ele: (pa.ele + pb.ele) / 2 };
      items.push({ s: c.a, pt: junction });
      for (let s = c.a; s + stepM <= c.b + eps; s += stepM) {
        const delta = posAt(Math.min(c.b, s + stepM)).ele - posAt(s).ele;
        if (delta > 0) removedAscentM += delta;
        else removedDescentM -= delta;
      }
    }
    items.sort((x, y) => x.s - y.s);

    current = items.map(({ pt }) => {
      const [lng, lat] = toLngLat(pt.x, pt.y, refLat);
      return [lng, lat, pt.ele] as Coord3;
    });
    changed = true;
  }

  if (!changed) return null;
  return {
    coordinates: current,
    distanceM: polylineLength(current, current[0][1]),
    removedAscentM,
    removedDescentM,
  };
}
