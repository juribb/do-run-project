/**
 * 비밀번호 변경. 이메일/비밀번호로 가입한 계정만 의미가 있어서 profile.tsx에서
 * provider가 'email'일 때만 이 화면으로 들어오는 메뉴를 보여준다.
 */
import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors, Radius, Spacing, Typography } from '@/constants/theme';
import { changePassword } from '@/lib/account';
import { translateAuthError } from '@/lib/oauth';

const MIN_PASSWORD_LENGTH = 6;

export default function ChangePasswordScreen() {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit() {
    setErrorMessage(null);
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setErrorMessage(`비밀번호는 ${MIN_PASSWORD_LENGTH}자 이상이어야 해요.`);
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMessage('비밀번호가 서로 달라요.');
      return;
    }
    setSaving(true);
    try {
      await changePassword(newPassword);
      Alert.alert('완료', '비밀번호가 변경됐어요.', [{ text: '확인', onPress: () => router.back() }]);
    } catch (e) {
      setErrorMessage(translateAuthError(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.headerButton}>
          <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>비밀번호 변경</Text>
        <View style={styles.headerButton} />
      </View>

      <View style={styles.content}>
        <View style={styles.field}>
          <Text style={styles.label}>새 비밀번호</Text>
          <TextInput
            value={newPassword}
            onChangeText={setNewPassword}
            placeholder={`${MIN_PASSWORD_LENGTH}자 이상 입력해주세요`}
            placeholderTextColor={Colors.textMuted}
            secureTextEntry
            autoComplete="password-new"
            style={styles.input}
          />
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>새 비밀번호 확인</Text>
          <TextInput
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            placeholder="다시 한번 입력해주세요"
            placeholderTextColor={Colors.textMuted}
            secureTextEntry
            autoComplete="password-new"
            style={styles.input}
          />
        </View>

        {errorMessage && <Text style={styles.error}>{errorMessage}</Text>}

        <Pressable style={[styles.saveButton, saving && styles.disabled]} onPress={handleSubmit} disabled={saving}>
          {saving ? <ActivityIndicator color={Colors.onPrimary} /> : <Text style={styles.saveButtonText}>변경하기</Text>}
        </Pressable>
      </View>
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
  content: { flex: 1, padding: Spacing.lg, gap: Spacing.sm },
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
  error: { ...Typography.labelMd, color: '#BA1A1A' },
  saveButton: {
    height: 52,
    borderRadius: Radius.control,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.xs,
  },
  saveButtonText: { ...Typography.titleSm, color: Colors.onPrimary },
  disabled: { opacity: 0.6 },
});
