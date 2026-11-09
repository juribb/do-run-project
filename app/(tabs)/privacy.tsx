/**
 * 개인정보 처리방침 전문. profile.tsx의 "개인정보 처리방침" 메뉴에서 진입한다.
 * 내용은 src/constants/legalDocs.ts에 구조화된 형태로 모아둔다 — 여기서는 렌더링만 한다.
 */
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LEGAL_LAST_UPDATED, PRIVACY_POLICY } from '@/constants/legalDocs';
import { Colors, Spacing, Typography } from '@/constants/theme';

export default function PrivacyScreen() {
  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.headerButton}>
          <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>개인정보 처리방침</Text>
        <View style={styles.headerButton} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.updatedAt}>최종 수정일 {LEGAL_LAST_UPDATED}</Text>
        {PRIVACY_POLICY.map((section) => (
          <View key={section.heading} style={styles.section}>
            <Text style={styles.heading}>{section.heading}</Text>
            {section.body.map((line, i) => (
              <Text key={i} style={styles.body}>
                {line}
              </Text>
            ))}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.backgroundBase },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
  },
  headerButton: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { ...Typography.titleMd, color: Colors.textPrimary },
  content: { padding: Spacing.lg, paddingBottom: 60, gap: Spacing.lg },
  updatedAt: { ...Typography.labelSm, color: Colors.textMuted },
  section: { gap: Spacing.xs },
  heading: { ...Typography.titleSm, color: Colors.textPrimary, fontWeight: '700' },
  body: { ...Typography.bodyMd, color: Colors.textSecondary },
});
