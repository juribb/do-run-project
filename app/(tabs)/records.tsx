/**
 * "기록" 탭. Stitch "내 러닝 기록" 화면 레이아웃을 참고했지만, 실제 없는 데이터(별점 리뷰·
 * 사진·날씨)는 넣지 않고 실제로 가진 값만 쓴다. 같은 코스를 여러 번 뛴 경우 코스별로
 * 묶어서 최신 3개까지만 보여주고, 더 있으면 상세 화면(지도 포함)에서 전체를 본다 —
 * 지도를 목록에서 매번 그리면 느려지니 목록은 텍스트만으로 가볍게 유지한다.
 */
import { useEffect, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, Radius, Spacing, Typography } from '@/constants/theme';
import { formatCountOrUnknown, formatElapsedTime, formatPaceSPerKm } from '@/lib/format';
import { fetchRunningRecordGroups, type CourseRunGroup, type RunningRecordSummary } from '@/lib/runningRecords';
import { useAuthStore } from '@/stores/authStore';

function formatStartedAt(iso: string): string {
  return new Date(iso).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });
}

export default function RecordsTabScreen() {
  const session = useAuthStore((s) => s.session);
  const [groups, setGroups] = useState<CourseRunGroup[] | null>(null);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!session) {
      setGroups(null);
      return;
    }
    fetchRunningRecordGroups()
      .then(setGroups)
      .catch((e) => {
        console.error('[records] 러닝 기록 조회 실패', e);
        setGroups([]);
      });
  }, [session]);

  if (!session) {
    return (
      <SafeAreaView style={[styles.safeArea, { paddingTop: insets.top / 2 }]} edges={["left", "right", "bottom"]}>
        <View style={styles.emptyState}>
          <Text style={styles.emptyEmoji}>📋</Text>
          <Text style={styles.emptyTitle}>로그인이 필요해요</Text>
          <Text style={styles.emptyText}>러닝 기록을 보려면{'\n'}먼저 로그인해주세요.</Text>
          <Pressable style={styles.loginButton} onPress={() => router.push('/login')}>
            <Text style={styles.loginButtonText}>로그인하기</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (groups === null) {
    return (
      <SafeAreaView style={[styles.safeArea, { paddingTop: insets.top / 2 }]} edges={["left", "right", "bottom"]}>
        <View style={styles.emptyState}>
          <ActivityIndicator color={Colors.primary} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  if (groups.length === 0) {
    return (
      <SafeAreaView style={[styles.safeArea, { paddingTop: insets.top / 2 }]} edges={["left", "right", "bottom"]}>
        <View style={styles.emptyState}>
          <Text style={styles.emptyEmoji}>📋</Text>
          <Text style={styles.emptyTitle}>아직 러닝 기록이 없어요</Text>
          <Text style={styles.emptyText}>코스 상세에서{'\n'}"이 코스로 달리기"를 완료해보세요.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safeArea, { paddingTop: insets.top / 2 }]} edges={["left", "right", "bottom"]}>
      <FlatList
        data={groups}
        keyExtractor={(item) => item.courseId}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => <CourseGroupCard group={item} />}
        ItemSeparatorComponent={() => <View style={{ height: Spacing.sm }} />}
      />
    </SafeAreaView>
  );
}

function CourseGroupCard({ group }: { group: CourseRunGroup }) {
  const hasMore = group.totalCount > group.recentRuns.length;

  return (
    <Pressable style={styles.card} onPress={() => router.push(`/records/${group.courseId}`)}>
      <View style={styles.cardHeader}>
        <Text style={styles.courseName} numberOfLines={1}>
          {group.courseName}
        </Text>
        <View style={styles.countBadge}>
          <Text style={styles.countBadgeText}>{group.totalCount}회 완주</Text>
        </View>
      </View>
      <Text style={styles.courseMeta}>
        신호등 {formatCountOrUnknown(group.trafficLightCount, '개')} · 계단 {formatCountOrUnknown(group.stairCount, '개')}
      </Text>

      <View style={styles.runList}>
        {group.recentRuns.map((run) => (
          <RunRow key={run.id} run={run} />
        ))}
      </View>

      {hasMore && (
        <View style={styles.moreRow}>
          <Text style={styles.moreText}>전체 {group.totalCount}개 기록 보기</Text>
          <Ionicons name="chevron-forward" size={14} color={Colors.primary} />
        </View>
      )}
    </Pressable>
  );
}

function RunRow({ run }: { run: RunningRecordSummary }) {
  return (
    <View style={styles.runRow}>
      <Text style={styles.runDate}>{formatStartedAt(run.startedAt)}</Text>
      <View style={styles.runStats}>
        <Text style={styles.runStatText}>{(run.distanceM / 1000).toFixed(2)}km</Text>
        <Text style={styles.runStatDivider}>·</Text>
        <Text style={styles.runStatText}>{formatElapsedTime(run.durationS)}</Text>
        <Text style={styles.runStatDivider}>·</Text>
        <Text style={styles.runStatText}>{formatPaceSPerKm(run.avgPaceSPerKm)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.backgroundMuted },
  list: { paddingHorizontal: Spacing.lg, paddingBottom: 40 },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.xs, padding: Spacing.lg },
  emptyEmoji: { fontSize: 32, marginBottom: Spacing.xs },
  emptyTitle: { ...Typography.titleMd, color: Colors.textPrimary },
  emptyText: { ...Typography.bodySm, color: Colors.textMuted, textAlign: 'center' },
  loginButton: {
    marginTop: Spacing.md,
    backgroundColor: Colors.primary,
    borderRadius: Radius.control,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  loginButtonText: { ...Typography.titleSm, color: Colors.onPrimary },
  card: {
    backgroundColor: Colors.backgroundBase,
    borderRadius: Radius.card,
    padding: Spacing.md,
    gap: Spacing.xs,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.xs },
  courseName: { ...Typography.titleMd, color: Colors.textPrimary, flex: 1 },
  countBadge: {
    backgroundColor: Colors.secondaryContainer,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
  },
  countBadgeText: { ...Typography.labelSm, color: Colors.primary, fontWeight: '700' },
  courseMeta: { ...Typography.labelSm, color: Colors.textMuted },
  runList: {
    marginTop: Spacing.xs,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  runRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  runDate: { ...Typography.labelMd, color: Colors.textSecondary },
  runStats: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  runStatText: { ...Typography.labelMd, color: Colors.textPrimary, fontWeight: '600' },
  runStatDivider: { ...Typography.labelSm, color: Colors.textMuted },
  moreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingTop: Spacing.sm,
  },
  moreText: { ...Typography.labelMd, color: Colors.primary, fontWeight: '600' },
});
