/**
 * 추천 조건 입력 화면 (SPEC.md F-01). Stitch 원본의 "러닝 조건 설정" 화면에 대응한다.
 * 홈 화면의 "나에게 맞는 코스 찾기" 카드를 누르면 여기로 온다.
 *
 * '추천 받기'를 누르면 로그인 여부를 확인한다 (F-02). 로그인 상태면 바로 추천을 실행하고,
 * 아니면 조건을 스토어에 저장해둔 채 로그인 화면으로 보낸다 — 로그인 성공 시 login.tsx가
 * 이 조건을 그대로 읽어서 추천을 이어서 실행한다 (intent.md 원칙 9).
 */
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { useCallback, useRef, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Chip } from '@/components/Chip';
import {
  ENVIRONMENT_PREFERENCE_OPTIONS,
  EXTRA_CONDITION_OPTIONS,
  SLOPE_PREFERENCE_OPTIONS,
  TARGET_DISTANCE_OPTIONS,
  type EnvironmentPreference,
  type ExtraCondition,
  type SlopePreference,
  type TargetDistanceKm,
} from '@/constants/options';
import { Colors, Radius, Spacing, Typography } from '@/constants/theme';
import { useAuthStore } from '@/stores/authStore';
import { useLocationStore } from '@/stores/locationStore';
import { useRecommendationConditionStore } from '@/stores/recommendationConditionStore';
import type { RunningCondition } from '@/types/recommendation';

function toggleInArray<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

