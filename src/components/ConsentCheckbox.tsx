/**
 * 회원가입(이메일)·SNS 로그인 최초 동의 화면에서 쓰는 약관 동의 체크박스.
 * 원래는 "이용약관 및 개인정보 처리방침" 하나로 묶은 체크박스 하나였는데, 사용자가 각각
 * 따로 확인하고 체크할 수 있어야 한다는 요청(2026-09-17)으로 두 개로 나눴다 — 이용약관
 * 체크와 개인정보 처리방침 체크를 독립적으로 관리하고, 둘 다 체크해야 진행 가능하다.
 * 약관 전문 링크는 terms.tsx/privacy.tsx로 이동한다 — 뒤로가기로 원래 화면에 돌아온다.
 */
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors, Spacing, Typography } from '@/constants/theme';

interface ConsentRowProps {
  checked: boolean;
  onToggle: (checked: boolean) => void;
  label: string;
  href: '/terms' | '/privacy';
}

function ConsentRow({ checked, onToggle, label, href }: ConsentRowProps) {
  return (
    <Pressable style={styles.row} onPress={() => onToggle(!checked)} hitSlop={8}>
      <Ionicons name={checked ? 'checkbox' : 'square-outline'} size={20} color={checked ? Colors.primary : Colors.textMuted} />
      <Text style={styles.text}>
        <Text style={styles.link} onPress={() => router.push(href)}>
          {label}
        </Text>
        {'에 동의합니다 (필수)'}
      </Text>
    </Pressable>
  );
}

interface TermsConsentCheckboxesProps {
  agreedTerms: boolean;
  onToggleTerms: (checked: boolean) => void;
  agreedPrivacy: boolean;
  onTogglePrivacy: (checked: boolean) => void;
}

export function TermsConsentCheckboxes({ agreedTerms, onToggleTerms, agreedPrivacy, onTogglePrivacy }: TermsConsentCheckboxesProps) {
  return (
    <View style={styles.group}>
      <ConsentRow checked={agreedTerms} onToggle={onToggleTerms} label="이용약관" href="/terms" />
      <ConsentRow checked={agreedPrivacy} onToggle={onTogglePrivacy} label="개인정보 처리방침" href="/privacy" />
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: Spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  text: { ...Typography.bodySm, color: Colors.textSecondary, flexShrink: 1 },
  link: { color: Colors.primary, fontWeight: '700', textDecorationLine: 'underline' },
});
