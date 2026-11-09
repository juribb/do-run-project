/**
 * 외부 API(Overpass·GraphHopper·Nominatim) 호출에 타임아웃을 건다.
 * 특히 무료 공개 Overpass 서버는 부하가 걸리면 응답 없이 50초 넘게 멈춰있는 경우가 실제로
 * 있다(2026-09-15 확인 — around 필터를 way 그대로 걸었더니 56초 만에 타임아웃 응답이 옴).
 * 그대로 두면 이 함수 전체가 하염없이 기다리다 클라이언트 쪽에서 "적합도 비교 분석 중"
 * 화면에 멈춘 것처럼 보인다 — 제한 시간을 넘기면 실패로 처리해서, 호출한 쪽이 이미 갖고
 * 있는 폴백 경로(null/빈 배열 반환 등)를 타게 한다.
 */
export async function fetchWithTimeout(url: string | URL, init: RequestInit = {}, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Overpass 공개 서버는 부하가 순간적으로 튀는 게 흔해서(실측: 연속으로 3번 호출했을 때도
 * 그중 하나가 504로 실패 — 동시 요청이 아니어도 발생), 실패나 타임아웃을 한 번은 그냥
 * 재시도해서 넘긴다. 재시도까지 실패하면 그때는 진짜 실패로 보고 포기한다(null/빈 배열 반환).
 */
export async function fetchWithRetry(
  url: string | URL,
  init: RequestInit = {},
  timeoutMs: number,
  retries = 1,
): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetchWithTimeout(url, init, timeoutMs);
      if (response.ok) return response;
      lastError = new Error(`HTTP ${response.status}`);
      if (attempt === retries) return response; // 마지막 시도면 실패 응답이라도 그대로 돌려준다
    } catch (e) {
      lastError = e;
      if (attempt === retries) throw e;
    }
  }
  throw lastError;
}
