/**
 * 저장한 코스 목록 (SPEC.md F-05). Supabase의 saved_courses에서 실제로 불러온다
 * (savedCoursesStore.fetchSaved → get_saved_courses RPC).
 */
import { useEffect } from 'react';
import { router } from 'expo-router';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { CourseCard } from '@/components/CourseCard';
import { Colors, Radius, Spacing, Typography } from '@/constants/theme';
import { useAuthStore } from '@/stores/authStore';
import { useSavedCoursesStore } from '@/stores/savedCoursesStore';

export default function SavedCoursesScreen() {
  const session = useAuthStore((s) => s.session);
  const saved = useSavedCoursesStore((s) => s.saved);
  const loaded = useSavedCoursesStore((s) => s.loaded);
  const fetchSaved = useSavedCoursesStore((s) => s.fetchSaved);
  const toggleSave = useSavedCoursesStore((s) => s.toggleSave);
  const candidates = Object.values(saved);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    fetchSaved();
  }, [fetchSaved, session]);

  if (!session) {
    return (
      <SafeAreaView style={[styles.safeArea, { paddingTop: insets.top / 2 }]} edges={["left", "right", "bottom"]}>
        <View style={styles.emptyState}>
          <Text style={styles.emptyEmoji}>🔖</Text>
          <Text style={styles.emptyTitle}>로그인이 필요해요</Text>
          <Text style={styles.emptyText}>저장한 코스를 보려면{'\n'}먼저 로그인해주세요.</Text>
          <Pressable style={styles.loginButton} onPress={() => router.push('/login')}>
            <Text style={styles.loginButtonText}>로그인하기</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (!loaded) {
    return (
      <SafeAreaView style={[styles.safeArea, { paddingTop: insets.top / 2 }]} edges={["left", "right", "bottom"]}>
        <View style={styles.emptyState}>
          <ActivityIndicator color={Colors.primary} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  if (candidates.length === 0) {
    return (
      <SafeAreaView style={[styles.safeArea, { paddingTop: insets.top / 2 }]} edges={["left", "right", "bottom"]}>
        <View style={styles.emptyState}>
          <Text style={styles.emptyEmoji}>🔖</Text>
          <Text style={styles.emptyTitle}>아직 저장한 코스가 없어요</Text>
          <Text style={styles.emptyText}>추천 결과나 코스 상세에서{'\n'}북마크를 눌러 저장해보세요.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safeArea, { paddingTop: insets.top / 2 }]} edges={["left", "right", "bottom"]}>
      <FlatList
        data={candidates}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <CourseCard
            candidate={item}
            variant="compact"
            saved
            onToggleSave={() => toggleSave(item)}
            onPress={() => router.push(`/course-detail/${item.id}?from=saved`)}
          />
        )}
        ItemSeparatorComponent={() => <View style={{ height: Spacing.sm }} />}
      />
    </SafeAreaView>
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
});
