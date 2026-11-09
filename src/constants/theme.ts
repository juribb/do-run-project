/**
 * 디자인 토큰 — Stitch에서 만든 "Serene Strides" 디자인 시스템을 옮긴 것.
 * (프로젝트: projects/766532371078324743 "Travel Running Course App UI")
 *
 * Stitch가 만든 20개 화면 중 실제 컴포넌트에 쓰인 값(design.md의 "Colors"/"Components" 절)을
 * 기준으로 삼았다 — Stitch가 함께 만든 Material 스타일 자동 팔레트(JSON)와 값이 조금 다른데,
 * 그건 자동 대비 보정용이고 design.md 쪽이 실제 컴포넌트 스펙이라 이걸 따른다.
 *
 * 폰트(Plus Jakarta Sans)는 라틴/숫자 전용이고 한글은 커버하지 않는다 (design.md에 명시:
 * 한글은 시스템 폰트 사용). 우리 화면 텍스트는 대부분 한글이라 지금 단계에서는 굳이
 * 웹폰트를 새로 받지 않고 시스템 폰트 + 굵기/크기 체계만 옮긴다 (불필요한 라이브러리 회피).
 */
import { Platform } from 'react-native';

export const Colors = {
  primary: '#2F7D4A',
  primaryPressed: '#235F38',
  onPrimary: '#FFFFFF',
  secondaryContainer: '#EAF3ED', // 선택된 칩/태그 배경
  tertiary: '#4A9B6B', // 보조 인디케이터, 완료 체크
  caution: '#D9822B', // 주의 뱃지(경사 구간 등)

  backgroundBase: '#FFFFFF', // 카드, 시트 표면
  backgroundMuted: '#F8F9FA', // 화면 기본 배경, 지표 박스 배경

  textPrimary: '#1A1F1D',
  textSecondary: '#5A6560',
  textMuted: '#8C9691',

  border: '#E5E8E6',
} as const;

/** design.md "Typography" 절의 크기·굵기·줄간격을 그대로 옮김 (폰트는 시스템 기본값) */
export const Typography = {
  headlineLg: { fontSize: 26, fontWeight: '700' as const, lineHeight: 34 },
  headlineMd: { fontSize: 22, fontWeight: '700' as const, lineHeight: 30 },
  headlineSm: { fontSize: 18, fontWeight: '600' as const, lineHeight: 26 },
  titleMd: { fontSize: 16, fontWeight: '600' as const, lineHeight: 24 },
  titleSm: { fontSize: 15, fontWeight: '600' as const, lineHeight: 22 },
  bodyLg: { fontSize: 16, fontWeight: '400' as const, lineHeight: 24 },
  bodyMd: { fontSize: 14, fontWeight: '400' as const, lineHeight: 21 },
  bodySm: { fontSize: 13, fontWeight: '400' as const, lineHeight: 19 },
  labelMd: { fontSize: 12, fontWeight: '600' as const, lineHeight: 16 },
  labelSm: { fontSize: 11, fontWeight: '500' as const, lineHeight: 14 },
} as const;

/** design.md "Layout & Spacing" 절의 4px/8px 그리드 */
export const Spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20, // 화면 좌우 기본 여백
  xl: 24,
  xxl: 32,
} as const;

/** design.md "Shapes" 절 — 칩/뱃지, 버튼/인풋, 카드 순으로 라운드가 커진다 */
export const Radius = {
  chip: 8,
  control: 12,
  card: 16,
  full: 999,
} as const;

/**
 * 그림자를 플랫폼별로 만들어준다. RN(iOS)은 shadow* 개별 속성, Android는 elevation,
 * 웹은 shadow* 대신 boxShadow(CSS)를 써야 한다 — react-native-web이 최근 shadow*를
 * deprecated 처리해서 콘솔에 경고를 찍는다 (opacity/radius/offset을 CSS 문자열로 옮겨야 함).
 */
export function makeShadow(color: string, opacity: number, radius: number, offsetY: number) {
  return Platform.select({
    ios: {
      shadowColor: color,
      shadowOpacity: opacity,
      shadowRadius: radius,
      shadowOffset: { width: 0, height: offsetY },
    },
    android: { elevation: Math.round(radius / 4) },
    web: { boxShadow: `0px ${offsetY}px ${radius}px ${hexToRgba(color, opacity)}` },
    default: {},
  });
}

function hexToRgba(hex: string, alpha: number): string {
  const value = hex.replace('#', '');
  const r = parseInt(value.substring(0, 2), 16);
  const g = parseInt(value.substring(2, 4), 16);
  const b = parseInt(value.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** design.md "Elevation & Depth" Level 1(카드) 스펙을 RN 그림자로 근사 */
export const CardShadow = makeShadow(Colors.textPrimary, 0.06, 8, 2);
