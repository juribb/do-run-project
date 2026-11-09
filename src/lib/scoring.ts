/**
 * 조건과 코스 특성을 대조해 적합도 점수·추천 이유를 계산하는 순수 함수.
 * 이 파일은 "데이터가 어디서 왔는지" 모른다 — supabase/functions/recommend/scoring.ts에
 * 로직을 100% 동일하게 복제해서 쓴다 (가중치·판단 기준을 바꿀 때는 두 파일을 같이 고칠 것).
 *
 * 원칙 (intent.md 03): 적합도는 항상 축별 근거와 함께 계산하고,
 * AI는 이 계산 결과를 문장으로 다듬는 역할만 한다 (지금은 AI 없이 템플릿으로 대체).
 */
import { ENVIRONMENT_LABELS } from '@/constants/options';
import { FIT_SCORE_WEIGHTS } from '@/constants/recommendationWeights';
import type { RunningCondition, EnvironmentRatio } from '@/types/recommendation';

export interface RawCourse {
  distanceM: number;
  ascentM: number;
  environmentRatios: EnvironmentRatio[];
  trafficLightCount: number | null;
  stairCount: number | null;
}

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
      // 1km당 상승고도 30m 이상이면 "평탄"과 거리가 멀다고 본다.
      return clamp01(1 - perKm / 30);
    case 'SOME_HILL':
      // 1km당 25m 상승을 "적당한 오르막"의 기준점으로 삼는다.
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
      // 데이터 확인 불가(null)면 가산도 감점도 하지 않는다 (원칙: 없는 데이터로 판단하지 않는다).
      if (course.trafficLightCount === null) return 0.5;
      return clamp01(1 - course.trafficLightCount / 8);
    }
    // NO_STAIRS
    if (course.stairCount === null) return 0.5;
    return course.stairCount === 0 ? 1 : clamp01(1 - course.stairCount / 50);
  });
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}

export interface FitResult {
  fitScore: number;
  reasonText: string;
}

/** 근거 문장 조각들. 점수가 일정 수준 이상인 축만 이유로 채택한다. */
function buildReasonClauses(course: RawCourse, condition: RunningCondition, scores: {
  distance: number;
  slope: number;
  environment: number;
  extra: number;
}): string[] {
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

/**
 * 적합도(0~100)와 이유 문장을 계산한다.
 * 이유 문장은 지금은 템플릿 조합 — AI 연동 전까지의 대체 구현이며,
 * 서버에 AI를 붙여도 실패 시 여기로 폴백하는 구조를 유지할 예정 (SPEC.md 6번).
 */
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
  const reasonText =
    clauses.length > 0
      ? `${clauses.join(' · ')} 코스예요.`
      : '입력하신 조건과 부분적으로만 맞는 코스예요.';

  return { fitScore, reasonText };
}
