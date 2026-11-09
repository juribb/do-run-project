/**
 * SNS(카카오·구글) 로그인 최초 1회 약관 동의 화면(2026-09-17). 이메일 가입은 signup.tsx
 * 화면에서 이미 동의를 받지만, 소셜 로그인은 별도 가입 폼이 없어서 로그인 직후 여기로
 * 한 번 보낸다 — login.tsx(방금 로그인한 경우)와 app/_layout.tsx(세션은 있는데 동의
 * 기록이 없는 채로 앱을 다시 연 경우, 예: 동의 전에 앱을 껐다 켠 경우) 양쪽에서 들어올
 * 수 있다. 동의하면 profiles.terms_agreed_at을 남기고, 그 다음부터는 이 화면을 다시
 * 거치지 않는다.
 */
import { useState } from 'react';
import { router } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandMark } from '@/components/BrandMark';
import { TermsConsentCheckboxes } from '@/components/ConsentCheckbox';
import { Colors, Radius, Spacing, Typography } from '@/constants/theme';
import { agreeToTerms } from '@/lib/profile';
import { signOut } from '@/lib/oauth';
import { useAuthStore } from '@/stores/authStore';
import { useProfileStore } from '@/stores/profileStore';
import { useRecommendationConditionStore } from '@/stores/recommendationConditionStore';

export default function ConsentScreen() {
  const session = useAuthStore((s) => s.session);
  const condition = useRecommendationConditionStore((s) => s.condition);
  const [agreedTerms, setAgreedTerms] = useState(false);
  const [agreedPrivacy, setAgreedPrivacy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleContinue() {
    if (!session) {
      router.replace('/login');
      return;
    }
    setErrorMessage(null);
    setLoading(true);
    try {
      await agreeToTerms(session.user.id);
      await useProfileStore.getState().refresh(session.user.id);
      if (condition) {
        router.replace('/course-search-loading');
      } else {
        router.replace('/(tabs)');
      }
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : String(e));
      setLoading(false);
    }
  }

  async function handleDecline() {
    await signOut();
    router.replace('/(tabs)');
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.content}>
        <BrandMark />
        <Text style={styles.title}>이용 약관에 동의해주세요</Text>
        <Text style={styles.subtitle}>서비스를 계속 이용하려면 아래 약관에 동의가 필요해요. 다음부터는 다시 묻지 않아요.</Text>

        <View style={styles.checkboxCard}>
          <TermsConsentCheckboxes
            agreedTerms={agreedTerms}
            onToggleTerms={setAgreedTerms}
            agreedPrivacy={agreedPrivacy}
            onTogglePrivacy={setAgreedPrivacy}
          />
        </View>

        {errorMessage && <Text style={styles.error}>{errorMessage}</Text>}

        <Pressable
          style={({ pressed }) => [
            styles.primaryButton,
            pressed && styles.primaryButtonPressed,
            (loading || !agreedTerms || !agreedPrivacy) && styles.disabled,
          ]}
          onPress={handleContinue}
          disabled={loading || !agreedTerms || !agreedPrivacy}
        >
          {loading ? <ActivityIndicator color={Colors.onPrimary} /> : <Text style={styles.primaryButtonText}>동의하고 계속하기</Text>}
        </Pressable>

        <Pressable onPress={handleDecline} hitSlop={8}>
          <Text style={styles.declineText}>동의하지 않고 로그아웃</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.backgroundBase },
  content: { flex: 1, paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xl, justifyContent: 'center', gap: Spacing.md },
  title: { ...Typography.headlineMd, color: Colors.textPrimary, marginTop: Spacing.md },
  subtitle: { ...Typography.bodySm, color: Colors.textMuted },
  checkboxCard: {
    backgroundColor: Colors.backgroundMuted,
    borderRadius: Radius.card,
    padding: Spacing.md,
  },
  error: { ...Typography.labelMd, color: '#BA1A1A' },
  primaryButton: {
    height: 52,
    borderRadius: Radius.control,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonPressed: { backgroundColor: Colors.primaryPressed },
  primaryButtonText: { ...Typography.titleSm, color: Colors.onPrimary },
  disabled: { opacity: 0.5 },
  declineText: { ...Typography.bodySm, color: Colors.textMuted, textAlign: 'center', textDecorationLine: 'underline' },
});
