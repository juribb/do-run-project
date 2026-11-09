/**
 * 러닝 기록 조회. running_record는 RLS로 본인 것만 보이고, course는 누구나 조회 가능한
 * 공개 자산이라 FK로 그냥 묶어서 가져올 수 있다 — 목록 화면은 전용 함수 없이 일반
 * select로 충분하다. 코스 geometry만 course_geojson()(migration 0002, 기존 함수 재사용)으로 변환한다.
 */
import { supabase } from '@/lib/supabase';

export interface RunningRecordSummary {
  id: string;
  distanceM: number;
  durationS: number;
  avgPaceSPerKm: number | null;
  startedAt: string;
}

/** 기록 목록 화면에서 코스별로 묶어서 보여줄 때 쓰는 단위 — 최근 3개만 들고, 나머지는 개수만 안다 */
export interface CourseRunGroup {
  courseId: string;
  courseName: string;
  trafficLightCount: number | null;
  stairCount: number | null;
  totalCount: number;
  recentRuns: RunningRecordSummary[];
}

interface CourseJoin {
  name: string | null;
  traffic_light_count: number | null;
  stair_count: number | null;
}

interface RunningRecordRow {
  id: string;
  distance_m: number | null;
  duration_s: number | null;
  avg_pace_s_per_km: number | null;
  started_at: string;
  course_id: string;
  course: CourseJoin | CourseJoin[] | null;
}

function normalizeCourse(course: RunningRecordRow['course']): CourseJoin | null {
  const row = Array.isArray(course) ? course[0] : course;
  return row ?? null;
}

function toSummary(row: { id: string; distance_m: number | null; duration_s: number | null; avg_pace_s_per_km: number | null; started_at: string }): RunningRecordSummary {
  return {
    id: row.id,
    distanceM: row.distance_m ?? 0,
    durationS: row.duration_s ?? 0,
    avgPaceSPerKm: row.avg_pace_s_per_km,
    startedAt: row.started_at,
  };
}

/** 기록 목록 화면용 — 코스별로 묶고, 각 코스 안에서는 최신순으로 최대 3개만 담는다. */
export async function fetchRunningRecordGroups(): Promise<CourseRunGroup[]> {
  const { data, error } = await supabase
    .from('running_record')
    .select('id, distance_m, duration_s, avg_pace_s_per_km, started_at, course_id, course(name, traffic_light_count, stair_count)')
    .eq('status', 'COMPLETED')
    .order('started_at', { ascending: false });

  if (error) throw error;

  const groups = new Map<string, CourseRunGroup>();
  for (const row of (data ?? []) as unknown as RunningRecordRow[]) {
    const course = normalizeCourse(row.course);
    const summary = toSummary(row);
    const existing = groups.get(row.course_id);
    if (existing) {
      existing.totalCount += 1;
      if (existing.recentRuns.length < 3) existing.recentRuns.push(summary);
    } else {
      groups.set(row.course_id, {
        courseId: row.course_id,
        courseName: course?.name ?? '러닝 코스',
        trafficLightCount: course?.traffic_light_count ?? null,
        stairCount: course?.stair_count ?? null,
        totalCount: 1,
        recentRuns: [summary],
      });
    }
  }
  // Map 삽입 순서 = 각 코스의 가장 최근 기록이 먼저 나온 순서(쿼리가 이미 최신순)라
  // 그대로 뽑으면 "최근에 뛴 코스가 위로" 정렬된다.
  return Array.from(groups.values());
}

export interface CourseDetail {
  id: string;
  name: string;
  distanceM: number;
  ascentM: number;
  descentM: number;
  trafficLightCount: number | null;
  stairCount: number | null;
  coordinates: [number, number, number][];
}

/** 기록 상세 화면용 — 코스 정보(지도용 좌표 포함) 하나. */
export async function fetchCourseDetail(courseId: string): Promise<CourseDetail | null> {
  const [courseResult, geoResult] = await Promise.all([
    supabase
      .from('course')
      .select('id, name, distance_m, ascent_m, descent_m, traffic_light_count, stair_count')
      .eq('id', courseId)
      .maybeSingle(),
    supabase.rpc('course_geojson', { p_course_id: courseId }),
  ]);

  if (courseResult.error) throw courseResult.error;
  if (geoResult.error) throw geoResult.error;
  if (!courseResult.data) return null;

  const geo = geoResult.data as { coordinates?: [number, number, number][] } | null;

  return {
    id: courseResult.data.id,
    name: courseResult.data.name ?? '러닝 코스',
    distanceM: courseResult.data.distance_m,
    ascentM: courseResult.data.ascent_m,
    descentM: courseResult.data.descent_m,
    trafficLightCount: courseResult.data.traffic_light_count,
    stairCount: courseResult.data.stair_count,
    coordinates: geo?.coordinates ?? [],
  };
}

/** 기록 상세 화면용 — 그 코스로 뛴 기록 전체(최신순), 목록 화면과 달리 3개 제한이 없다. */
export async function fetchRunningRecordsForCourse(courseId: string): Promise<RunningRecordSummary[]> {
  const { data, error } = await supabase
    .from('running_record')
    .select('id, distance_m, duration_s, avg_pace_s_per_km, started_at')
    .eq('course_id', courseId)
    .eq('status', 'COMPLETED')
    .order('started_at', { ascending: false });

  if (error) throw error;
  return ((data ?? []) as { id: string; distance_m: number | null; duration_s: number | null; avg_pace_s_per_km: number | null; started_at: string }[]).map(
    toSummary,
  );
}
