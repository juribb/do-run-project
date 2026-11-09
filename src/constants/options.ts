/**
 * 조건 입력(F-01)에서 쓰는 enum과, UI에 보여줄 한글 라벨 매핑.
 * UI 라벨 ↔ DB enum 매핑은 SPEC.md의 TODO(G6) 항목 — 여기서 확정한다.
 * 이모지는 Stitch 원본 디자인(환경/추가 조건 칩)에 쓰인 것을 그대로 맞췄다.
 */

export const TARGET_DISTANCE_OPTIONS = [3, 5, 7, 10] as const;
export type TargetDistanceKm = (typeof TARGET_DISTANCE_OPTIONS)[number];

export type SlopePreference = 'FLAT' | 'SOME_HILL' | 'ANY';

/** icon은 MaterialIcons(@expo/vector-icons) 아이콘명 — Stitch 원본의 선 그래픽과 가장 가까운 것으로 맞췄다 */
export const SLOPE_PREFERENCE_OPTIONS: { value: SlopePreference; label: string; description: string; icon: string }[] = [
  { value: 'FLAT', label: '평지 위주', description: '무릎 부담 없이 부드러운 코스', icon: 'trending-flat' },
  { value: 'SOME_HILL', label: '적당한 언덕', description: '자연스러운 고저차와 뷰', icon: 'trending-up' },
  { value: 'ANY', label: '상관없음', description: '모든 유형의 매력 탐색', icon: 'shuffle' },
];

export type EnvironmentPreference = 'PARK' | 'RIVERSIDE' | 'URBAN' | 'GREENERY';

export const ENVIRONMENT_PREFERENCE_OPTIONS: { value: EnvironmentPreference; label: string; icon: string }[] = [
  { value: 'PARK', label: '공원', icon: '🌿' },
  { value: 'RIVERSIDE', label: '하천', icon: '🌊' },
  { value: 'GREENERY', label: '녹지', icon: '🌲' },
  { value: 'URBAN', label: '도심', icon: '🏙️' },
];

export type ExtraCondition = 'FEW_TRAFFIC_LIGHTS' | 'NO_STAIRS';

export const EXTRA_CONDITION_OPTIONS: { value: ExtraCondition; label: string; icon: string }[] = [
  { value: 'FEW_TRAFFIC_LIGHTS', label: '신호등 적음', icon: '🚦' },
  { value: 'NO_STAIRS', label: '계단 없음', icon: '🪜' },
];

export const ENVIRONMENT_LABELS: Record<EnvironmentPreference, string> = Object.fromEntries(
  ENVIRONMENT_PREFERENCE_OPTIONS.map((o) => [o.value, o.label]),
) as Record<EnvironmentPreference, string>;
