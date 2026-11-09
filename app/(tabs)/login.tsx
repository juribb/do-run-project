/**
 * 로그인 화면 (SPEC.md F-02 + 이메일/비밀번호 — Stitch 원본 디자인에 맞춰 추가).
 * '추천 받기' 클릭 시 로그인 안 되어 있으면 여기로 온다.
 * 성공하면 조건을 복원해 즉시 추천을 실행하고, 취소(닫기)하면 조건을 유지한 채 홈으로 돌아간다
 * (intent.md 원칙 9 — 조건 저장은 로그인 여부와 무관하게 항상 Zustand 스토어에 있다).
 */
import { useState } from 'react';
import { Link, router } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandMark } from '@/components/BrandMark';
import { Colors, Radius, Spacing, Typography } from '@/constants/theme';
import { getProfile } from '@/lib/profile';
import { signInWithEmail, signInWithProvider, translateAuthError, type OAuthProvider } from '@/lib/oauth';
import { useRecommendationConditionStore } from '@/stores/recommendationConditionStore';
import type { Session } from '@supabase/supabase-js';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailLoading, setEmailLoading] = useState(false);
  const [providerLoading, setProviderLoading] = useState<OAuthProvider | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const condition = useRecommendationConditionStore((s) => s.condition);

  function afterLoginSuccess(session: Session | null) {
    if (!session) return;
    if (condition) {
      // course-search-loading.tsx가 이 스토어의 condition을 그대로 읽어서 추천을 이어간다.
      router.replace('/course-search-loading');
    } else {
      router.back();
    }
  }

  /**
   * 이메일 로그인과 달리 소셜 로그인은 가입 화면이 따로 없어서, 최초 로그인(=사실상
   * 가입) 때 약관 동의를 한 번은 받아야 한다(2026-09-17, "SNS 로그인 최초 1회만 동의받게
   * 해달라" 요청). 매번 로그인 버튼 누르기 전에 체크박스를 보여주면 이미 동의한
   * 재로그인 사용자한테도 매번 다시 물어보게 되므로, 로그인이 실제로 성공한 "후"에
   * profiles.terms_agreed_at을 확인해서 처음이면 동의 화면(consent.tsx)으로 보내고,
   * 이미 동의했으면 바로 원래 목적지(추천 이어가기/이전 화면)로 보낸다.
   */
  async function afterOAuthLoginSuccess(session: Session | null) {
    if (!session) return;
    const profile = await getProfile(session.user.id).catch(() => null);
    if (!profile?.termsAgreedAt) {
      router.replace('/consent');
      return;
    }
    afterLoginSuccess(session);
  }

  async function handleEmailLogin() {
    setErrorMessage(null);
    setEmailLoading(true);
    try {
      const session = await signInWithEmail(email.trim(), password);
      afterLoginSuccess(session);
    } catch (e) {
      setErrorMessage(translateAuthError(e));
    } finally {
      setEmailLoading(false);
    }
  }

  async function handleProviderLogin(provider: OAuthProvider) {
    setErrorMessage(null);
    setProviderLoading(provider);
    try {
      const session = await signInWithProvider(provider);
      await afterOAuthLoginSuccess(session);
    } catch (e) {
      setErrorMessage(translateAuthError(e));
    } finally {
      setProviderLoading(null);
    }
  }

  const anyLoading = emailLoading || providerLoading !== null;

  return (
    <SafeAreaView style={styles.safeArea}>
      <Pressable
        style={styles.closeButton}
        onPress={() => {
          // 추천 화면에서 조건을 다 고르고 로그인하러 온 경우, 그냥 닫고 돌아가도
          // 방금 고른 조건이 초기화되지 않아야 한다.
          useRecommendationConditionStore.getState().markPreserveOnReturn();
          router.back();
        }}
        hitSlop={12}
      >
        <Text style={styles.closeIcon}>✕</Text>
      </Pressable>

      <View style={styles.content}>
        <BrandMark />
        <Text style={styles.title}>로그인하고 추천을 받아보세요</Text>
        <Text style={styles.subtitle}>입력하신 조건은 그대로 유지돼요.</Text>

        <View style={styles.form}>
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
              placeholder="비밀번호를 입력하세요"
              placeholderTextColor={Colors.textMuted}
              secureTextEntry
              autoComplete="password"
              style={styles.input}
            />
          </View>

          {errorMessage && <Text style={styles.error}>{errorMessage}</Text>}

          <Pressable
            style={({ pressed }) => [styles.emailButton, pressed && styles.emailButtonPressed, anyLoading && styles.disabled]}
            onPress={handleEmailLogin}
            disabled={anyLoading}
          >
            {emailLoading ? <ActivityIndicator color={Colors.onPrimary} /> : <Text style={styles.emailButtonText}>로그인</Text>}
          </Pressable>
        </View>

        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>또는</Text>
          <View style={styles.dividerLine} />
        </View>

        <View style={styles.buttonGroup}>
          <ProviderButton
            label="카카오로 계속하기"
            backgroundColor="#FEE500"
            textColor="#191919"
            loading={providerLoading === 'kakao'}
            disabled={anyLoading}
            onPress={() => handleProviderLogin('kakao')}
          />
          <ProviderButton
            label="Google로 계속하기"
            backgroundColor={Colors.backgroundBase}
            textColor={Colors.textPrimary}
            bordered
            loading={providerLoading === 'google'}
            disabled={anyLoading}
            onPress={() => handleProviderLogin('google')}
          />
        </View>

        <Text style={styles.signupPrompt}>
          아직 계정이 없나요?{' '}
          <Link href="/signup" style={styles.signupLink}>
            회원가입
          </Link>
        </Text>
      </View>
    </SafeAreaView>
  );
}

