import { Ionicons } from '@expo/vector-icons';
import { router, Tabs } from 'expo-router';
import { Image, Platform, Pressable, StyleSheet, Text } from 'react-native';

import { BrandMark } from '@/components/BrandMark';
import { Colors, Spacing, Typography } from '@/constants/theme';
import { useAuthStore } from '@/stores/authStore';
import { useProfileStore } from '@/stores/profileStore';

/**
 * 하단 탭 5개: 홈 / 추천 / 저장 / 기록 / 마이 (intent.md 17번 원본 구성).
 * 홈·추천·저장만 실제 내용이 있고, 기록·마이 일부는 아직 자리표시자다.
 *
 * results·course-detail·login·signup·location-picker도 이 Tabs 안에 있다 —
 * 탭 버튼은 없지만(href: null) 이 안에 있어야 하단 네비게이션이 그 화면들에서도
 * 계속 보인다 (Stitch 원본도 그렇다).
 *
 * 아이콘은 @expo/vector-icons(Ionicons) — Expo SDK에 기본 포함되는 무료 아이콘
 * 세트라 추가 계정·API 키가 필요 없다. Stitch 디자인이 쓴 Material Symbols와
 * 마찬가지로 선택 시 채워진 모양, 비선택 시 윤곽선만 있는 모양으로 구분한다.
 */
const TAB_ICONS: Record<string, { outline: keyof typeof Ionicons.glyphMap; filled: keyof typeof Ionicons.glyphMap }> = {
  index: { outline: 'home-outline', filled: 'home' },
  recommend: { outline: 'compass-outline', filled: 'compass' },
  saved: { outline: 'bookmark-outline', filled: 'bookmark' },
  records: { outline: 'list-outline', filled: 'list' },
  profile: { outline: 'person-outline', filled: 'person' },
};

/** 헤더 왼쪽 로고 — 탭 5개에서만 쓴다. 눌러도 이동할 곳이 이미 홈인 경우가 대부분이지만 통일감을 위해 홈으로 보낸다. */
function HeaderBrandMark() {
  return (
    <Pressable onPress={() => router.push('/(tabs)')} hitSlop={8} style={{ marginLeft: Spacing.lg }}>
      <BrandMark height={22} />
    </Pressable>
  );
}

/**
 * 헤더 오른쪽 — 로그인 상태면 마이페이지로 가는 프로필 아이콘, 아니면 로그인 버튼. 탭 5개 공통.
 * 프로필 사진이 있으면(profileStore, 세션 바뀔 때마다 app/_layout.tsx가 채워준다) 아이콘 대신
 * 그 사진을 동그랗게 보여준다 — 마이페이지에서 사진을 바꾸면 이 헤더에도 바로 반영된다.
 */
function HeaderAuthAction() {
  const session = useAuthStore((s) => s.session);
  const avatarUrl = useProfileStore((s) => s.profile?.avatarUrl);
  return session ? (
    <Pressable onPress={() => router.push('/(tabs)/profile')} hitSlop={8} style={{ marginRight: Spacing.lg }}>
      {avatarUrl ? (
        <Image source={{ uri: avatarUrl }} style={styles.headerAvatar} />
      ) : (
        <Ionicons name="person-circle-outline" size={26} color={Colors.textSecondary} />
      )}
    </Pressable>
  ) : (
    <Pressable onPress={() => router.push('/login')} hitSlop={8} style={{ marginRight: Spacing.lg }}>
      <Text style={{ ...Typography.labelMd, color: Colors.primary, fontWeight: '700' }}>로그인</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  headerAvatar: { width: 26, height: 26, borderRadius: 13 },
});

