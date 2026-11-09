/**
 * 추천 후보/코스를 보여주는 공유 템플릿 (SPEC.md F-04).
 * "compact"는 결과 목록 카드, "detail"은 코스 상세 화면에서 쓴다.
 * 두 variant 모두 같은 필드를 같은 순서로 보여줘야 후보끼리 비교할 수 있다 —
 * 필드를 추가/변경할 때는 이 컴포넌트 하나만 고치면 모든 화면에 반영된다.
 *
 * 스타일은 Stitch "Serene Strides" 디자인 시스템의 카드·지표 뱃지·추천 이유 말풍선
 * 스펙을 따른다.
 */
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { CardShadow, Colors, Radius, Spacing, Typography } from '@/constants/theme';
import { ENVIRONMENT_LABELS } from '@/constants/options';
import { formatDistanceKm, formatDurationMinutes, formatPresenceOrUnknown } from '@/lib/format';
import type { CourseCandidate } from '@/types/recommendation';

interface CourseCardProps {
  candidate: CourseCandidate;
  variant: 'compact' | 'detail';
  onPress?: () => void;
  /** 저장 여부와 토글 핸들러. 둘 다 없으면 저장 버튼을 표시하지 않는다 */
  saved?: boolean;
  onToggleSave?: () => void;
  /** 추천 결과 중 1순위 카드에 Stitch의 "가장 추천해요" 배지를 붙인다 */
  highlight?: boolean;
}

export function CourseCard({ candidate, variant, onPress, saved, onToggleSave, highlight }: CourseCardProps) {
  const content = (
    <View style={[styles.card, highlight && styles.cardHighlight]}>
      {highlight && (
        <View style={styles.highlightBadge}>
          <Ionicons name="leaf" size={13} color={Colors.primary} />
          <Text style={styles.highlightBadgeText}>가장 추천해요</Text>
        </View>
      )}
      <View style={styles.headerRow}>
        <Text style={styles.name}>{candidate.name}</Text>
        <View style={styles.headerRight}>
          <View style={styles.fitScoreRow}>
            <View style={styles.fitScoreDot} />
            <Text style={styles.fitScore}>적합도 {candidate.fitScore}%</Text>
          </View>
          {onToggleSave && (
            <Pressable
              hitSlop={8}
              onPress={onToggleSave}
              style={styles.saveButton}
              accessibilityLabel={saved ? '저장 취소' : '코스 저장'}
            >
              <Ionicons name={saved ? 'bookmark' : 'bookmark-outline'} size={15} color={saved ? Colors.primary : Colors.textSecondary} />
            </Pressable>
          )}
        </View>
      </View>

      <View style={styles.reasonBubble}>
        <Text style={styles.reasonIcon}>💡</Text>
        <Text style={styles.reason}>{candidate.reasonText}</Text>
      </View>

      <View style={styles.statRow}>
        <Stat label="거리" value={formatDistanceKm(candidate.distanceM)} />
        <Stat label="예상 시간" value={formatDurationMinutes(candidate.estimatedDurationS)} />
        <Stat label="상승고도" value={`${candidate.ascentM}m`} />
      </View>

      {variant === 'detail' && (
        <>
          <View style={styles.statRow}>
            <Stat label="신호등" value={formatPresenceOrUnknown(candidate.trafficLightCount)} />
            <Stat label="계단" value={formatPresenceOrUnknown(candidate.stairCount)} />
          </View>

          <View style={styles.envSection}>
            <Text style={styles.envTitle}>환경 특성</Text>
            <View style={styles.envTags}>
              {candidate.environmentRatios.map((r) => (
                <Text key={r.feature} style={styles.envTag}>
                  {ENVIRONMENT_LABELS[r.feature]} {Math.round(r.ratio * 100)}%
                </Text>
              ))}
            </View>
          </View>
        </>
      )}
    </View>
  );

  if (!onPress) return content;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [pressed && styles.pressed]}>
      {content}
    </Pressable>
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
  card: {
    backgroundColor: Colors.backgroundBase,
    borderRadius: Radius.card,
    padding: Spacing.md,
    gap: Spacing.sm,
    ...CardShadow,
  },
  cardHighlight: {
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  highlightBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    backgroundColor: Colors.secondaryContainer,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
  },
  highlightBadgeText: {
    ...Typography.labelMd,
    color: Colors.primary,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.85,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: Spacing.xs,
  },
  name: {
    ...Typography.headlineSm,
    color: Colors.textPrimary,
    flexShrink: 1,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  saveButton: {
    width: 28,
    height: 28,
    borderRadius: Radius.full,
    backgroundColor: Colors.backgroundMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fitScoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  fitScoreDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.primary,
  },
  fitScore: {
    ...Typography.labelMd,
    color: Colors.primary,
    fontWeight: '700',
  },
  reasonBubble: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.xs,
    backgroundColor: Colors.backgroundMuted,
    borderRadius: Radius.control,
    padding: Spacing.sm,
  },
  reasonIcon: {
    fontSize: 14,
  },
  reason: {
    ...Typography.bodySm,
    color: Colors.textSecondary,
    flex: 1,
  },
  statRow: {
    flexDirection: 'row',
    gap: Spacing.xs,
  },
  stat: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
    backgroundColor: Colors.backgroundMuted,
    borderRadius: Radius.chip,
    paddingVertical: Spacing.xs,
  },
  statLabel: {
    ...Typography.labelSm,
    color: Colors.textSecondary,
  },
  statValue: {
    ...Typography.titleSm,
    color: Colors.textPrimary,
  },
  envSection: {
    gap: Spacing.xs,
  },
  envTitle: {
    ...Typography.labelSm,
    color: Colors.textSecondary,
  },
  envTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
  },
  envTag: {
    ...Typography.labelMd,
    color: Colors.primary,
    backgroundColor: Colors.secondaryContainer,
    borderWidth: 1,
    borderColor: Colors.primary,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: Radius.full,
    overflow: 'hidden',
  },
});
