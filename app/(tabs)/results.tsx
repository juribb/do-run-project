/**
 * 추천 결과 목록 화면 (SPEC.md 2번).
 * 전용 비교 화면은 만들지 않는다 — 후보를 눌러 상세로 이동하며 비교한다 (F-04).
 * 상단에 이번에 입력한 조건 요약(Stitch의 "적용된 조건" 캡슐)을 보여준다.
 *
 * (tabs) 그룹 안에 있지만 탭 버튼은 없다 — 하단 네비게이션을 계속 보여주기 위해서다.
 */
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CourseCard } from '@/components/CourseCard';
import { ENVIRONMENT_LABELS, SLOPE_PREFERENCE_OPTIONS } from '@/constants/options';
import { Colors, Radius, Spacing, Typography } from '@/constants/theme';
import { useRecommendationConditionStore } from '@/stores/recommendationConditionStore';
import { useRecommendationResultStore } from '@/stores/recommendationResultStore';
import { useSavedCoursesStore } from '@/stores/savedCoursesStore';
import type { RunningCondition } from '@/types/recommendation';

function summarizeCondition(condition: RunningCondition): string {
  const slopeLabel = SLOPE_PREFERENCE_OPTIONS.find((o) => o.value === condition.slopePreference)?.label ?? '';
  const parts = [
    '현재 위치',
    `${condition.targetDistanceKm}km`,
    slopeLabel,
    condition.environmentPreferences.map((p) => ENVIRONMENT_LABELS[p]).join(', '),
  ].filter(Boolean);
  return parts.join(' · ');
}

export default function RecommendationResultsScreen() {
  const candidates = useRecommendationResultStore((s) => s.candidates);
  const condition = useRecommendationConditionStore((s) => s.condition);
  const isSaved = useSavedCoursesStore((s) => s.isSaved);
  const toggleSave = useSavedCoursesStore((s) => s.toggleSave);

  if (candidates.length === 0) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>추천 결과가 없어요. 홈에서 조건을 다시 입력해주세요.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <FlatList
        data={candidates}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <>
            <Text style={styles.header}>후보 {candidates.length}개를 찾았어요</Text>
            {condition && (
              <View style={styles.conditionCapsule}>
                <View style={styles.conditionIconWrap}>
                  <MaterialIcons name="tune" size={16} color={Colors.primary} />
                </View>
                <View style={styles.conditionTextWrap}>
                  <Text style={styles.conditionLabel}>적용된 조건</Text>
                  <Text style={styles.conditionValue} numberOfLines={1}>
                    {summarizeCondition(condition)}
                  </Text>
                </View>
                <Pressable
                  onPress={() => {
                    // 추천 화면이 이 값을 보고 "새로 들어온 게 아니라 수정하러 돌아온 것"임을
                    // 알아채서 지금 선택된 조건을 초기화하지 않고 그대로 보여준다.
                    useRecommendationConditionStore.getState().markPreserveOnReturn();
                    router.back();
                  }}
                  hitSlop={8}
                >
                  <Text style={styles.conditionEdit}>조건 수정</Text>
                </Pressable>
              </View>
            )}
          </>
        }
        renderItem={({ item, index }) => (
          <CourseCard
            candidate={item}
            variant="compact"
            highlight={index === 0}
            saved={isSaved(item.id)}
            onToggleSave={() => toggleSave(item)}
            onPress={() => router.push(`/course-detail/${item.id}?from=results`)}
          />
        )}
        ItemSeparatorComponent={() => <View style={{ height: Spacing.sm }} />}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.backgroundMuted },
  list: { padding: Spacing.lg, paddingBottom: 40 },
  header: { ...Typography.bodySm, color: Colors.textMuted, marginBottom: Spacing.sm },
  conditionCapsule: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.backgroundBase,
    borderRadius: Radius.card,
    padding: Spacing.sm,
    marginBottom: Spacing.md,
  },
  conditionIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.backgroundMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  conditionTextWrap: { flex: 1, gap: 2 },
  conditionLabel: { ...Typography.labelSm, color: Colors.textSecondary },
  conditionValue: { ...Typography.titleSm, color: Colors.textPrimary },
  conditionEdit: { ...Typography.labelMd, color: Colors.primary, fontWeight: '700' },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.lg },
  emptyText: { ...Typography.bodyMd, color: Colors.textMuted, textAlign: 'center' },
});
