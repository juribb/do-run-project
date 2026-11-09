/**
 * 저장한 코스 읽기/쓰기.
 *
 * course(공유 가능한 물리적 경로 자산)는 추천 시점엔 없다 — 저장/취소도 candidate_id
 * 기준으로 하고, DB 함수(save_course/unsave_course, migration 0008)가 그 안에서 필요하면
 * course를 만들거나 찾아 saved_courses를 연결한다. 조회도 전용 함수 get_saved_courses()를
 * 쓴다 (geometry는 일반 select로 못 읽고 GeoJSON 좌표로 변환해서 받아야 한다).
 */
import { supabase } from '@/lib/supabase';
import type { CourseCandidate, EnvironmentRatio } from '@/types/recommendation';

interface GetSavedCoursesRow {
  candidate_id: string;
  name: string | null;
  coordinates: [number, number, number][] | null;
  distance_m: number;
  ascent_m: number;
  descent_m: number;
  traffic_light_count: number | null;
  stair_count: number | null;
  fit_score: number | null;
  reason_text: string | null;
  environment_ratios: EnvironmentRatio[] | null;
}

/** 6:30/km 페이스 가정 — recommend Edge Function과 동일한 값 (예상 소요시간 계산용) */
const ASSUMED_PACE_S_PER_KM = 390;

function rowToCandidate(row: GetSavedCoursesRow): CourseCandidate {
  const distanceKm = row.distance_m / 1000;
  return {
    id: row.candidate_id,
    name: row.name ?? `저장한 코스 ${distanceKm.toFixed(1)}km`,
    coordinates: row.coordinates ?? [],
    distanceM: row.distance_m,
    ascentM: row.ascent_m,
    descentM: row.descent_m,
    estimatedDurationS: Math.round(distanceKm * ASSUMED_PACE_S_PER_KM),
    environmentRatios: row.environment_ratios ?? [],
    trafficLightCount: row.traffic_light_count,
    stairCount: row.stair_count,
    // 추천 당시 계산된 값의 스냅샷 — 저장한 코스는 그 추천 이벤트와 별개로 다시 조건을 대조하지 않는다.
    fitScore: row.fit_score ?? 0,
    reasonText: row.reason_text ?? '',
  };
}

export async function fetchSavedCourses(): Promise<CourseCandidate[]> {
  const { data, error } = await supabase.rpc('get_saved_courses');
  if (error) throw error;
  return ((data ?? []) as GetSavedCoursesRow[]).map(rowToCandidate);
}

/** candidateId는 recommend Edge Function이 돌려준 candidate.id다 (recommendation_candidate.id). */
export async function saveCourse(candidateId: string): Promise<void> {
  const { error } = await supabase.rpc('save_course', { p_candidate_id: candidateId });
  if (error) throw error;
}

export async function unsaveCourse(candidateId: string): Promise<void> {
  const { error } = await supabase.rpc('unsave_course', { p_candidate_id: candidateId });
  if (error) throw error;
}
