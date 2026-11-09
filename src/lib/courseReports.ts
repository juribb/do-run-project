/**
 * 코스 문제 신고(course_report) — 러닝 기록 하나당 여러 건 낼 수 있고(제출 후 수정은 안 함),
 * RLS가 본인 신고만 조회/작성 가능하게 막아준다(migration 0001/0003). 신고는 그 자리에서
 * 제출만 하고 화면에 되불러오지 않는다 — 관리자가 대시보드에서 확인하는 용도다.
 */
import { supabase } from '@/lib/supabase';

export type CourseReportReason = 'CONSTRUCTION' | 'BLOCKED' | 'MAP_ERROR' | 'ENV_INFO_ERROR' | 'MISMATCH' | 'OTHER';

export const COURSE_REPORT_REASON_OPTIONS: { value: CourseReportReason; label: string }[] = [
  { value: 'CONSTRUCTION', label: '공사 중' },
  { value: 'BLOCKED', label: '통행 불가/막힘' },
  { value: 'MISMATCH', label: '실제 코스와 다름' },
  { value: 'ENV_INFO_ERROR', label: '환경 정보 오류' },
  { value: 'MAP_ERROR', label: '지도 오류' },
  { value: 'OTHER', label: '기타' },
];

export async function submitCourseReport(runningRecordId: string, reason: CourseReportReason, detail: string | null): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('로그인이 필요합니다.');

  const { error } = await supabase.from('course_report').insert({
    running_record_id: runningRecordId,
    user_id: user.id,
    reason,
    detail,
  });

  if (error) throw error;
}
