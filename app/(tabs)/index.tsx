/**
 * 홈 화면. Stitch 원본의 "홈 (Home)"/"홈 (비로그인)" 화면에 대응한다.
 * 조건 입력 폼은 이제 여기 없다 — "추천" 탭(app/(tabs)/recommend.tsx)으로 옮겼다.
 * 여기는 인사말 + 추천 시작 CTA + 저장한 코스 미리보기만 다룬다.
 */
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { CourseCard } from '@/components/CourseCard';
import { Colors, Radius, Spacing, Typography } from '@/constants/theme';
import { useAuthStore } from '@/stores/authStore';
import { useLocationStore } from '@/stores/locationStore';
import { useSavedCoursesStore } from '@/stores/savedCoursesStore';

export default function HomeScreen() {
  const session = useAuthStore((s) => s.session);
  const location = useLocationStore((s) => s.location);
  const saved = useSavedCoursesStore((s) => s.saved);
  const fetchSaved = useSavedCoursesStore((s) => s.fetchSaved);
  const savedList = Object.values(saved);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    fetchSaved();
  }, [fetchSaved, session]);

  return (
    <SafeAreaView style={[styles.safeArea, { paddingTop: insets.top / 2 }]} edges={['left', 'right', 'bottom']}>
      <ScrollView contentContainerStyle={styles.container}>
        <Pressable style={styles.locationPill} onPress={() => router.push('/location-picker')}>
          <Ionicons name="navigate-outline" size={15} color={Colors.primary} />
          <Text style={styles.locationPillText} numberOfLines={1}>
            {location ? (location.address ?? '출발 지점 설정됨') : '출발 지역을 선택해주세요'}
          </Text>
          <Text style={styles.locationPillAction}>{location ? '변경' : '지역 선택'}</Text>
        </Pressable>

        <View style={styles.greeting}>
          <Text style={styles.greetingTitle}>오늘은 어디서 달려볼까요?</Text>
          <Text style={styles.greetingSubtitle}>새로운 낯선 길도 편안하고 안전하게 달릴 수 있어요.</Text>
        </View>

        <View style={styles.ctaCard}>
          <View style={styles.ctaBadge}>
            <Ionicons name="trail-sign-outline" size={14} color={Colors.primary} />
            <Text style={styles.ctaBadgeText}>맞춤형 탐색</Text>
          </View>
          <Text style={styles.ctaTitle}>나에게 맞는 코스 찾기</Text>
          <Text style={styles.ctaDescription}>지역과 러닝 조건을 입력하면 나에게 맞는 코스를 추천해드려요.</Text>
          <Pressable
            style={({ pressed }) => [styles.ctaButton, pressed && styles.ctaButtonPressed]}
            onPress={() => router.push('/recommend')}
          >
            <Text style={styles.ctaButtonText}>나에게 맞는 코스 찾기</Text>
            <Ionicons name="arrow-forward" size={16} color={Colors.onPrimary} />
          </Pressable>
          {!session && (
            <View style={styles.ctaNotice}>
              <Ionicons name="information-circle-outline" size={14} color={Colors.textSecondary} />
              <Text style={styles.ctaNoticeText}>조건은 먼저 입력할 수 있어요. 추천을 받으려면 로그인이 필요해요.</Text>
            </View>
          )}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleRow}>
              <Text style={styles.sectionTitle}>저장한 코스</Text>
              {session && savedList.length > 0 && (
                <View style={styles.countBadge}>
                  <Text style={styles.countBadgeText}>{savedList.length}</Text>
                </View>
              )}
            </View>
            {session && savedList.length > 0 && (
              <Pressable style={styles.sectionLink} onPress={() => router.push('/saved')}>
                <Text style={styles.sectionLinkText}>전체보기</Text>
                <Ionicons name="chevron-forward" size={14} color={Colors.primary} />
              </Pressable>
            )}
          </View>

          {!session ? (
            <View style={styles.placeholderCard}>
              <View style={styles.placeholderIconWrap}>
                <Ionicons name="bookmark-outline" size={20} color={Colors.primary} />
              </View>
              <Text style={styles.placeholderTitle}>마음에 드는 코스를 모아보세요</Text>
              <Text style={styles.placeholderDescription}>로그인하면 저장한 코스를 여기서 확인할 수 있어요.</Text>
              <Pressable style={styles.placeholderButton} onPress={() => router.push('/login')}>
                <Text style={styles.placeholderButtonText}>로그인하고 시작하기</Text>
              </Pressable>
            </View>
          ) : savedList.length === 0 ? (
            <View style={styles.placeholderCard}>
              <View style={styles.placeholderIconWrap}>
                <Ionicons name="bookmark-outline" size={20} color={Colors.primary} />
              </View>
              <Text style={styles.placeholderTitle}>아직 저장한 코스가 없어요</Text>
              <Text style={styles.placeholderDescription}>추천 결과나 코스 상세에서 북마크를 눌러 저장해보세요.</Text>
            </View>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.savedScroll}>
              {savedList.slice(0, 5).map((candidate) => (
                <View key={candidate.id} style={styles.savedCardWrap}>
                  <CourseCard
                    candidate={candidate}
                    variant="compact"
                    onPress={() => router.push(`/course-detail/${candidate.id}?from=home`)}
                  />
                </View>
              ))}
            </ScrollView>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.backgroundBase },
  container: { paddingHorizontal: Spacing.lg, gap: Spacing.xl, paddingBottom: 60 },
  locationPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    maxWidth: '100%',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 8,
    borderRadius: Radius.full,
    backgroundColor: Colors.backgroundMuted,
  },
  locationPillText: { ...Typography.labelMd, color: Colors.textPrimary, flexShrink: 1 },
  locationPillAction: { ...Typography.labelSm, color: Colors.primary },
  greeting: { gap: 4 },
  greetingTitle: { ...Typography.headlineMd, color: Colors.textPrimary },
  greetingSubtitle: { ...Typography.bodySm, color: Colors.textMuted },
  ctaCard: {
    backgroundColor: Colors.backgroundMuted,
    borderRadius: Radius.card,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  ctaBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  ctaBadgeText: { ...Typography.labelMd, color: Colors.primary },
  ctaTitle: { ...Typography.headlineSm, color: Colors.textPrimary },
  ctaDescription: { ...Typography.bodySm, color: Colors.textSecondary, lineHeight: 20 },
  ctaButton: {
    marginTop: Spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    height: 52,
    borderRadius: Radius.full,
    backgroundColor: Colors.primary,
  },
  ctaButtonPressed: { backgroundColor: Colors.primaryPressed },
  ctaButtonText: { ...Typography.titleSm, color: Colors.onPrimary },
  ctaNotice: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, paddingTop: 2 },
  ctaNoticeText: { ...Typography.labelSm, color: Colors.textSecondary, flex: 1, lineHeight: 16 },
  section: { gap: Spacing.sm },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sectionTitle: { ...Typography.titleMd, color: Colors.textPrimary },
  countBadge: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    borderRadius: 10,
    backgroundColor: Colors.secondaryContainer,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countBadgeText: { ...Typography.labelSm, color: Colors.primary, fontWeight: '700' },
  sectionLink: { flexDirection: 'row', alignItems: 'center' },
  sectionLinkText: { ...Typography.labelMd, color: Colors.primary },
  placeholderCard: {
    backgroundColor: Colors.backgroundBase,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.card,
    padding: Spacing.lg,
    alignItems: 'center',
    gap: Spacing.xs,
  },
  placeholderIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.backgroundMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  placeholderTitle: { ...Typography.titleSm, color: Colors.textPrimary, textAlign: 'center' },
  placeholderDescription: { ...Typography.bodySm, color: Colors.textMuted, textAlign: 'center' },
  placeholderButton: {
    marginTop: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
    backgroundColor: Colors.secondaryContainer,
  },
  placeholderButtonText: { ...Typography.labelMd, color: Colors.primary, fontWeight: '700' },
  savedScroll: { gap: Spacing.sm, paddingRight: Spacing.lg },
  savedCardWrap: { width: 260 },
});
