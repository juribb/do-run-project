/**
 * "마이" 탭 (Stitch "마이페이지 - Serene Strides" 대응).
 * 원본에는 "러너 4기" 뱃지, "인증된 러너" 체크, "아침 햇살과 함께..." 문구가 있었지만
 * 우리 스키마에 없는 값을 지어내는 거라 뺐다 — intent.md 원칙과 같은 이유.
 * 공지사항·문의하기는 요청에 따라 뺐다. 이용약관·개인정보처리방침은 실제 문구가 아직
 * 없어서 "준비 중" 안내만 띄운다.
 *
 * 통계(저장한 코스/러닝 기록/평균 만족도), 위치 권한 상태, 앱 버전은 전부 실제 값이다.
 * 알림 설정은 아직 푸시 발송 파이프라인이 없지만, 고른 값 자체는 profiles에 진짜로
 * 저장해서 나중에 그대로 쓸 수 있게 한다.
 */
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import * as Linking from 'expo-linking';
import * as Location from 'expo-location';
import { router, useFocusEffect } from 'expo-router';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { ComingSoon } from '@/components/ComingSoon';
import { Colors, Radius, Spacing, Typography } from '@/constants/theme';
import { deleteAccount } from '@/lib/account';
import { signOut } from '@/lib/oauth';
import { ensureProfileFromOAuthMetadata, updateNotificationPreference } from '@/lib/profile';
import { fetchProfileStats, type ProfileStats } from '@/lib/profileStats';
import { useAuthStore } from '@/stores/authStore';
import { useProfileStore } from '@/stores/profileStore';

type LocationPermissionLabel = '항상 허용됨' | '앱 사용 중 허용됨' | '허용 안 됨' | '확인 중...';

export default function ProfileTabScreen() {
  const session = useAuthStore((s) => s.session);
  // 프로필은 상단바 헤더와 공유하는 전역 스토어에서 읽는다 — 여기서 수정하면 헤더에도 바로 반영된다.
  const profile = useProfileStore((s) => s.profile);
  const refreshProfile = useProfileStore((s) => s.refresh);
  const setProfile = useProfileStore((s) => s.setProfile);
  const [stats, setStats] = useState<ProfileStats | null>(null);
  const [locationLabel, setLocationLabel] = useState<LocationPermissionLabel>('확인 중...');
  const [deleting, setDeleting] = useState(false);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!session) {
      setStats(null);
      return;
    }
    // OAuth 로그인인데 아직 닉네임이 안 채워졌으면(예: 이 화면을 처음 열기 전에 로그인한 세션)
    // 여기서도 한 번 채워준다 — _layout.tsx의 SIGNED_IN 이벤트는 이미 지난 세션엔 안 뜨니까.
    ensureProfileFromOAuthMetadata(session.user)
      .catch((e) => console.warn('[profile] OAuth 프로필 자동 채우기 실패', e))
      .then(() => refreshProfile(session.user.id))
      .catch((e) => console.warn('[profile] 프로필 조회 실패', e));

    fetchProfileStats(session.user.id)
      .then(setStats)
      .catch((e) => console.warn('[profile] 통계 조회 실패', e));
  }, [session, refreshProfile]);

  // 프로필 수정 화면에서 돌아왔을 때 바뀐 닉네임/사진을 바로 반영한다.
  useFocusEffect(
    useCallback(() => {
      if (!session) return;
      refreshProfile(session.user.id).catch((e) => console.warn('[profile] 프로필 재조회 실패', e));
    }, [session, refreshProfile]),
  );

  useEffect(() => {
    Location.getForegroundPermissionsAsync().then((result) => {
      setLocationLabel(result.granted ? '앱 사용 중 허용됨' : '허용 안 됨');
    });
  }, []);

  if (!session) {
    return (
      <SafeAreaView style={[styles.safeArea, { paddingTop: insets.top / 2 }]} edges={['left', 'right', 'bottom']}>
        <View style={styles.container}>
          <ComingSoon emoji="👤" title="로그인이 필요해요" description={'마이페이지를 보려면\n먼저 로그인해주세요.'} />
          <Pressable style={styles.loginButton} onPress={() => router.push('/login')}>
            <Text style={styles.loginButtonText}>로그인하기</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const canChangePassword = session.user.app_metadata?.provider === 'email';

  async function handleToggleNotifications(value: boolean) {
    if (!profile) return;
    setProfile({ ...profile, notificationsEnabled: value }); // 낙관적 업데이트
    try {
      await updateNotificationPreference(session!.user.id, value);
    } catch (e) {
      console.error('[profile] 알림 설정 저장 실패', e);
      setProfile({ ...profile, notificationsEnabled: !value }); // 되돌리기
      Alert.alert('오류', '알림 설정을 저장하지 못했어요.');
    }
  }

  function handleDeleteAccount() {
    Alert.alert(
      '정말 탈퇴하시겠어요?',
      '저장한 코스, 러닝 기록, 평가가 모두 삭제되고 되돌릴 수 없어요.',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '탈퇴하기',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              await deleteAccount();
              await signOut();
            } catch (e) {
              console.error('[profile] 회원 탈퇴 실패', e);
              Alert.alert('오류', e instanceof Error ? e.message : '회원 탈퇴에 실패했어요. 다시 시도해주세요.');
              setDeleting(false);
            }
          },
        },
      ],
    );
  }

  return (
    <SafeAreaView style={[styles.safeArea, { paddingTop: insets.top / 2 }]} edges={['left', 'right', 'bottom']}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.card}>
          {profile?.avatarUrl ? (
            <Image source={{ uri: profile.avatarUrl }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarPlaceholderIcon}>👤</Text>
            </View>
          )}
          <View style={styles.cardText}>
            <Text style={styles.nickname}>{profile?.nickname || '닉네임 미설정'}</Text>
            <Text style={styles.email}>{session.user.email ?? session.user.id}</Text>
          </View>
          <Pressable style={styles.editButton} onPress={() => router.push('/profile-edit')}>
            <Ionicons name="pencil" size={14} color={Colors.textPrimary} />
            <Text style={styles.editButtonText}>프로필 수정</Text>
          </Pressable>
        </View>

        <View style={styles.statsRow}>
          <Stat label="저장한 코스" value={stats ? `${stats.savedCourseCount}개` : '-'} />
          <View style={styles.statDivider} />
          <Stat label="러닝 기록" value={stats ? `${stats.runningRecordCount}회` : '-'} />
          <View style={styles.statDivider} />
          <Stat label="평균 만족도" value={stats?.averageSatisfaction != null ? stats.averageSatisfaction.toFixed(1) : '-'} />
        </View>

        <Section title="내 활동">
          <Row icon="bookmark-outline" label="저장한 코스" badge={stats ? `${stats.savedCourseCount}개` : undefined} onPress={() => router.push('/saved')} />
          <Row icon="document-text-outline" label="내 러닝 기록" badge={stats ? `${stats.runningRecordCount}회` : undefined} onPress={() => router.push('/records')} />
        </Section>

        <Section title="계정">
          <Row icon="person-outline" label="프로필 수정" onPress={() => router.push('/profile-edit')} />
          {canChangePassword && <Row icon="lock-closed-outline" label="비밀번호 변경" onPress={() => router.push('/change-password')} />}
          <Row icon="close-circle-outline" label="회원 탈퇴" labelStyle={styles.mutedLabel} onPress={handleDeleteAccount} disabled={deleting} />
        </Section>

        <Section title="설정">
          <Row icon="location-outline" label="위치 권한" badge={locationLabel} onPress={() => Linking.openSettings()} />
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <Ionicons name="notifications-outline" size={20} color={Colors.textSecondary} />
              <Text style={styles.rowLabel}>알림 설정</Text>
            </View>
            <Switch
              value={profile?.notificationsEnabled ?? true}
              onValueChange={handleToggleNotifications}
              trackColor={{ true: Colors.primary }}
            />
          </View>
        </Section>

        <Section title="서비스 안내 및 약관">
          <Row icon="document-outline" label="이용약관" onPress={() => router.push('/terms')} />
          <Row icon="shield-outline" label="개인정보 처리방침" onPress={() => router.push('/privacy')} />
        </Section>

        <Pressable style={styles.signOutButton} onPress={() => signOut()}>
          <Ionicons name="log-out-outline" size={16} color={Colors.textSecondary} />
          <Text style={styles.signOutText}>로그아웃</Text>
        </Pressable>
        <Text style={styles.version}>버전 {Constants.expoConfig?.version ?? '-'}</Text>

        {deleting && (
          <View style={styles.deletingOverlay}>
            <ActivityIndicator color={Colors.onPrimary} size="large" />
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionCard}>{children}</View>
    </View>
  );
}

