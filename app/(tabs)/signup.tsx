/**
 * 회원가입 화면. 이메일/비밀번호 + 닉네임 + 프로필 사진(선택)으로 계정을 만든다.
 * 계정(이메일 등)은 auth.users, 닉네임·사진은 별도 profiles 테이블에 저장한다.
 *
 * Supabase 기본 설정은 이메일 인증을 요구하므로, 그 경우 가입 직후 세션이 없을 수 있다 —
 * 이번 프로젝트는 이메일 인증을 꺼둔 상태라 보통은 가입과 동시에 세션이 생긴다.
 * 세션이 바로 없는 경우 프로필 저장은 건너뛰고 안내만 보여준다 (로그인 전엔 본인 확인이 안 돼
 * RLS가 프로필 쓰기를 막는다).
 */
import { useState } from 'react';
import { router } from 'expo-router';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandMark } from '@/components/BrandMark';
import { TermsConsentCheckboxes } from '@/components/ConsentCheckbox';
import { Colors, Radius, Spacing, Typography } from '@/constants/theme';
import { signUpWithEmail, translateAuthError } from '@/lib/oauth';
import { pickProfileImage, uploadAvatar, upsertProfile } from '@/lib/profile';
import { useRecommendationConditionStore } from '@/stores/recommendationConditionStore';

export default function SignupScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [needsEmailConfirm, setNeedsEmailConfirm] = useState(false);
  const [agreedTerms, setAgreedTerms] = useState(false);
  const [agreedPrivacy, setAgreedPrivacy] = useState(false);

  const condition = useRecommendationConditionStore((s) => s.condition);

  async function handlePickPhoto() {
    try {
      const asset = await pickProfileImage();
      if (asset) setAvatarUri(asset.uri);
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleSignup() {
    setErrorMessage(null);
    if (!agreedTerms || !agreedPrivacy) {
      setErrorMessage('이용약관 및 개인정보 처리방침에 동의해주세요.');
      return;
    }
    setLoading(true);
    try {
      const session = await signUpWithEmail(email.trim(), password);
      if (!session) {
        setNeedsEmailConfirm(true);
        return;
      }

      // 세션이 생겼으니(=본인 인증됨) 닉네임·사진과 함께 동의 시각도 같이 저장한다.
      const avatarUrl = avatarUri ? await uploadAvatar(session.user.id, avatarUri) : null;
      await upsertProfile({
        id: session.user.id,
        nickname: nickname.trim() || null,
        avatarUrl,
        termsAgreedAt: new Date().toISOString(),
      });

      if (condition) {
        // course-search-loading.tsx가 이 스토어의 condition을 그대로 읽어서 추천을 이어간다.
        router.replace('/course-search-loading');
      } else {
        router.replace('/(tabs)');
      }
    } catch (e) {
      setErrorMessage(translateAuthError(e));
    } finally {
      setLoading(false);
    }
  }

  if (needsEmailConfirm) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <BrandMark />
          <Text style={styles.title}>메일함을 확인해주세요</Text>
          <Text style={styles.subtitle}>{email}로 인증 메일을 보냈어요. 인증 후 로그인해주세요.</Text>
          <Pressable style={styles.primaryButton} onPress={() => router.replace('/login')}>
            <Text style={styles.primaryButtonText}>로그인 화면으로</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <Pressable style={styles.closeButton} onPress={() => router.back()} hitSlop={12}>
        <Text style={styles.closeIcon}>✕</Text>
      </Pressable>

      <View style={styles.content}>
        <BrandMark />
        <Text style={styles.title}>회원가입</Text>
        <Text style={styles.subtitle}>이메일과 비밀번호만 있으면 바로 시작할 수 있어요.</Text>

        <Pressable style={styles.avatarPicker} onPress={handlePickPhoto}>
          {avatarUri ? (
            <Image source={{ uri: avatarUri }} style={styles.avatarImage} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarPlaceholderIcon}>📷</Text>
            </View>
          )}
          <Text style={styles.avatarLabel}>프로필 사진 (선택)</Text>
        </Pressable>

        <View style={styles.form}>
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
          <View style={styles.field}>
            <Text style={styles.label}>이메일</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="example@email.com"
              placeholderTextColor={Colors.textMuted}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              style={styles.input}
            />
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>비밀번호</Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="6자 이상 입력해주세요"
              placeholderTextColor={Colors.textMuted}
              secureTextEntry
              autoComplete="password-new"
              style={styles.input}
            />
          </View>

          <TermsConsentCheckboxes
            agreedTerms={agreedTerms}
            onToggleTerms={setAgreedTerms}
            agreedPrivacy={agreedPrivacy}
            onTogglePrivacy={setAgreedPrivacy}
          />

          {errorMessage && <Text style={styles.error}>{errorMessage}</Text>}

          <Pressable
            style={({ pressed }) => [
              styles.primaryButton,
              pressed && styles.primaryButtonPressed,
              (loading || !agreedTerms || !agreedPrivacy) && styles.disabled,
            ]}
            onPress={handleSignup}
            disabled={loading || !agreedTerms || !agreedPrivacy}
          >
            {loading ? <ActivityIndicator color={Colors.onPrimary} /> : <Text style={styles.primaryButtonText}>가입하기</Text>}
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.backgroundBase },
  closeButton: { alignSelf: 'flex-end', padding: Spacing.md },
  closeIcon: { fontSize: 20, color: Colors.textMuted },
  content: { flex: 1, paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xl, justifyContent: 'center', gap: Spacing.xs },
  title: { ...Typography.headlineMd, color: Colors.textPrimary, marginTop: Spacing.md },
  subtitle: { ...Typography.bodySm, color: Colors.textMuted, marginBottom: Spacing.md },
  avatarPicker: { alignItems: 'center', gap: Spacing.xs, marginBottom: Spacing.md },
  avatarImage: { width: 72, height: 72, borderRadius: 36 },
  avatarPlaceholder: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.backgroundMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarPlaceholderIcon: { fontSize: 24 },
  avatarLabel: { ...Typography.labelSm, color: Colors.textMuted },
  form: { gap: Spacing.sm },
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
  primaryButton: {
    height: 52,
    borderRadius: Radius.control,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.xs,
  },
  primaryButtonPressed: { backgroundColor: Colors.primaryPressed },
  primaryButtonText: { ...Typography.titleSm, color: Colors.onPrimary },
  disabled: { opacity: 0.5 },
});
