/**
 * 프로필 수정 — 닉네임·프로필 사진. signup.tsx의 입력 UI를 그대로 옮겨왔다.
 */
import { useEffect, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { ActivityIndicator, Alert, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors, Radius, Spacing, Typography } from '@/constants/theme';
import { getProfile, pickProfileImage, uploadAvatar, upsertProfile } from '@/lib/profile';
import { useAuthStore } from '@/stores/authStore';
import { useProfileStore } from '@/stores/profileStore';

export default function ProfileEditScreen() {
  const session = useAuthStore((s) => s.session);
  const sessionLoading = useAuthStore((s) => s.isLoading);
  const [nickname, setNickname] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarUri, setAvatarUri] = useState<string | null>(null); // 새로 고른 사진(로컬 uri) — 저장 시에만 업로드
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // authStore가 세션을 복원하는 동안(isLoading=true)은 아직 session이 null이어도 판단을
    // 미룬다 — 그새 홈으로 돌려보내면 새로고침으로 들어왔을 때 매번 튕겨나간다.
    if (sessionLoading) return;
    if (!session) {
      router.replace('/(tabs)');
      return;
    }
    getProfile(session.user.id)
      .then((profile) => {
        setNickname(profile?.nickname ?? '');
        setAvatarUrl(profile?.avatarUrl ?? null);
      })
      .catch((e) => console.error('[profile-edit] 프로필 조회 실패', e))
      .finally(() => setLoading(false));
  }, [session, sessionLoading]);

  async function handlePickPhoto() {
    try {
      const asset = await pickProfileImage();
      if (asset) setAvatarUri(asset.uri);
    } catch (e) {
      Alert.alert('오류', e instanceof Error ? e.message : String(e));
    }
  }

  async function handleSave() {
    if (!session) return;
    setSaving(true);
    try {
      const finalAvatarUrl = avatarUri ? await uploadAvatar(session.user.id, avatarUri) : avatarUrl;
      await upsertProfile({ id: session.user.id, nickname: nickname.trim() || null, avatarUrl: finalAvatarUrl });
      // 상단바 프로필 아이콘도 이 값을 쓰기 때문에, 전역 스토어를 갱신해줘야 헤더에 바로 반영된다.
      await useProfileStore.getState().refresh(session.user.id);
      router.back();
    } catch (e) {
      Alert.alert('오류', e instanceof Error ? e.message : '저장하지 못했어요. 다시 시도해주세요.');
    } finally {
      setSaving(false);
    }
  }

  const displayAvatar = avatarUri ?? avatarUrl;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.headerButton}>
          <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>프로필 수정</Text>
        <View style={styles.headerButton} />
      </View>

      {loading ? (
        <View style={styles.centerState}>
          <ActivityIndicator color={Colors.primary} size="large" />
        </View>
      ) : (
        <View style={styles.content}>
          <Pressable style={styles.avatarPicker} onPress={handlePickPhoto}>
            {displayAvatar ? (
              <Image source={{ uri: displayAvatar }} style={styles.avatarImage} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Text style={styles.avatarPlaceholderIcon}>📷</Text>
              </View>
            )}
            <Text style={styles.avatarLabel}>사진 변경</Text>
          </Pressable>

          <View style={styles.field}>
            <Text style={styles.label}>닉네임</Text>
            <TextInput
              value={nickname}
              onChangeText={setNickname}
              placeholder="러닝할 때 쓸 이름"
              placeholderTextColor={Colors.textMuted}
              maxLength={20}
              style={styles.input}
            />
          </View>

          <Pressable style={[styles.saveButton, saving && styles.disabled]} onPress={handleSave} disabled={saving}>
            {saving ? <ActivityIndicator color={Colors.onPrimary} /> : <Text style={styles.saveButtonText}>저장</Text>}
          </Pressable>
        </View>
      )}
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
  centerState: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { flex: 1, padding: Spacing.lg, gap: Spacing.md },
  avatarPicker: { alignItems: 'center', gap: Spacing.xs, marginBottom: Spacing.sm },
  avatarImage: { width: 88, height: 88, borderRadius: 44 },
  avatarPlaceholder: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: Colors.backgroundMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarPlaceholderIcon: { fontSize: 28 },
  avatarLabel: { ...Typography.labelSm, color: Colors.primary, fontWeight: '700' },
  field: { gap: 6 },
  label: { ...Typography.bodySm, color: Colors.textSecondary },
  input: {
    height: 52,
    borderRadius: Radius.control,
    backgroundColor: Colors.backgroundMuted,
    paddingHorizontal: Spacing.md,
    ...Typography.bodyMd,
    color: Colors.textPrimary,
  },
  saveButton: {
    height: 52,
    borderRadius: Radius.control,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.sm,
  },
  saveButtonText: { ...Typography.titleSm, color: Colors.onPrimary },
  disabled: { opacity: 0.6 },
});
