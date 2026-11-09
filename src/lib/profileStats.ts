/**
 * 마이페이지 요약 통계 — 저장한 코스 개수, 완주 기록 개수, 평균 만족도.
 * 전부 RLS로 본인 것만 걸리는 테이블이라 별도 서버 함수 없이 count/select로 충분하다.
 */
import { supabase } from '@/lib/supabase';

export interface ProfileStats {
  savedCourseCount: number;
  runningRecordCount: number;
  /** 평가를 한 번도 안 남겼으면 표시할 값이 없다 — 지어내지 않고 null로 둔다. */
  averageSatisfaction: number | null;
}

export async function fetchProfileStats(userId: string): Promise<ProfileStats> {
  const [savedResult, recordResult, reviewResult] = await Promise.all([
    supabase.from('saved_courses').select('course_id', { count: 'exact', head: true }).eq('user_id', userId),
    supabase.from('running_record').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('status', 'COMPLETED'),
    supabase.from('course_reviews').select('satisfaction').eq('user_id', userId),
  ]);

  if (savedResult.error) throw savedResult.error;
  if (recordResult.error) throw recordResult.error;
  if (reviewResult.error) throw reviewResult.error;

  const satisfactions = (reviewResult.data ?? []).map((row) => row.satisfaction as number);
  const averageSatisfaction =
    satisfactions.length > 0 ? satisfactions.reduce((sum, v) => sum + v, 0) / satisfactions.length : null;

  return {
    savedCourseCount: savedResult.count ?? 0,
    runningRecordCount: recordResult.count ?? 0,
    averageSatisfaction,
  };
}