function ProviderButton({
  label,
  backgroundColor,
  textColor,
  loading,
  disabled,
  onPress,
  bordered,
}: {
  label: string;
  backgroundColor: string;
  textColor: string;
  loading: boolean;
  disabled: boolean;
  onPress: () => void;
  bordered?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.providerButton,
        { backgroundColor },
        bordered && styles.providerButtonBordered,
        disabled && !loading && styles.disabled,
      ]}
    >
      {loading ? <ActivityIndicator color={textColor} /> : <Text style={[styles.providerLabel, { color: textColor }]}>{label}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.backgroundBase },
  closeButton: { alignSelf: 'flex-end', padding: Spacing.md },
  closeIcon: { fontSize: 20, color: Colors.textMuted },
  content: { flex: 1, paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xl, justifyContent: 'center', gap: Spacing.xs },
  title: { ...Typography.headlineMd, color: Colors.textPrimary, marginTop: Spacing.md },
  subtitle: { ...Typography.bodySm, color: Colors.textMuted, marginBottom: Spacing.lg },
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
  emailButton: {
    height: 52,
    borderRadius: Radius.control,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.xs,
  },
  emailButtonPressed: { backgroundColor: Colors.primaryPressed },
  emailButtonText: { ...Typography.titleSm, color: Colors.onPrimary },
  disabled: { opacity: 0.5 },
  divider: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginVertical: Spacing.lg },
  dividerLine: { flex: 1, height: 1, backgroundColor: Colors.border },
  dividerText: { ...Typography.labelSm, color: Colors.textMuted },
  buttonGroup: { gap: Spacing.sm },
  providerButton: { height: 48, borderRadius: Radius.control, alignItems: 'center', justifyContent: 'center' },
  providerButtonBordered: { borderWidth: 1, borderColor: Colors.border },
  providerLabel: { ...Typography.titleSm },
  signupPrompt: { ...Typography.bodySm, color: Colors.textSecondary, textAlign: 'center', marginTop: Spacing.xl },
  signupLink: { ...Typography.titleSm, color: Colors.primary },
});
