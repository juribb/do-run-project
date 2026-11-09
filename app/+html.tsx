/**
 * 웹 정적 export의 루트 HTML 문서. Expo Router 기본 템플릿(공식 문서 예시)에서
 * viewport meta에 `viewport-fit=cover`만 추가했다 — 이게 없으면 iOS Safari에서
 * `env(safe-area-inset-bottom)`이 항상 0으로 취급돼서, 홈 인디케이터가 있는 기기의
 * 사파리 주소창/하단 여백과 겹쳐 하단 탭바가 살짝 잘려 보인다(2026-09-17 확인).
 * (tabs)/_layout.tsx의 tabBarStyle이 이 값을 읽어서 하단 여백을 확보한다.
 */
import { ScrollViewStyleReset } from 'expo-router/html';
import { type PropsWithChildren } from 'react';

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="ko">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover" />
        <ScrollViewStyleReset />
      </head>
      <body>{children}</body>
    </html>
  );
}
