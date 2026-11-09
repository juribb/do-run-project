import { Image } from 'react-native';

import { APP_NAME } from '@/constants/brand';

/** logo.png 원본 비율(2172x724) — height만 받아서 폭을 이 비율로 계산한다. */
const LOGO_ASPECT_RATIO = 2172 / 724;

/**
 * 서비스 로고. 상단 헤더(탭 레이아웃)와 로그인/회원가입 화면에서 공용으로 쓴다 —
 * 나중에 로고가 또 바뀌면 assets/images/logo.png 파일만 교체하면 전체에 반영된다.
 */
export function BrandMark({ height = 28 }: { height?: number }) {
  return (
    <Image
      source={require('@/assets/images/logo.png')}
      accessibilityLabel={APP_NAME}
      resizeMode="contain"
      style={{ height, width: height * LOGO_ASPECT_RATIO }}
    />
  );
}
