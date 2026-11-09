/**
 * 실제 추천 API 호출. supabase.functions.invoke는 로그인 세션이 있으면
 * Authorization 헤더를 자동으로 붙여준다 — Edge Function이 그걸로 사용자를 확인한다.
 */
import { supabase } from '@/lib/supabase';
import type { SelectedLocation } from '@/stores/locationStore';
import type { CourseCandidate, RunningCondition } from '@/types/recommendation';

export class RecommendationError extends Error {}

/**
 * Edge Function 안에서 호출하는 Overpass·GraphHopper에 각각 타임아웃을 걸어뒀지만
 * (supabase/functions/recommend/fetchWithTimeout.ts), 혹시 모를 상황(콜드 스타트 등)에
 * 대비해 클라이언트 쪽에도 상한선을 둔다 — 안 그러면 이 요청이 안 끝나는 한 "적합도 비교
 * 분석 중" 화면에서 하염없이 멈춰있게 된다. 타임아웃되면 course-search-loading.tsx가
 * 이미 처리하는 일반 에러 화면(재시도 버튼)으로 자연스럽게 넘어간다.
 */
const REQUEST_TIMEOUT_MS = 70000; // Overpass 재시도(fetchWithTimeout.ts) 추가로 최악의 경우가 늘어나 넉넉히 잡음

export async function requestRecommendation(
  condition: RunningCondition,
  location: SelectedLocation,
): Promise<CourseCandidate[]> {
  const { data, error } = await supabase.functions.invoke('recommend', {
    body: {
      originLat: location.lat,
      originLng: location.lng,
      targetDistanceKm: condition.targetDistanceKm,
      slopePreference: condition.slopePreference,
      environmentPreferences: condition.environmentPreferences,
      extraConditions: condition.extraConditions,
    },
    timeout: REQUEST_TIMEOUT_MS,
  });

  if (error) {
    // Edge Function이 에러 상태코드와 함께 { error: string }을 내려주면 그 메시지를 쓴다.
    const context = (error as { context?: { json?: () => Promise<{ error?: string }> } }).context;
    const body = await context?.json?.().catch(() => null);
    throw new RecommendationError(body?.error ?? '추천을 받아오지 못했어요. 잠시 후 다시 시도해주세요.');
  }

  return data.candidates as CourseCandidate[];
}
