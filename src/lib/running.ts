/**
 * 실시간 러닝 기록 시작/종료.
 * 시작은 course를 보장(get-or-create)하고 running_record를 만드는 DB 함수를 쓰고,
 * 종료는 실제 이동 경로(actual_path)를 PostGIS geometry로 변환해서 저장하는 DB 함수를 쓴다
 * (migration 0009 참고 — 둘 다 일반 insert/update로는 못 하는 일이라 함수가 필요하다).
 */
import { supabase } from '@/lib/supabase';

export async function startRunningRecord(candidateId: string): Promise<{ recordId: string; courseId: string }> {
  const { data, error } = await supabase.rpc('start_running_record', { p_candidate_id: candidateId });
  if (error) throw error;
  // returns table(...)이라 PostgREST는 행 1개짜리 배열로 돌려준다.
  const row = (Array.isArray(data) ? data[0] : data) as { record_id: string; course_id: string };
  return { recordId: row.record_id, courseId: row.course_id };
}

/**
 * F-10 동일 코스 재도전 — candidate가 아니라 이미 존재하는 course_id로 바로 시작한다
 * (records/[courseId]의 "다시 달리기"). ensure_course_for_candidate를 거칠 필요가 없어서
 * start_running_record와는 다른, 더 단순한 함수(migration 0013)를 쓴다.
 */
export async function startRunningRecordForCourse(courseId: string): Promise<{ recordId: string; courseId: string }> {
  const { data, error } = await supabase.rpc('start_running_record_for_course', { p_course_id: courseId });
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as { record_id: string; course_id: string };
  return { recordId: row.record_id, courseId: row.course_id };
}

export async function completeRunningRecord(params: {
  recordId: string;
  distanceM: number;
  durationS: number;
  avgPaceSPerKm: number | null;
  actualPath: [number, number, number][];
}): Promise<void> {
  const { error } = await supabase.rpc('complete_running_record', {
    p_record_id: params.recordId,
    p_distance_m: params.distanceM,
    p_duration_s: params.durationS,
    p_avg_pace_s_per_km: params.avgPaceSPerKm,
    p_actual_path: params.actualPath,
  });
  if (error) throw error;
}

export async function abortRunningRecord(recordId: string): Promise<void> {
  const { error } = await supabase
    .from('running_record')
    .update({ status: 'ABORTED', finished_at: new Date().toISOString() })
    .eq('id', recordId);
  if (error) throw error;
}