/** 탭 5개(홈/추천/저장/기록/마이) 헤더 공통 옵션 — 왼쪽 로고, 가운데 메뉴명, 오른쪽 로그인/프로필. */
const mainTabHeaderOptions = {
  headerLeft: () => <HeaderBrandMark />,
  headerRight: () => <HeaderAuthAction />,
};

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={({ route }) => ({
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.textMuted,
        // 사파리(모바일 웹)에서 홈 인디케이터가 있는 기기는 이 여백이 없으면 하단
        // 탭바가 사파리 자체 하단 여백과 겹쳐 살짝 잘려 보인다(2026-09-17 확인).
        // env(safe-area-inset-bottom)은 app/+html.tsx에 viewport-fit=cover를 넣어야
        // 0이 아닌 값을 준다 — 네이티브에서는 이 스타일 자체가 적용되지 않는다.
        //
        // paddingBottom만 추가하면 탭바 아이콘이 잘린다(2026-09-18 확인) — expo-router의
        // 탭바는 기본 높이를 49px 고정값으로 계산해 내려주는데, 그 위에 paddingBottom만
        // 얹으면 box-sizing:border-box라 콘텐츠(아이콘+라벨) 영역이 49px - inset만큼으로
        // 눌려서 위쪽이 잘린다. height도 같이 늘려서 padding이 높이를 "차지"하지 않고
        // "추가"되도록 해야 한다.
        //
        // 게다가 기본 49px은 애플이 자기 시스템 폰트(SF Pro) 기준으로 딱 맞춘 값이라
        // 여유가 거의 없다 — 라벨(홈/추천/저장/기록/마이)이 웹에서는 react-navigation이
        // 지정한 라틴 전용 폰트 스택(system-ui, Segoe UI, Roboto...)에 한글이 없어서
        // 브라우저가 OS 한글 폰트로 대체해서 그리는데, 그 대체 폰트의 줄 높이가 SF Pro보다
        // 커서 빠듯한 49px 안에서 글자 아래쪽이 살짝씩 잘린다(2026-09-18 확인, "하단 글자가
        // 잘린다" 요청). 49 → 58로 키워서 라벨에 확실한 여유를 준다.
        tabBarStyle: {
          backgroundColor: Colors.backgroundBase,
          borderTopColor: Colors.border,
          ...(Platform.OS === 'web'
            ? {
                height: 'calc(58px + env(safe-area-inset-bottom))' as unknown as number,
                paddingBottom: 'env(safe-area-inset-bottom)' as unknown as number,
              }
            : null),
        },
        tabBarLabelStyle: Platform.OS === 'web' ? { fontSize: 11, lineHeight: 15 } : undefined,
        headerStyle: { backgroundColor: Colors.backgroundBase },
        headerTintColor: Colors.textPrimary,
        headerTitleStyle: { ...Typography.titleMd },
        headerTitleAlign: 'center', // 로고(왼쪽)·메뉴명(가운데)·로그인 상태(오른쪽) 3분할 구조라 가운데 정렬로 통일한다
        headerShadowVisible: false,
        tabBarIcon: ({ focused, color, size }) => {
          const icon = TAB_ICONS[route.name];
          if (!icon) return null; // 탭 버튼이 없는(href: null) 화면은 아이콘도 필요 없다
          return <Ionicons name={focused ? icon.filled : icon.outline} color={color} size={size} />;
        },
      })}
    >
      <Tabs.Screen name="index" options={{ title: '홈', tabBarLabel: '홈', ...mainTabHeaderOptions }} />
      <Tabs.Screen name="recommend" options={{ title: '추천', tabBarLabel: '추천', ...mainTabHeaderOptions }} />
      <Tabs.Screen name="saved" options={{ title: '저장한 코스', tabBarLabel: '저장', ...mainTabHeaderOptions }} />
      <Tabs.Screen name="records" options={{ title: '러닝 기록', tabBarLabel: '기록', ...mainTabHeaderOptions }} />
      <Tabs.Screen name="profile" options={{ title: '마이페이지', tabBarLabel: '마이', ...mainTabHeaderOptions }} />

      {/* 아래는 탭 버튼 없이(href: null) 하단 네비게이션 안에서만 열리는 화면들 — 헤더는 기본(뒤로가기+제목)을 그대로 쓴다 */}
      <Tabs.Screen name="course-search-loading" options={{ headerShown: false, href: null }} />
      <Tabs.Screen name="results" options={{ title: '추천 결과', href: null }} />
      <Tabs.Screen name="course-detail/[candidateId]" options={{ headerShown: false, href: null }} />
      <Tabs.Screen name="login" options={{ headerShown: false, href: null }} />
      <Tabs.Screen name="signup" options={{ headerShown: false, href: null }} />
      <Tabs.Screen name="consent" options={{ headerShown: false, href: null }} />
      <Tabs.Screen name="location-picker" options={{ headerShown: false, href: null }} />
      <Tabs.Screen name="running" options={{ headerShown: false, href: null }} />
      <Tabs.Screen name="run-complete" options={{ headerShown: false, href: null }} />
      <Tabs.Screen name="records/[courseId]" options={{ headerShown: false, href: null }} />
      <Tabs.Screen name="profile-edit" options={{ headerShown: false, href: null }} />
      <Tabs.Screen name="change-password" options={{ headerShown: false, href: null }} />
      <Tabs.Screen name="terms" options={{ headerShown: false, href: null }} />
      <Tabs.Screen name="privacy" options={{ headerShown: false, href: null }} />
    </Tabs>
  );
}
