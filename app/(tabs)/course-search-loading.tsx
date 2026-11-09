/**
 * 코스 탐색 로딩 화면 (Stitch "코스 탐색 로딩 중 - Serene Strides" 대응).
 * recommend.tsx에서 조건을 제출하거나(F-01), 로그인/회원가입 직후 조건을 이어 제출할 때(F-02)
 * 이 화면으로 이동해서 실제 GraphHopper/Overpass 호출이 끝날 때까지 진행 상태를 보여준다.
 *
 * 진행 단계(경로 찾기 → 코스 특성 확인 → 적합도 비교)는 실제 API가 단계별 진행률을 주지 않아서
 * 타이머로 흉내낸 것이다 — 실제 완료(성공/실패)는 fetchRecommendationCandidates의 결과로 결정된다.
 */
import { useEffect, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';

import { ENVIRONMENT_PREFERENCE_OPTIONS } from '@/constants/options';
import { Colors, makeShadow, Radius, Spacing, Typography } from '@/constants/theme';
import { fetchRecommendationCandidates } from '@/lib/recommendationFlow';
import { useRecommendationConditionStore } from '@/stores/recommendationConditionStore';
import { useRecommendationResultStore } from '@/stores/recommendationResultStore';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const PATH_LENGTH = 240;
const ROUTE_D = 'M42,176 C65,138 90,148 114,116 C138,84 158,102 196,62';

const STEPS = [
  { key: 'route', label: '경로 찾기' },
  { key: 'characteristics', label: '코스 특성 확인' },
  { key: 'fit', label: '적합도 비교' },
] as const;

export default function CourseSearchLoadingScreen() {
  const condition = useRecommendationConditionStore((s) => s.condition);
  const setCandidates = useRecommendationResultStore((s) => s.setCandidates);

  const [stepIndex, setStepIndex] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const drawAnim = useRef(new Animated.Value(0)).current;
  const rippleAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const drawLoop = Animated.loop(
      Animated.timing(drawAnim, { toValue: 1, duration: 2200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    );
    const rippleLoop = Animated.loop(
      Animated.timing(rippleAnim, { toValue: 1, duration: 2400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    );
    drawLoop.start();
    rippleLoop.start();
    return () => {
      drawLoop.stop();
      rippleLoop.stop();
    };
  }, [drawAnim, rippleAnim]);

  // 탭 네비게이터가 이 화면 인스턴스를 재사용해서, 연달아 다시 추천을 받으면(재조회) 같은
  // 인스턴스가 그대로 쓰인다 — running.tsx와 같은 이유로, condition이 바뀔 때마다(=매 요청마다
  // recommend.tsx가 새 객체를 setCondition으로 넣어준다) 단계 표시를 처음부터 다시 재생한다.
  // 이걸 안 하면 이전 요청에서 이미 stepIndex가 2(적합도 비교)까지 가 있던 상태가 그대로 남아서,
  // 새로 조회를 눌러도 "적합도 비교"에서 바로 시작한 것처럼 보인다.
  useEffect(() => {
    if (!condition) return;
    setStepIndex(0);
    const t1 = setTimeout(() => setStepIndex(1), 900);
    const t2 = setTimeout(() => setStepIndex(2), 2600);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [condition]);

  // 마찬가지로 condition이 바뀔 때마다(=매 요청마다) 실제 API 호출도 다시 실행해야 한다 —
  // 예전처럼 마운트 시 한 번만 실행하면, 화면 인스턴스가 재사용되는 두 번째 요청부터는
  // fetchRecommendationCandidates가 다시 호출되지 않아 결과 화면으로 영영 못 넘어간다.
  useEffect(() => {
    if (!condition) {
      router.replace('/recommend');
      return;
    }
    setErrorMessage(null);
    let cancelled = false;
    fetchRecommendationCandidates(condition)
      .then((candidates) => {
        if (cancelled) return;
        setCandidates(candidates);
        router.replace('/results');
      })
      .catch((e) => {
        if (cancelled) return;
        setErrorMessage(e instanceof Error ? e.message : '추천을 받아오지 못했어요. 잠시 후 다시 시도해주세요.');
      });
    return () => {
      cancelled = true;
    };
  }, [condition, setCandidates]);

  const environmentHint =
    condition && condition.environmentPreferences.length > 0
      ? condition.environmentPreferences
          .map((v) => ENVIRONMENT_PREFERENCE_OPTIONS.find((opt) => opt.value === v)?.label)
          .filter((label): label is string => Boolean(label))
          .join(' · ')
      : '균형 잡힌 코스 우선';

  const strokeDashoffset = drawAnim.interpolate({ inputRange: [0, 1], outputRange: [PATH_LENGTH, -PATH_LENGTH] });
  const rippleScale = rippleAnim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.6, 1.4, 0.6] });
  const rippleOpacity = rippleAnim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.35, 0, 0.35] });

  if (errorMessage) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.errorContent}>
          <Ionicons name="alert-circle-outline" size={40} color={Colors.textMuted} />
          <Text style={styles.errorTitle}>코스를 찾지 못했어요</Text>
          <Text style={styles.errorMessage}>{errorMessage}</Text>
          <Pressable style={styles.retryButton} onPress={() => router.replace('/recommend')}>
            <Text style={styles.retryButtonText}>조건 다시 설정하기</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.replace('/recommend')} hitSlop={12} style={styles.closeButton}>
          <Ionicons name="close" size={22} color={Colors.textSecondary} />
        </Pressable>
        <View style={styles.livePill}>
          <View style={styles.liveDot} />
          <Text style={styles.livePillText}>실시간 환경 탐색 중</Text>
        </View>
      </View>

      <View style={styles.center}>
        <View style={styles.illustrationWrap}>
          <View style={styles.glowOuter} />
          <View style={styles.glowInner} />
          {/* 웹에서는 <Svg>가 진짜 <svg> 태그를 그대로 그려서(react-native-svg), 다른
              View들과 달리 react-native-web 기본 리셋 스타일(position: relative)을 못 받는다.
              그러면 이 svg만 static으로 남는데, CSS 규칙상 static 요소는 DOM 순서와 무관하게
              absolute인 형제(glowOuter/glowInner)보다 항상 아래에 깔려서 경로 그림이 그 뒤로
              완전히 가려져 안 보였다(2026-09-17, 발표용 캡처 중 발견) — position만 맞춰주면
              된다. */}
          <Svg width={220} height={220} viewBox="0 0 240 240" style={[styles.svg]}>
            <Path
              d="M20,130 C60,95 100,160 150,125 C195,95 210,135 225,120"
              stroke="#CFE2D6"
              strokeWidth={1}
              strokeDasharray="3 4"
              fill="none"
              opacity={0.6}
            />
            <Path
              d="M35,90 C80,60 130,110 180,75 C205,60 215,80 230,70"
              stroke={Colors.border}
              strokeWidth={1}
              strokeDasharray="2 3"
              fill="none"
              opacity={0.5}
            />
            <Path d={ROUTE_D} stroke={Colors.border} strokeWidth={5.5} strokeLinecap="round" fill="none" />
            <AnimatedPath
              d={ROUTE_D}
              stroke="#0D6434"
              strokeWidth={4}
              strokeLinecap="round"
              strokeDasharray={`${PATH_LENGTH} ${PATH_LENGTH}`}
              strokeDashoffset={strokeDashoffset}
              fill="none"
            />
            <Circle cx={42} cy={176} r={10} fill="#EAFAF0" />
            <Circle cx={42} cy={176} r={5} fill={Colors.primary} />
            <Circle cx={114} cy={116} r={4.5} fill={Colors.primary} stroke="#FFFFFF" strokeWidth={2} />
            <Circle cx={196} cy={62} r={8} fill="#0D6434" />
            <Circle cx={196} cy={62} r={3} fill="#FFFFFF" />
          </Svg>
          <Animated.View
            style={[styles.ripple, { transform: [{ scale: rippleScale }], opacity: rippleOpacity }]}
            pointerEvents="none"
          />
          <View style={styles.distanceBadge}>
            <Ionicons name="leaf-outline" size={14} color={Colors.primary} />
            <Text style={styles.distanceBadgeText} numberOfLines={1}>
              {environmentHint}
            </Text>
          </View>
        </View>

        <Text style={styles.title}>조건에 맞는 코스를{'\n'}찾고 있어요</Text>
        <Text style={styles.subtitle}>거리, 경사, 주변 환경을 비교하고 있어요</Text>

        <View style={styles.stepperCard}>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${((stepIndex + 1) / STEPS.length) * 100}%` }]} />
          </View>
          <View style={styles.stepsRow}>
            {STEPS.map((step, i) => {
              const status = i < stepIndex ? 'done' : i === stepIndex ? 'active' : 'pending';
              return (
                <View key={step.key} style={styles.stepItem}>
                  <View style={[styles.stepDot, status === 'done' && styles.stepDotDone, status === 'active' && styles.stepDotActive]}>
                    {status === 'done' ? (
                      <Ionicons name="checkmark" size={16} color={Colors.onPrimary} />
                    ) : status === 'active' ? (
                      <Ionicons name="sync-outline" size={14} color={Colors.onPrimary} />
                    ) : (
                      <View style={styles.stepDotPendingInner} />
                    )}
                  </View>
                  <Text style={[styles.stepLabel, status !== 'pending' && styles.stepLabelActive]}>{step.label}</Text>
                  <Text style={styles.stepStatus}>{status === 'done' ? '완료' : status === 'active' ? '분석 중...' : '대기'}</Text>
                </View>
              );
            })}
          </View>
        </View>

        <View style={styles.hintBox}>
          <Ionicons name="location-outline" size={18} color={Colors.primary} />
          <View style={styles.hintTextWrap}>
            <Text style={styles.hintTitle}>탐색 반경 안내</Text>
            <Text style={styles.hintBody}>선택하신 출발지 기준으로 가로등 밀도와 보행 전용로를 꼼꼼하게 살피고 있어요.</Text>
          </View>
        </View>
      </View>

      <Pressable style={styles.footerButton} onPress={() => router.replace('/recommend')}>
        <Ionicons name="options-outline" size={16} color={Colors.textSecondary} />
        <Text style={styles.footerButtonText}>설정한 조건 다시 확인하기</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.backgroundBase },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xs,
  },
  closeButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.full },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: Radius.full,
    backgroundColor: '#F0F5F1',
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.primary },
  livePillText: { ...Typography.labelSm, color: Colors.primary },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.lg, gap: Spacing.md },
  illustrationWrap: { width: 220, height: 220, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.xs },
  svg: { position: 'relative' },
  glowOuter: {
    position: 'absolute',
    width: 176,
    height: 176,
    borderRadius: 88,
    backgroundColor: '#A4F5B633',
  },
  glowInner: {
    position: 'absolute',
    width: 208,
    height: 208,
    borderRadius: 104,
    backgroundColor: '#F0F5F1',
  },
  ripple: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.primary,
    top: '48%',
    left: '43%',
  },
  distanceBadge: {
    position: 'absolute',
    bottom: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderRadius: Radius.full,
    backgroundColor: Colors.backgroundBase,
    maxWidth: 200,
    ...makeShadow(Colors.textPrimary, 0.08, 8, 2),
  },
  distanceBadgeText: { ...Typography.labelSm, color: Colors.textPrimary, fontWeight: '600' },
  title: { ...Typography.headlineMd, color: Colors.textPrimary, textAlign: 'center' },
  subtitle: { ...Typography.bodyMd, color: Colors.textSecondary, textAlign: 'center', marginTop: -Spacing.xs },
  stepperCard: {
    width: '100%',
    maxWidth: 350,
    backgroundColor: Colors.backgroundBase,
    borderRadius: Radius.card,
    padding: Spacing.md,
    gap: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  progressTrack: { height: 4, borderRadius: 2, backgroundColor: Colors.backgroundMuted, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 2, backgroundColor: Colors.primary },
  stepsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  stepItem: { alignItems: 'center', gap: 4, flex: 1 },
  stepDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.backgroundMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDotDone: { backgroundColor: Colors.primary },
  stepDotActive: { backgroundColor: Colors.tertiary },
  stepDotPendingInner: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.border },
  stepLabel: { ...Typography.labelSm, color: Colors.textMuted, textAlign: 'center' },
  stepLabelActive: { color: Colors.textPrimary, fontWeight: '600' },
  stepStatus: { fontSize: 10, color: Colors.textMuted },
  hintBox: {
    width: '100%',
    maxWidth: 350,
    flexDirection: 'row',
    gap: Spacing.xs,
    backgroundColor: '#F0F5F1B3',
    borderRadius: Radius.control,
    padding: Spacing.sm,
  },
  hintTextWrap: { flex: 1, gap: 2 },
  hintTitle: { ...Typography.labelMd, color: Colors.textPrimary },
  hintBody: { ...Typography.bodySm, color: Colors.textSecondary, lineHeight: 18 },
  footerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: Spacing.md,
  },
  footerButtonText: { ...Typography.labelMd, color: Colors.textSecondary },
  errorContent: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.xl },
  errorTitle: { ...Typography.titleMd, color: Colors.textPrimary },
  errorMessage: { ...Typography.bodyMd, color: Colors.textSecondary, textAlign: 'center' },
  retryButton: {
    marginTop: Spacing.sm,
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.control,
  },
  retryButtonText: { ...Typography.titleSm, color: Colors.onPrimary },
});
