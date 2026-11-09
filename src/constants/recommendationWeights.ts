/**
 * 적합도 계산에 쓰는 축별 가중치 (SPEC.md 5번 — "가중치 값 자체는 TODO").
 * 지금은 코드 상수로 하드코딩한다. 실제 데이터로 튜닝하기 전까지의 잠정값.
 * 네 값의 합은 100이어야 한다.
 */
export const FIT_SCORE_WEIGHTS = {
  distance: 40,
  slope: 25,
  environment: 25,
  extraConditions: 10,
} as const;
