/**
 * 코스별 러닝 기록 상세. records.tsx에서 "전체 N개 기록 보기" 또는 코스 카드를 누르면 온다.
 * Stitch "러닝 기록 상세" 화면의 지도+지표 레이아웃을 참고했지만, 실제 없는 데이터
 * (별점 리뷰·사진·날씨·AI 사전예측 비교)는 넣지 않고 실제로 가진 값만 쓴다.
 * 지도는 여기서만 그린다 — 목록 화면에서 매번 그리면 느려지니 상세에서만 로딩한다.
 */
import { useCallback, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Alert, FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CourseRouteMap } from '@/components/CourseRouteMap';
import { Colors, Radius, Spacing, Typography } from '@/constants/theme';
import { formatCountOrUnknown, formatElapsedTime, formatPaceSPerKm } from '@/lib/format';
import { startRunningRecordForCourse } from '@/lib/running';
import { fetchCourseDetail, fetchRunningRecordsForCourse, type CourseDetail, type RunningRecordSummary } from '@/lib/runningRecords';
import { useActiveRunStore } from '@/stores/activeRunStore';

function formatStartedAt(iso: string): string {
  return new Date(iso).toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export default function CourseRecordDetailScreen() {
  const { courseId } = useLocalSearchParams<{ courseId: string }>();
  const [course, setCourse] = useState<CourseDetail | null | undefined>(undefined); // undefined=로딩 중, null=없음
  const [runs, setRuns] = useState<RunningRecordSummary[]>([]);
  const [starting, setStarting] = useState(false);

  async function handleStartRun() {
    if (!course || starting) return;
    setStarting(true);
    try {
      const { recordId, courseId: startedCourseId } = await startRunningRecordForCourse(course.id);
      useActiveRunStore.getState().start(recordId, startedCourseId, { id: course.id, name: course.name, coordinates: course.coordinates });
      router.push('/running');
    } catch (e) {
      console.error('[records detail] 다시 달리기 시작 실패', e);
      Alert.alert('오류', '러닝을 시작하지 못했어요. 잠시 후 다시 시도해주세요.');
    } finally {
      setStarting(false);
    }
  }

  // 탭 네비게이터가 이 화면 인스턴스를 재사용해서(같은 courseId로 "다시 달리기" 후 돌아오면
  // courseId가 안 바뀌니 mount 시 한 번만 도는 effect로는 새로 생긴 기록이 안 보인다) —
  // 화면에 포커스가 올 때마다 다시 불러온다.
  useFocusEffect(
    useCallback(() => {
      Promise.all([fetchCourseDetail(courseId), fetchRunningRecordsForCourse(courseId)])
        .then(([courseResult, runsResult]) => {
          setCourse(courseResult);
          setRuns(runsResult);
        })
        .catch((e) => {
          console.error('[records detail] 조회 실패', e);
          setCourse(null);
        });
    }, [courseId]),
  );

  const header = (
    <View style={styles.header}>
      <Pressable onPress={() => router.replace('/records')} hitSlop={12} style={styles.backButton}>
        <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
      </Pressable>
      <Text style={styles.headerTitle} numberOfLines={1}>
        {course?.name ?? '코스 기록'}
      </Text>
      <View style={styles.backButton} />
    </View>
  );

  if (course === undefined) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        {header}
        <View style={styles.centerState}>
          <ActivityIndicator color={Colors.primary} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  if (course === null) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        {header}
        <View style={styles.centerState}>
          <Text style={styles.emptyText}>코스 정보를 찾을 수 없어요.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      {header}
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {course.coordinates.length > 0 && <CourseRouteMap coordinates={course.coordinates} />}

        <View style={styles.metaCard}>
          <View style={styles.metricsRow}>
            <Metric label="거리" value={`${(course.distanceM / 1000).toFixed(1)}km`} />
            <Metric label="상승고도" value={`${course.ascentM}m`} />
            <Metric label="신호등" value={formatCountOrUnknown(course.trafficLightCount, '개')} />
            <Metric label="계단" value={formatCountOrUnknown(course.stairCount, '개')} />
          </View>
        </View>

        <Text style={styles.sectionTitle}>전체 기록 ({runs.length}개)</Text>
        <FlatList
          data={runs}
          keyExtractor={(item) => item.id}
          scrollEnabled={false}
          renderItem={({ item }) => (
            <View style={styles.runCard}>
              <Text style={styles.runDate}>{formatStartedAt(item.startedAt)}</Text>
              <View style={styles.runStatsRow}>
                <Metric label="거리" value={`${(item.distanceM / 1000).toFixed(2)}km`} compact />
                <Metric label="시간" value={formatElapsedTime(item.durationS)} compact />
                <Metric label="평균 페이스" value={formatPaceSPerKm(item.avgPaceSPerKm)} compact />
              </View>
            </View>
          )}
          ItemSeparatorComponent={() => <View style={{ height: Spacing.sm }} />}
        />
      </ScrollView>

      <View style={styles.actionBar}>
        <Pressable style={[styles.startButton, starting && styles.startButtonDisabled]} onPress={handleStartRun} disabled={starting}>
          {starting ? (
            <ActivityIndicator color={Colors.onPrimary} />
          ) : (
            <>
              <Ionicons name="play" size={18} color={Colors.onPrimary} />
              <Text style={styles.startButtonText}>다시 달리기</Text>
            </>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function Metric({ label, value, compact }: { label: string; value: string; compact?: boolean }) {
  return (
    <View style={[styles.metric, compact && styles.metricCompact]}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={compact ? styles.metricValueCompact : styles.metricValue}>{value}</Text>
    </View>
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
  headerTitle: { ...Typography.titleMd, color: Colors.textPrimary, flex: 1, textAlign: 'center' },
  centerState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.lg },
  emptyText: { ...Typography.bodyMd, color: Colors.textMuted },
  scrollContent: { padding: Spacing.lg, gap: Spacing.md, paddingBottom: 40 },
  metaCard: {
    backgroundColor: Colors.backgroundBase,
    borderRadius: Radius.card,
    padding: Spacing.md,
  },
  metricsRow: { flexDirection: 'row', gap: Spacing.xs },
  metric: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
    backgroundColor: Colors.backgroundMuted,
    borderRadius: Radius.chip,
    paddingVertical: Spacing.xs,
  },
  metricCompact: { backgroundColor: 'transparent', paddingVertical: 0 },
  metricLabel: { ...Typography.labelSm, color: Colors.textSecondary },
  metricValue: { ...Typography.titleSm, color: Colors.textPrimary },
  metricValueCompact: { ...Typography.labelMd, color: Colors.textPrimary, fontWeight: '700' },
  sectionTitle: { ...Typography.titleMd, color: Colors.textPrimary },
  runCard: {
    backgroundColor: Colors.backgroundBase,
    borderRadius: Radius.card,
    padding: Spacing.md,
    gap: Spacing.xs,
  },
  runDate: { ...Typography.labelMd, color: Colors.textSecondary },
  runStatsRow: { flexDirection: 'row' },
  actionBar: {
    padding: Spacing.md,
    backgroundColor: Colors.backgroundBase,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  startButton: {
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