export default function RecommendConditionScreen() {
  const [targetDistanceKm, setTargetDistanceKm] = useState<TargetDistanceKm>(5);
  const [slopePreference, setSlopePreference] = useState<SlopePreference>('ANY');
  const [environmentPreferences, setEnvironmentPreferences] = useState<EnvironmentPreference[]>([]);
  const [extraConditions, setExtraConditions] = useState<ExtraCondition[]>([]);

  const setCondition = useRecommendationConditionStore((s) => s.setCondition);
  const session = useAuthStore((s) => s.session);
  const location = useLocationStore((s) => s.location);
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);

  // 이 화면은 탭 화면이라 결과를 본 뒤에도 계속 마운트된 채로 남아있어서(react-navigation
  // 탭 네비게이터 기본 동작), 그냥 두면 이전에 골랐던 조건과 스크롤 위치가 그대로 남아있다.
  // 스크롤은 "조건 수정"으로 돌아온 경우를 포함해 포커스를 받을 때마다 항상 맨 위로
  // 되돌린다(2026-09-18, "다시 들어갔을 때 스크롤이 항상 상단이었으면 좋겠다" 요청).
  // 조건 값은 "조건 수정"으로 돌아온 경우(results.tsx가 markPreserveOnReturn()을 남겨둔다)만
  // 예외로 유지하고, 그 외에는 초기값으로 되돌린다(2026-09-18, "이전 선택이 유지되는 걸
  // 초기화해달라" 요청).
  useFocusEffect(
    useCallback(() => {
      scrollRef.current?.scrollTo({ y: 0, animated: false });
      const shouldPreserve = useRecommendationConditionStore.getState().consumePreserveOnReturn();
      if (shouldPreserve) return;
      setTargetDistanceKm(5);
      setSlopePreference('ANY');
      setEnvironmentPreferences([]);
      setExtraConditions([]);
    }, [])
  );

  function handleSubmit() {
    const condition: RunningCondition = {
      targetDistanceKm,
      slopePreference,
      environmentPreferences,
      extraConditions,
    };
    setCondition(condition);

    if (!session) {
      // login.tsx가 이 스토어의 condition을 그대로 읽어서 로그인 후 추천을 이어간다.
      router.push('/login');
      return;
    }

    // 실제 API 호출과 진행 상태 표시는 course-search-loading.tsx가 맡는다.
    router.push('/course-search-loading');
  }

  return (
    <SafeAreaView style={[styles.safeArea, { paddingTop: insets.top / 2 }]} edges={['left', 'right', 'bottom']}>
      <ScrollView ref={scrollRef} contentContainerStyle={styles.container}>
        <Text style={styles.title}>어떤 러닝을 원하세요?</Text>
        <Text style={styles.subtitle}>현재 위치 기준으로 실제 순환 경로를 찾아드려요.</Text>

        <Pressable style={styles.locationRow} onPress={() => router.push('/location-picker')}>
          <View style={styles.locationIconWrap}>
            <Ionicons name="location-outline" size={18} color={Colors.textSecondary} />
          </View>
          <View style={styles.locationTextWrap}>
            <Text style={styles.locationLabel}>출발 지점</Text>
            <Text style={styles.locationValue} numberOfLines={1}>
              {location
                ? (location.address ?? `위도 ${location.lat.toFixed(4)}, 경도 ${location.lng.toFixed(4)}`)
                : '현재 위치 (지도에서 확인·변경)'}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
        </Pressable>

        <Section index="01" title="목표 거리">
          <View style={styles.row}>
            {TARGET_DISTANCE_OPTIONS.map((km) => (
              <Chip
                key={km}
                label={`${km}km`}
                selected={targetDistanceKm === km}
                onPress={() => setTargetDistanceKm(km)}
              />
            ))}
          </View>
        </Section>

        <View style={styles.divider} />

        <Section index="02" title="경사 선호">
          <View style={styles.inclineRow}>
            {SLOPE_PREFERENCE_OPTIONS.map((opt) => {
              const selected = slopePreference === opt.value;
              return (
                <Pressable
                  key={opt.value}
                  style={[styles.inclineCard, selected && styles.inclineCardSelected]}
                  onPress={() => setSlopePreference(opt.value)}
                >
                  <View style={[styles.inclineIconWrap, selected && styles.inclineIconWrapSelected]}>
                    <MaterialIcons
                      name={opt.icon as keyof typeof MaterialIcons.glyphMap}
                      size={18}
                      color={selected ? Colors.primary : Colors.textSecondary}
                    />
                  </View>
                  <Text style={styles.inclineLabel}>{opt.label}</Text>
                  <Text style={styles.inclineDescription}>{opt.description}</Text>
                </Pressable>
              );
            })}
          </View>
        </Section>

        <View style={styles.divider} />

        <Section index="03" title="환경 선호" hint="하나만 선택 가능">
          <View style={styles.row}>
            {ENVIRONMENT_PREFERENCE_OPTIONS.map((opt) => (
              <Chip
                key={opt.value}
                label={opt.label}
                icon={opt.icon}
                selected={environmentPreferences.includes(opt.value)}
                // 환경 선호는 단일 선택이다(2026-09-17, "중복 선택 불가능하게 해달라" 요청)
                // — 이미 선택된 걸 다시 누르면 선택 해제(조건 없음)되고, 다른 걸 누르면
                // 그걸로 교체된다. 추가 조건(04)은 여전히 다중 선택이라 toggleInArray를
                // 그대로 쓴다.
                onPress={() =>
                  setEnvironmentPreferences((prev) => (prev.includes(opt.value) ? [] : [opt.value]))
                }
              />
            ))}
          </View>
        </Section>

        <View style={styles.divider} />

        <Section index="04" title="추가 조건" hint="복수 선택 가능">
          <View style={styles.row}>
            {EXTRA_CONDITION_OPTIONS.map((opt) => (
              <Chip
                key={opt.value}
                label={opt.label}
                icon={opt.icon}
                selected={extraConditions.includes(opt.value)}
                onPress={() => setExtraConditions((prev) => toggleInArray(prev, opt.value))}
              />
            ))}
          </View>
        </Section>

        <Pressable style={({ pressed }) => [styles.submitButton, pressed && styles.submitButtonPressed]} onPress={handleSubmit}>
          <Text style={styles.submitButtonText}>추천 받기</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({
  index,
  title,
  hint,
  children,
}: {
  index: string;
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionTitleRow}>
          <Text style={styles.sectionIndex}>{index}</Text>
          <Text style={styles.sectionTitle}>{title}</Text>
        </View>
        {hint && <Text style={styles.sectionHint}>{hint}</Text>}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.backgroundBase },
  container: { paddingHorizontal: Spacing.lg, gap: Spacing.lg, paddingBottom: 60 },
  title: { ...Typography.headlineMd, color: Colors.textPrimary },
  subtitle: { ...Typography.bodySm, color: Colors.textMuted },
  divider: { height: 1, backgroundColor: Colors.border },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.sm,
    borderRadius: Radius.card,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.backgroundBase,
  },
  locationIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.backgroundMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  locationTextWrap: { gap: 2 },
  locationLabel: { ...Typography.labelSm, color: Colors.textMuted },
  locationValue: { ...Typography.titleSm, color: Colors.textPrimary },
  section: { gap: Spacing.sm },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  sectionIndex: { ...Typography.labelMd, color: Colors.primary },
  sectionTitle: { ...Typography.titleMd, color: Colors.textPrimary },
  sectionHint: { ...Typography.labelSm, color: Colors.textMuted },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs },
  inclineRow: { flexDirection: 'row', gap: Spacing.xs },
  inclineCard: {
    flex: 1,
    padding: Spacing.sm,
    borderRadius: Radius.card,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.backgroundBase,
    alignItems: 'center',
    gap: 4,
  },
  inclineCardSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.secondaryContainer,
  },
  inclineIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.backgroundMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  inclineIconWrapSelected: { backgroundColor: Colors.backgroundBase },
  inclineLabel: { ...Typography.labelMd, color: Colors.textPrimary, fontWeight: '700', textAlign: 'center' },
  inclineDescription: { ...Typography.labelSm, color: Colors.textMuted, textAlign: 'center' },
  submitButton: {
    marginTop: Spacing.xs,
    backgroundColor: Colors.primary,
    paddingVertical: Spacing.md,
    borderRadius: Radius.control,
    alignItems: 'center',
  },
  submitButtonPressed: {
    backgroundColor: Colors.primaryPressed,
  },
  submitButtonText: {
    color: Colors.onPrimary,
    ...Typography.titleSm,
  },
});
