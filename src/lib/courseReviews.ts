/**
 * 코스 평가(course_reviews) — 사용자당 코스 하나에 평가 하나(user_id, course_id unique).
 * 같은 코스로 또 뛰면 이전 평가를 불러와서 수정하는 형태라, upsert로 충분하다
 * (RLS가 본인 것만 조회/작성/수정 가능하게 이미 막아준다 — migration 0001/0003/0011).
 */
import { supabase } from '@/lib/supabase';

export type Satisfaction = 1 | 2 | 3 | 4 | 5;
export type MatchScore = 25 | 50 | 75 | 100;

export interface CourseReview {
  satisfaction: Satisfaction;
  matchScore: MatchScore;
  likedTags: string[];
  comment: string | null;
}

interface CourseReviewRow {
  satisfaction: number;
  match_score: number;
  liked_tags: string[];
  comment: string | null;
}

function fromRow(row: CourseReviewRow): CourseReview {
  return {
    satisfaction: row.satisfaction as Satisfaction,
    matchScore: row.match_score as MatchScore,
    likedTags: row.liked_tags,
    comment: row.comment,
  };
}

/** 이 코스에 대한 내 기존 평가 — 없으면(처음 뛰는 코스면) null. */
export async function fetchMyCourseReview(courseId: string): Promise<CourseReview | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('course_reviews')
    .select('satisfaction, match_score, liked_tags, comment')
    .eq('course_id', courseId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) throw error;
  return data ? fromRow(data) : null;
}

/** 평가 저장 — 이미 평가한 코스면 덮어쓰고(수정), 처음이면 새로 만든다. */
export async function upsertCourseReview(courseId: string, review: CourseReview): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('로그인이 필요합니다.');

  const { error } = await supabase.from('course_reviews').upsert(
    {
      user_id: user.id,
      course_id: courseId,
      satisfaction: review.satisfaction,
      match_score: review.matchScore,
      liked_tags: review.likedTags,
      comment: review.comment,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,course_id' },
  );

  if (error) throw error;
}
