/**
 * 추천 흐름에서 쓰는 타입.
 *
 * 지금은 Supabase DB가 없어서 이 파일이 유일한 타입 소스다.
 * Phase 1에서 실제 테이블(SPEC.md 4번)이 생기면, 여기 필드들은
 * Supabase가 생성해주는 DB 타입으로 교체될 예정 — 지금은 손으로 쓴 임시 타입.
 *
 * 필드명은 DB의 snake_case(distance_m 등)를 그대로 쓰지 않고 camelCase로 뒀다.
 * 나중에 실제 API 연동 단계에서 응답을 이 타입으로 매핑하는 어댑터 함수 하나만
 * 추가하면 되고, 화면 코드는 그대로 재사용된다.
 */

import type { EnvironmentPreference, ExtraCondition, SlopePreference, TargetDistanceKm } from '@/constants/options';

/** 사용자가 입력하는 러닝 조건 (F-01) */
export interface RunningCondition {
  targetDistanceKm: TargetDistanceKm;
  slopePreference: SlopePreference;
  /** 복수 선택 가능 */
  environmentPreferences: EnvironmentPreference[];
  /** 복수 선택 가능 */
  extraConditions: ExtraCondition[];
}

/** 코스의 환경 특성 비율 — 합이 1을 넘을 수 있다 (중첩 가능, SPEC.md 4번) */
export interface EnvironmentRatio {
  feature: EnvironmentPreference;
  /** 0~1 */
  ratio: number;
}

/** 추천 후보 하나 (recommendation_candidate에 대응, supabase/functions/recommend가 채워준다) */
export interface CourseCandidate {
  id: string;
  /** 표시용 이름. 실제 서비스에는 없는 필드일 수 있음 — 데모 편의상 추가 */
  name: string;
  /**
   * GraphHopper가 만든 실제 순환 경로 좌표. [경도, 위도, 고도(m)] 순서 (GeoJSON 관례) —
   * 지도에 그릴 때, 그리고 구간별 오르막/내리막 색 표시(고도 3번째 값)에 쓴다.
   */
  coordinates: [number, number, number][];
  distanceM: number;
  ascentM: number;
  descentM: number;
  estimatedDurationS: number;
  environmentRatios: EnvironmentRatio[];
  /** 신호등·주요 교차로 수. 데이터 확인 불가 시 null (원칙: 없는 데이터는 추정하지 않는다) */
  trafficLightCount: number | null;
  /** 계단 수. 데이터 확인 불가 시 null */
  stairCount: number | null;
  /** 0~100 */
  fitScore: number;
  /** 적합도 근거를 사람이 읽을 문장으로 표현 (지금은 템플릿, 나중에 AI로 대체 가능) */
  reasonText: string;
}
