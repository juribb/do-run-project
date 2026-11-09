import { StyleSheet, Text, View } from 'react-native';

import { Colors, Spacing, Typography } from '@/constants/theme';

/**
 * 아직 내용을 만들지 않은 탭의 자리표시자.
 * 없는 기능을 있는 것처럼 보여주지 않기 위해, 빈 화면 대신 "준비 중"임을 분명히 밝힌다.
 */
export function ComingSoon({ emoji, title, description }: { emoji: string; title: string; description: string }) {
  return (
    <View style={styles.container}>
      <Text style={styles.emoji}>{emoji}</Text>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    padding: Spacing.lg,
    backgroundColor: Colors.backgroundMuted,
  },
  emoji: { fontSize: 32, marginBottom: Spacing.xs },
  title: { ...Typography.titleMd, color: Colors.textPrimary },
  description: { ...Typography.bodySm, color: Colors.textMuted, textAlign: 'center' },
});
