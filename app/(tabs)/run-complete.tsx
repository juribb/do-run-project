/**
 * 러닝 완료 및 코스 평가 화면 (Stitch "러닝 완료 및 코스 평가 - Serene Strides" 대응).
 * running.tsx에서 러닝을 끝내고 저장(complete_running_record)까지 성공하면 이 화면으로 온다.
 *
 * Stitch 원본에는 "완주 경로 100% 일치", "예상 시간 대비 -1분46초 단축"도 있었지만,
 * 실제로 계산할 데이터가 없어서(예상 시간을 코스에 저장해두지 않음) 지어내지 않고 뺐다 —
 * intent.md 원칙(존재하지 않는 데이터를 임의로 만들지 않는다)과 같은 이유다. 반면
 * "문제 신고하기"는 course_report 테이블이 이미 있어서(migration 0001/0003, 그동안
 * 클라이언트에서 안 썼을 뿐) 실제로 붙였다. 만족도·조건 일치도·좋았던 점·후기·신고 사유는
 * 전부 사용자가 직접 입력하는 값이라 그대로 옮겼다.
 *
 * 평가는 코스 하나당 1개(course_reviews, user_id+course_id unique)라, 같은 코스를 n번째
 * 뛰면 이전 평가를 불러와서 그대로 보여주고 수정할 수 있게 한다(fetchMyCourseReview).
 * 신고(course_report)는 러닝 기록당 여러 건 가능하고 제출 후 수정하지 않는 값이라
 * 되불러오지 않는다 — 그 자리에서 접수만 한다.
 */
import { useEffect, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Chip } from '@/components/Chip';
import { CourseRouteMap } from '@/components/CourseRouteMap';
import { Colors, Radius, Spacing, Typography } from '@/constants/theme';
import { COURSE_REPORT_REASON_OPTIONS, submitCourseReport, type CourseReportReason } from '@/lib/courseReports';
import { fetchMyCourseReview, upsertCourseReview, type MatchScore, type Satisfaction } from '@/lib/courseReviews';
import { formatElapsedTime, formatPaceSPerKm } from '@/lib/format';
import { fetchCourseDetail } from '@/lib/runningRecords';
import { useRunCompletionStore } from '@/stores/runCompletionStore';

const SATISFACTION_OPTIONS: { value: Satisfaction; label: string }[] = [
  { value: 1, label: '아쉬워요' },
  { value: 2, label: '그저 그래요' },
  { value: 3, label: '괜찮았어요' },
  { value: 4, label: '좋았어요' },
  { value: 5, label: '최고였어요' },
];

const MATCH_SCORE_OPTIONS: { value: MatchScore; label: string }[] = [
  { value: 25, label: '거의 안 맞음' },
  { value: 50, label: '보통' },
  { value: 75, label: '대체로 일치' },
  { value: 100, label: '완벽히 일치' },
];

const LIKED_TAG_OPTIONS = ['쾌적한 노면', '가로등/시야 확보', '신호등 대기 없음', '경사 완만함', '안전한 보행로'];

const COMMENT_MAX_LENGTH = 150;

