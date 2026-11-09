/**
 * src/lib/scoring.ts를 서버(Deno)용으로 그대로 이식한 파일.
 * 로직은 100% 동일하게 유지한다 — 가중치나 판단 기준을 바꿀 때는 반드시 두 파일을 같이 고칠 것.
 * (Edge Function은 supabase/functions/recommend/ 폴더만 독립 배포되므로 @/ 경로를 못 써서 복사했다.)
 */

export type SlopePreference = 'FLAT' | 'SOME_HILL' | 'ANY';
export type EnvironmentPreference = 'PARK' | 'RIVERSIDE' | 'URBAN' | 'GREENERY';
export type ExtraCondition = 'FEW_TRAFFIC_LIGHTS' | 'NO_STAIRS';

export interface RunningCondition {
  targetDistanceKm: number;
  slopePreference: SlopePreference;
  environmentPreferences: EnvironmentPreference[];
  extraConditions: ExtraCondition[];
}

export interface EnvironmentRatio {
  feature: EnvironmentPreference;
  ratio: number;
}

export interface RawCourse {
  distanceM: number;
  ascentM: number;
  environmentRatios: EnvironmentRatio[];
  trafficLightCount: number | null;
  stairCount: number | null;
}

const FIT_SCORE_WEIGHTS = { distance: 40, slope: 25, environment: 25, extraConditions: 10 } as const;

const ENVIRONMENT_LABELS: Record<EnvironmentPreference, string> = {
  PARK: '공원',
  RIVERSIDE: '하천',
  GREENERY: '녹지',
  URBAN: '도심',
};

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function scoreDistance(course: RawCourse, condition: RunningCondition): number {
  const targetM = condition.targetDistanceKm * 1000;
  return clamp01(1 - Math.abs(course.distanceM - targetM) / targetM);
}

function ascentPerKm(course: RawCourse): number {
  return course.ascentM / (course.distanceM / 1000);
}

function scoreSlope(course: RawCourse, condition: RunningCondition): number {
  const perKm = ascentPerKm(course);
  switch (condition.slopePreference) {
    case 'ANY':
      return 1;
    case 'FLAT':
      return clamp01(1 - perKm / 30);
    case 'SOME_HILL':
      return clamp01(1 - Math.abs(perKm - 25) / 25);
  }
}

function scoreEnvironment(course: RawCourse, condition: RunningCondition): number {
  if (condition.environmentPreferences.length === 0) return 1;
  const matchedSum = condition.environmentPreferences.reduce((sum, pref) => {
    const found = course.environmentRatios.find((r) => r.feature === pref);
    return sum + (found?.ratio ?? 0);
  }, 0);
  return clamp01(matchedSum / condition.environmentPreferences.length);
}

function scoreExtraConditions(course: RawCourse, condition: RunningCondition): number {
  if (condition.extraConditions.length === 0) return 1;
  const scores = condition.extraConditions.map((c) => {
    if (c === 'FEW_TRAFFIC_LIGHTS') {
      if (course.trafficLightCount === null) return 0.5;
      return clamp01(1 - course.trafficLightCount / 8);
    }
    if (course.stairCount === null) return 0.5;
    return course.stairCount === 0 ? 1 : clamp01(1 - course.stairCount / 50);
  });
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}

export interface FitResult {
  fitScore: number;
  reasonText: string;
}

function buildReasonClauses(
  course: RawCourse,
  condition: RunningCondition,
  scores: { distance: number; slope: number; environment: number; extra: number },
): string[] {
  const clauses: { text: string; weight: number }[] = [];

  if (scores.distance >= 0.75) {
    clauses.push({ text: '목표 거리와 유사함', weight: scores.distance });
  }
  if (condition.slopePreference === 'FLAT' && scores.slope >= 0.7) {
    clauses.push({ text: '평탄한 구간이 많음', weight: scores.slope });
  }
  if (condition.slopePreference === 'SOME_HILL' && scores.slope >= 0.7) {
    clauses.push({ text: '적당한 오르막이 포함됨', weight: scores.slope });
  }
  const matchedEnv = condition.environmentPreferences
    .map((pref) => ({ pref, ratio: course.environmentRatios.find((r) => r.feature === pref)?.ratio ?? 0 }))
    .filter((e) => e.ratio >= 0.4)
    .sort((a, b) => b.ratio - a.ratio);
  for (const e of matchedEnv.slice(0, 2)) {
    clauses.push({ text: `${ENVIRONMENT_LABELS[e.pref]} 구간 비율이 높음`, weight: e.ratio });
  }
  if (condition.extraConditions.includes('FEW_TRAFFIC_LIGHTS') && course.trafficLightCount !== null && course.trafficLightCount <= 3) {
    clauses.push({ text: '신호등이 적음', weight: 0.8 });
  }
  if (condition.extraConditions.includes('NO_STAIRS') && course.stairCount === 0) {
    clauses.push({ text: '계단이 없음', weight: 0.8 });
  }

  return clauses
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 3)
    .map((c) => c.text);
}

export function calculateFit(course: RawCourse, condition: RunningCondition): FitResult {
  const scores = {
    distance: scoreDistance(course, condition),
    slope: scoreSlope(course, condition),
    environment: scoreEnvironment(course, condition),
    extra: scoreExtraConditions(course, condition),
  };

  const fitScore = Math.round(
    FIT_SCORE_WEIGHTS.distance * scores.distance +
      FIT_SCORE_WEIGHTS.slope * scores.slope +
      FIT_SCORE_WEIGHTS.environment * scores.environment +
      FIT_SCORE_WEIGHTS.extraConditions * scores.extra,
  );

  const clauses = buildReasonClauses(course, condition, scores);
  const reasonText = clauses.length > 0 ? `${clauses.join(' · ')} 코스예요.` : '입력하신 조건과 부분적으로만 맞는 코스예요.';

  return { fitScore, reasonText };
}
