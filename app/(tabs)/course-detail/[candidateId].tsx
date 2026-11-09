/**
 * 코스 상세 화면 (SPEC.md F-04) — 추천 후보 상세 용도로 우선 구현.
 * 저장된 코스 상세와 겸용할지는 SPEC.md의 TODO — 지금은 후보 상세만 다룬다.
 *
 * 방금 받은 추천 결과에 없어도(예: 저장한 코스 목록에서 들어온 경우) 저장 스토어에서
 * 찾아서 보여준다 — 조건을 다시 입력해 추천 결과가 바뀌어도 저장한 코스는 열려야 한다.
 *
 * 하단 액션 바([저장] + [이 코스로 달리기])는 Stitch 원본 그대로 가져왔다.
 * (tabs) 그룹 안에 있지만 탭 버튼은 없다 — 하단 네비게이션을 계속 보여주기 위해서다.
 */
import { useState } from 'react';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CourseCard } from '@/components/CourseCard';
import { CourseRouteMap } from '@/components/CourseRouteMap';
import { Colors, Radius, Spacing, Typography } from '@/constants/theme';
import { startRunningRecord } from '@/lib/running';
import { useActiveRunStore } from '@/stores/activeRunStore';
import { useRecommendationResultStore } from '@/stores/recommendationResultStore';
import { useSavedCoursesStore } from '@/stores/savedCoursesStore';

/** 어디서 들어왔는지(from)에 따라 뒤로가기가 돌아갈 곳 — 안 넘어오면(예: 딥링크) 홈으로. */
const BACK_TARGET: Record<string, '/results' | '/saved' | '/(tabs)'> = {
  results: '/results',
  saved: '/saved',
  home: '/(tabs)',
};

export default function CourseDetailScreen() {
  const { candidateId, from } = useLocalSearchParams<{ candidateId: string; from?: string }>();
  const fromResults = useRecommendationResultStore((s) => s.getById(candidateId));
  const saved = useSavedCoursesStore((s) => s.saved);
  const toggleSave = useSavedCoursesStore((s) => s.toggleSave);
  const candidate = fromResults ?? saved[candidateId];

  const backTarget = BACK_TARGET[from ?? ''] ?? '/(tabs)';
  const [starting, setStarting] = useState(false);

  async function handleStartRun() {
    if (!candidate || starting) return;
    setStarting(true);
    try {
      const { recordId, courseId } = await startRunningRecord(candidate.id);
      useActiveRunStore.getState().start(recordId, courseId, candidate);
      router.push('/running');
    } catch (e) {
      console.error('[course-detail] 러닝 시작 실패', e);
      Alert.alert('오류', '러닝을 시작하지 못했어요. 잠시 후 다시 시도해주세요.');
    } finally {
      setStarting(false);
    }
  }

  const header = (
    <View style={styles.header}>
      <Pressable onPress={() => router.replace(backTarget)} hitSlop={12} style={styles.backButton}>
        <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
      </Pressable>
      <Text style={styles.headerTitle}>코스 상세</Text>
      <View style={styles.backButton} />
    </View>
  );

  if (!candidate) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        {header}
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>코스 정보를 찾을 수 없어요. 결과 목록에서 다시 시도해주세요.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const isSaved = Boolean(saved[candidate.id]);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      {header}
      <ScrollView contentContainerStyle={styles.container}>
        {candidate.coordinates.length > 0 && <CourseRouteMap coordinates={candidate.coordinates} />}
        <CourseCard candidate={candidate} variant="detail" />
      </ScrollView>

      <View style={styles.actionBar}>
        <Pressable style={styles.saveButton} onPress={() => toggleSave(candidate)}>
          <MaterialIcons name={isSaved ? 'bookmark' : 'bookmark-border'} size={20} color={Colors.textPrimary} />
          <Text style={styles.saveButtonText}>저장</Text>
        </Pressable>
        <Pressable style={[styles.startButton, starting && styles.startButtonDisabled]} onPress={handleStartRun} disabled={starting}>
          {starting ? (
            <ActivityIndicator color={Colors.onPrimary} />
          ) : (
            <>
              <MaterialIcons name="directions-run" size={20} color={Colors.onPrimary} />
              <Text style={styles.startButtonText}>이 코스로 달리기</Text>
            </>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.backgroundMuted },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.backgroundBase,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backButton: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { ...Typography.titleMd, color: Colors.textPrimary },
  container: { padding: Spacing.lg, gap: Spacing.md, paddingBottom: 100 },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.lg },
  emptyText: { ...Typography.bodyMd, color: Colors.textMuted, textAlign: 'center' },
  actionBar: {
    flexDirection: 'row',
    gap: Spacing.sm,
    padding: Spacing.md,
    backgroundColor: Colors.backgroundBase,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 52,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.control,
    backgroundColor: Colors.backgroundMuted,
  },
  saveButtonText: { ...Typography.titleSm, color: Colors.textPrimary },
  startButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    height: 52,
    borderRadius: Radius.control,
    backgroundColor: Colors.primary,
  },
  startButtonDisabled: { opacity: 0.7 },
  startButtonText: { ...Typography.titleSm, color: Colors.onPrimary },
});