function formatCompletedAt(): string {
  return new Date().toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export default function RunCompleteScreen() {
  const summary = useRunCompletionStore((s) => s.summary);

  const [coordinates, setCoordinates] = useState<[number, number, number][]>([]);
  const [loadingReview, setLoadingReview] = useState(true);
  const [saving, setSaving] = useState(false);

  const [satisfaction, setSatisfaction] = useState<Satisfaction | null>(null);
  const [matchScore, setMatchScore] = useState<MatchScore | null>(null);
  const [likedTags, setLikedTags] = useState<string[]>([]);
  const [comment, setComment] = useState('');

  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState<CourseReportReason | null>(null);
  const [reportDetail, setReportDetail] = useState('');
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [reportSubmitted, setReportSubmitted] = useState(false);

  // 완료 요약이 없으면(예: 화면을 새로고침해서 직접 들어온 경우) 볼 게 없으니 홈으로.
  useEffect(() => {
    if (!summary) router.replace('/(tabs)');
  }, [summary]);

  useEffect(() => {
    if (!summary) return;
    setLoadingReview(true);
    Promise.all([fetchCourseDetail(summary.courseId), fetchMyCourseReview(summary.courseId)])
      .then(([course, review]) => {
        setCoordinates(course?.coordinates ?? []);
        if (review) {
          setSatisfaction(review.satisfaction);
          setMatchScore(review.matchScore);
          setLikedTags(review.likedTags);
          setComment(review.comment ?? '');
        }
      })
      .catch((e) => console.error('[run-complete] 코스/기존 평가 조회 실패', e))
      .finally(() => setLoadingReview(false));
  }, [summary]);

  if (!summary) return null;

  function toggleTag(tag: string) {
    setLikedTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  }

  function goToRecord() {
    // summary를 먼저 비우면 위 "요약 없으면 홈으로" 효과가 그 즉시 반응해서 이 이동을
    // 덮어쓴다(course-search-loading.tsx에서 겪은 것과 같은 종류의 경합) — 그래서 여기서는
    // 안 비운다. 다음 러닝 완료 때 set()이 새 값으로 덮어쓰니 남겨둬도 문제없다.
    router.replace(`/records/${summary!.courseId}`);
  }

  async function handleSubmit() {
    if (!satisfaction) {
      Alert.alert('평가를 남겨주세요', '코스 만족도를 선택해주세요.');
      return;
    }
    setSaving(true);
    try {
      await upsertCourseReview(summary!.courseId, {
        satisfaction,
        matchScore: matchScore ?? 50,
        likedTags,
        comment: comment.trim() || null,
      });
      goToRecord();
    } catch (e) {
      console.error('[run-complete] 평가 저장 실패', e);
      Alert.alert('오류', '평가를 저장하지 못했어요. 다시 시도해주세요.');
      setSaving(false);
    }
  }

  async function handleReportSubmit() {
    if (!reportReason) {
      Alert.alert('신고 사유를 선택해주세요', '어떤 문제였는지 선택해주세요.');
      return;
    }
    setReportSubmitting(true);
    try {
      await submitCourseReport(summary!.recordId, reportReason, reportDetail.trim() || null);
      setReportSubmitted(true);
    } catch (e) {
      console.error('[run-complete] 신고 제출 실패', e);
      Alert.alert('오류', '신고를 접수하지 못했어요. 다시 시도해주세요.');
    } finally {
      setReportSubmitting(false);
    }
  }

  const livePaceLabel = formatPaceSPerKm(summary.avgPaceSPerKm);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Pressable onPress={goToRecord} hitSlop={12} style={styles.headerButton}>
          <Ionicons name="close" size={22} color={Colors.textSecondary} />
        </Pressable>
        <Text style={styles.headerTitle}>러닝 완료</Text>
        <View style={styles.headerButton} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.celebrationBadge}>
          <View style={styles.liveDot} />
          <Text style={styles.celebrationBadgeText}>완주 성공</Text>
        </View>
        <Text style={styles.title}>오늘 러닝을 완료했어요 🌿</Text>
        <Text style={styles.subtitle}>
          {summary.courseName} · {formatCompletedAt()}
        </Text>

        <View style={styles.statsCard}>
          {coordinates.length > 0 && (
            <View style={styles.mapWrap}>
              <CourseRouteMap coordinates={coordinates} />
            </View>
          )}
          <View style={styles.statsRow}>
            <Stat label="달린 거리" value={`${(summary.distanceM / 1000).toFixed(2)}km`} />
            <View style={styles.statDivider} />
            <Stat label="소요 시간" value={formatElapsedTime(summary.durationS)} />
            <View style={styles.statDivider} />
            <Stat label="평균 페이스" value={livePaceLabel} />
          </View>
        </View>

        <View style={styles.feedbackSection}>
          <Text style={styles.sectionTitle}>오늘 코스는 어땠나요?</Text>
          <Text style={styles.sectionSubtitle}>남겨주신 평가는 저장돼서 러닝 기록에서 다시 확인할 수 있어요.</Text>

          {loadingReview ? (
            <ActivityIndicator color={Colors.primary} style={styles.reviewLoading} />
          ) : (
            <>
              <Text style={styles.questionLabel}>코스 만족도</Text>
              <View style={styles.optionsRow}>
                {SATISFACTION_OPTIONS.map((opt) => (
                  <Chip key={opt.value} label={opt.label} selected={satisfaction === opt.value} onPress={() => setSatisfaction(opt.value)} />
                ))}
              </View>

              <Text style={styles.questionLabel}>원했던 조건과 잘 맞았나요?</Text>
              <View style={styles.optionsRow}>
                {MATCH_SCORE_OPTIONS.map((opt) => (
                  <Chip key={opt.value} label={opt.label} selected={matchScore === opt.value} onPress={() => setMatchScore(opt.value)} />
                ))}
              </View>

              <Text style={styles.questionLabel}>코스에서 가장 만족스러웠던 점은? (다중 선택)</Text>
              <View style={styles.optionsRow}>
                {LIKED_TAG_OPTIONS.map((tag) => (
                  <Chip key={tag} label={tag} selected={likedTags.includes(tag)} onPress={() => toggleTag(tag)} />
                ))}
              </View>

              <Text style={styles.questionLabel}>한 줄 후기를 남겨주세요 (선택)</Text>
              <TextInput
                style={styles.commentInput}
                placeholder="노면 상태, 야간 조명, 그늘 등 다음 러너를 위한 팁을 남겨주세요."
                placeholderTextColor={Colors.textMuted}
                value={comment}
                onChangeText={(text) => setComment(text.slice(0, COMMENT_MAX_LENGTH))}
                multiline
                maxLength={COMMENT_MAX_LENGTH}
              />
              <Text style={styles.charCount}>
                {comment.length} / {COMMENT_MAX_LENGTH}
              </Text>
            </>
          )}
        </View>

        <View style={styles.reportSection}>
          {reportSubmitted ? (
            <View style={styles.reportSubmittedRow}>
              <Ionicons name="checkmark-circle" size={16} color={Colors.primary} />
              <Text style={styles.reportSubmittedText}>신고가 접수됐어요. 확인 후 반영할게요.</Text>
            </View>
          ) : reportOpen ? (
            <>
              <Text style={styles.questionLabel}>어떤 문제가 있었나요?</Text>
              <View style={styles.optionsRow}>
                {COURSE_REPORT_REASON_OPTIONS.map((opt) => (
                  <Chip key={opt.value} label={opt.label} selected={reportReason === opt.value} onPress={() => setReportReason(opt.value)} />
                ))}
              </View>
              <TextInput
                style={styles.commentInput}
                placeholder="구체적으로 어떤 문제였는지 알려주세요 (선택)"
                placeholderTextColor={Colors.textMuted}
                value={reportDetail}
                onChangeText={setReportDetail}
                multiline
              />
              <View style={styles.reportButtonsRow}>
                <Pressable onPress={() => setReportOpen(false)} style={styles.reportCancelButton} disabled={reportSubmitting}>
                  <Text style={styles.reportCancelButtonText}>취소</Text>
                </Pressable>
                <Pressable
                  onPress={handleReportSubmit}
                  style={[styles.reportSubmitButton, reportSubmitting && styles.buttonDisabled]}
                  disabled={reportSubmitting}
                >
                  {reportSubmitting ? (
                    <ActivityIndicator color={Colors.onPrimary} size="small" />
                  ) : (
                    <Text style={styles.reportSubmitButtonText}>신고 제출</Text>
                  )}
                </Pressable>
              </View>
            </>
          ) : (
            <Pressable onPress={() => setReportOpen(true)} style={styles.reportLinkRow}>
              <Ionicons name="warning-outline" size={16} color={Colors.textSecondary} />
              <Text style={styles.reportLinkText}>코스에 문제가 있었나요? 문제 신고하기</Text>
            </Pressable>
          )}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Pressable style={[styles.primaryButton, saving && styles.buttonDisabled]} onPress={handleSubmit} disabled={saving}>
          {saving ? (
            <ActivityIndicator color={Colors.onPrimary} />
          ) : (
            <>
              <Text style={styles.primaryButtonText}>평가 완료</Text>
              <Ionicons name="arrow-forward" size={18} color={Colors.onPrimary} />
            </>
          )}
        </Pressable>
        <Pressable style={styles.skipButton} onPress={goToRecord} disabled={saving}>
          <Text style={styles.skipButtonText}>다음에 하기</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
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
  },
  headerButton: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { ...Typography.titleMd, color: Colors.textPrimary },
  scrollContent: { padding: Spacing.lg, gap: Spacing.md, paddingBottom: 40 },
  celebrationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: Radius.full,
    backgroundColor: Colors.secondaryContainer,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.primary },
  celebrationBadgeText: { ...Typography.labelSm, color: Colors.primary, fontWeight: '700' },
  title: { ...Typography.headlineMd, color: Colors.textPrimary },
  subtitle: { ...Typography.bodyMd, color: Colors.textSecondary, marginTop: -Spacing.xs },
  statsCard: {
    backgroundColor: Colors.backgroundBase,
    borderRadius: Radius.card,
    padding: Spacing.md,
    gap: Spacing.md,
  },
  mapWrap: { height: 180, borderRadius: Radius.control, overflow: 'hidden' },
  statsRow: { flexDirection: 'row', alignItems: 'center' },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  statDivider: { width: 1, height: 32, backgroundColor: Colors.border },
  statLabel: { ...Typography.labelSm, color: Colors.textMuted },
  statValue: { ...Typography.titleMd, color: Colors.textPrimary },
  feedbackSection: {
    backgroundColor: Colors.backgroundBase,
    borderRadius: Radius.card,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  sectionTitle: { ...Typography.titleMd, color: Colors.textPrimary },
  sectionSubtitle: { ...Typography.bodySm, color: Colors.textSecondary, marginTop: -Spacing.xs },
  reviewLoading: { marginVertical: Spacing.lg },
  questionLabel: { ...Typography.labelMd, color: Colors.textPrimary, marginTop: Spacing.sm },
  optionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs },
  commentInput: {
    ...Typography.bodyMd,
    color: Colors.textPrimary,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.control,
    padding: Spacing.sm,
    minHeight: 72,
    textAlignVertical: 'top',
  },
  charCount: { ...Typography.labelSm, color: Colors.textMuted, textAlign: 'right' },
  reportSection: {
    backgroundColor: Colors.backgroundBase,
    borderRadius: Radius.card,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  reportLinkRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  reportLinkText: { ...Typography.labelMd, color: Colors.textSecondary, textDecorationLine: 'underline' },
  reportSubmittedRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  reportSubmittedText: { ...Typography.labelMd, color: Colors.primary },
  reportButtonsRow: { flexDirection: 'row', gap: Spacing.xs },
  reportCancelButton: {
    flex: 1,
    height: 44,
    borderRadius: Radius.control,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reportCancelButtonText: { ...Typography.labelMd, color: Colors.textSecondary },
  reportSubmitButton: {
    flex: 1,
    height: 44,
    borderRadius: Radius.control,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reportSubmitButtonText: { ...Typography.labelMd, color: Colors.onPrimary, fontWeight: '700' },
  footer: {
    padding: Spacing.md,
    gap: Spacing.xs,
    backgroundColor: Colors.backgroundBase,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    height: 52,
    borderRadius: Radius.control,
    backgroundColor: Colors.primary,
  },
  buttonDisabled: { opacity: 0.7 },
  primaryButtonText: { ...Typography.titleSm, color: Colors.onPrimary },
  skipButton: { height: 44, alignItems: 'center', justifyContent: 'center' },
  skipButtonText: { ...Typography.labelMd, color: Colors.textSecondary },
});
