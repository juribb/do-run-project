/**
 * app.json 대신 이 파일을 쓴다 — .env 값을 읽어와야 하기 때문이다.
 * (일반 JSON 파일은 환경변수를 읽을 수 없다.)
 *
 * Expo CLI가 `npx expo start`/`expo prebuild` 실행 시 .env 파일을 자동으로
 * process.env에 로드해준다 — dotenv를 직접 설치할 필요는 없다.
 *
 * 카카오맵: @react-native-kakao/map 라이브러리가 사실상 관리 중단 상태라 안 쓴다.
 * 대신 카카오맵 JS SDK를 올려둔 페이지(GitHub Pages)를 WebView로 띄우는 방식을 쓴다
 * (src/lib/map.ts, app/(tabs)/location-picker.tsx 참고). 이 KAKAO_NATIVE_APP_KEY는
 * 나중에 실제 지도(경로 표시 등) 기능을 붙일 때를 대비해 남겨둔다.
 */

const KAKAO_NATIVE_APP_KEY = process.env.EXPO_PUBLIC_KAKAO_NATIVE_APP_KEY;

if (!KAKAO_NATIVE_APP_KEY) {
  // 빌드 자체를 막지는 않는다 — 지도 기능을 아직 안 쓰는 단계에서도 앱을 실행할 수 있어야 한다.
  console.warn(
    '[app.config.js] EXPO_PUBLIC_KAKAO_NATIVE_APP_KEY가 비어 있습니다. .env.example을 참고해 .env를 채워주세요.',
  );
}

/** @type {import('expo/config').ExpoConfig} */
module.exports = {
  expo: {
    name: '러닝 코스 추천',
    slug: 'running-course-recommendation',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/images/icon.png',
    scheme: 'runningcourse',
    userInterfaceStyle: 'automatic',
    ios: {
      supportsTablet: true,
      // Dev Build(로컬 빌드)에는 앱을 식별할 고유 ID가 필요하다 — Expo Go에는 없던 값이라
      // 이번에 F-06을 실제 폰에서 테스트하면서 처음 추가한다.
      bundleIdentifier: 'com.jurichoi.runningcourse',
      // F-06 화면 잠금 상태에서도 GPS 기록 유지 — 러닝 중 백그라운드 위치 업데이트를 받으려면
      // 앱이 백그라운드에서 깨어날 수 있어야 한다(Dev Build 필요, Expo Go는 지원 안 함).
      infoPlist: {
        UIBackgroundModes: ['location'],
      },
    },
    android: {
      adaptiveIcon: {
        backgroundColor: '#E6F4FE',
        foregroundImage: './assets/images/android-icon-foreground.png',
        backgroundImage: './assets/images/android-icon-background.png',
        monochromeImage: './assets/images/android-icon-monochrome.png',
      },
      predictiveBackGestureEnabled: false,
    },
    web: {
      output: 'static',
      favicon: './assets/images/favicon.png',
    },
    plugins: [
      'expo-router',
      'expo-font',
      'expo-sqlite',
      [
        'expo-image-picker',
        {
          photosPermission: '프로필 사진을 선택하려면 사진 보관함 접근 권한이 필요해요.',
        },
      ],
      [
        'expo-location',
        {
          locationWhenInUsePermission: '현재 위치 기준으로 러닝 코스를 추천하려면 위치 권한이 필요해요.',
          // F-06: 러닝 중 화면을 잠가도 경로가 끊기지 않으려면 "항상 허용" 권한과 백그라운드
          // 위치 업데이트가 필요하다 — Expo Go에서는 동작하지 않고 Dev Build가 있어야 한다.
          locationAlwaysAndWhenInUsePermission: '러닝 중 화면이 꺼져도 경로를 계속 기록하려면 위치 권한이 "항상 허용"으로 설정돼야 해요.',
          isAndroidBackgroundLocationEnabled: true,
        },
      ],
      'expo-task-manager',
      [
        'expo-splash-screen',
        {
          image: './assets/images/splash-icon.png',
          imageWidth: 200,
          resizeMode: 'contain',
          backgroundColor: '#FFFFFF',
          dark: {
            backgroundColor: '#000000',
          },
        },
      ],
    ],
    experiments: {
      typedRoutes: true,
      reactCompiler: true,
    },
    extra: {
      kakaoNativeAppKey: KAKAO_NATIVE_APP_KEY ?? null,
    },
  },
};
