import { Pressable, StyleSheet, Text } from 'react-native';

import { Colors, Radius, Spacing, Typography } from '@/constants/theme';

interface ChipProps {
  label: string;
  selected: boolean;
  onPress: () => void;
  /** Stitch 원본이 환경·추가 조건 칩에 이모지를 붙인 것과 맞추기 위한 선택 아이콘 */
  icon?: string;
}

/**
 * 조건 입력 화면의 선택형 옵션(거리·환경·추가 조건)에 공통으로 쓰는 토글 버튼.
 * 스타일은 Stitch "Serene Strides" 디자인 시스템의 Chips & Filter Tags 스펙을 따른다.
 */
export function Chip({ label, selected, onPress, icon }: ChipProps) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, selected && styles.chipSelected]}>
      {icon && <Text style={styles.icon}>{icon}</Text>}
      <Text style={[styles.label, selected && styles.labelSelected]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.full,
    backgroundColor: Colors.backgroundBase,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  chipSelected: {
    backgroundColor: Colors.secondaryContainer,
    borderColor: Colors.primary,
  },
  icon: { fontSize: 13 },
  label: {
    fontSize: Typography.labelMd.fontSize,
    lineHeight: Typography.labelMd.lineHeight,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  labelSelected: {
    color: Colors.primary,
    fontWeight: '700',
  },
});