function Row({
  icon,
  label,
  badge,
  onPress,
  disabled,
  labelStyle,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  badge?: string;
  onPress: () => void;
  disabled?: boolean;
  labelStyle?: object;
}) {
  return (
    <Pressable style={[styles.row, disabled && styles.rowDisabled]} onPress={onPress} disabled={disabled}>
      <View style={styles.rowLeft}>
        <Ionicons name={icon} size={20} color={Colors.textSecondary} />
        <Text style={[styles.rowLabel, labelStyle]}>{label}</Text>
      </View>
      <View style={styles.rowRight}>
        {badge && <Text style={styles.rowBadge}>{badge}</Text>}
        <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.backgroundMuted },
  container: { paddingHorizontal: Spacing.lg, gap: Spacing.md, paddingBottom: 48 },
  card: {
    backgroundColor: Colors.backgroundBase,
    borderRadius: Radius.card,
    padding: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  avatar: { width: 52, height: 52, borderRadius: 26 },
  avatarPlaceholder: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: Colors.backgroundMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarPlaceholderIcon: { fontSize: 22 },
  cardText: { gap: 2, flexShrink: 1, flex: 1 },
  nickname: { ...Typography.titleMd, color: Colors.textPrimary },
  email: { ...Typography.bodySm, color: Colors.textMuted },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.full,
    backgroundColor: Colors.backgroundMuted,
  },
  editButtonText: { ...Typography.labelSm, color: Colors.textPrimary, fontWeight: '700' },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.backgroundBase,
    borderRadius: Radius.card,
    padding: Spacing.md,
  },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  statDivider: { width: 1, height: 32, backgroundColor: Colors.border },
  statLabel: { ...Typography.labelSm, color: Colors.textMuted },
  statValue: { ...Typography.titleMd, color: Colors.textPrimary },
  section: { gap: Spacing.xs },
  sectionTitle: { ...Typography.labelMd, color: Colors.textMuted, marginLeft: Spacing.xxs },
  sectionCard: { backgroundColor: Colors.backgroundBase, borderRadius: Radius.card, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  rowDisabled: { opacity: 0.5 },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  rowLabel: { ...Typography.bodyMd, color: Colors.textPrimary },
  mutedLabel: { color: Colors.textMuted },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  rowBadge: { ...Typography.labelMd, color: Colors.textSecondary },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: Spacing.sm,
  },
  signOutText: { ...Typography.titleSm, color: Colors.textSecondary },
  version: { ...Typography.labelSm, color: Colors.textMuted, textAlign: 'center' },
  loginButton: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.control,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    marginTop: -Spacing.xl,
  },
  loginButtonText: { ...Typography.titleSm, color: Colors.onPrimary },
  deletingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
