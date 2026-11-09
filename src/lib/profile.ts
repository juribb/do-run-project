/**
 * 회원가입 시 입력한 닉네임·프로필 사진을 저장/조회한다.
 * auth.users(이메일 등 기본 계정 정보)와 분리된 public.profiles 테이블을 쓴다.
 */
import * as ImagePicker from 'expo-image-picker';

import { supabase } from '@/lib/supabase';
import type { User } from '@supabase/supabase-js';

export interface Profile {
  id: string;
  nickname: string | null;
  avatarUrl: string | null;
  notificationsEnabled: boolean;
  /** 이용약관·개인정보 처리방침에 동의한 시각. null이면 아직 동의 전 — SNS 로그인 사용자는
   * 이 값이 있어야 매번 다시 동의창을 안 보고 넘어간다. */
  termsAgreedAt: string | null;
}

/** 사진 보관함을 열어 하나 고르게 한다. 취소하면 null. 권한은 필요한 시점에만 요청한다. */
export async function pickProfileImage() {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new Error('사진 보관함 접근 권한이 필요해요.');
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.7,
  });
  if (result.canceled) return null;
  return result.assets[0];
}

/** 선택한 이미지를 본인 폴더({user_id}/avatar.jpg)에 올리고 공개 URL을 반환한다. */
export async function uploadAvatar(userId: string, imageUri: string): Promise<string> {
  const response = await fetch(imageUri);
  const arrayBuffer = await response.arrayBuffer();
  const path = `${userId}/avatar.jpg`;

  const { error } = await supabase.storage
    .from('avatars')
    .upload(path, arrayBuffer, { contentType: 'image/jpeg', upsert: true });
  if (error) throw error;

  const { data } = supabase.storage.from('avatars').getPublicUrl(path);
  return data.publicUrl;
}

/** 프로필 행을 만들거나 갱신한다 (없으면 생성, 있으면 덮어쓰기). */
export async function upsertProfile(profile: {
  id: string;
  nickname?: string | null;
  avatarUrl?: string | null;
  /** 이메일 가입은 가입 화면에서 이미 동의를 받으므로, 그 자리에서 같이 저장한다. */
  termsAgreedAt?: string;
}) {
  const { error } = await supabase.from('profiles').upsert({
    id: profile.id,
    nickname: profile.nickname ?? null,
    avatar_url: profile.avatarUrl ?? null,
    ...(profile.termsAgreedAt ? { terms_agreed_at: profile.termsAgreedAt } : {}),
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

/**
 * SNS 로그인 사용자가 최초 1회 동의 화면에서 동의했을 때 호출한다(app/(tabs)/consent.tsx).
 * update가 아니라 upsert를 쓴다 — 닉네임/아바타 메타데이터가 없는 계정은
 * ensureProfileFromOAuthMetadata가 profiles 행 자체를 아직 안 만들었을 수 있어서, update만
 * 쓰면 대상 행이 없어 조용히 아무 일도 안 일어나(동의가 영영 기록 안 됨) 매번 다시 동의
 * 화면으로 튕기게 된다. upsert는 명시한 컬럼(terms_agreed_at)만 갱신하고 나머지(닉네임 등)는
 * 그대로 두므로 안전하다.
 */
export async function agreeToTerms(userId: string): Promise<void> {
  const { error } = await supabase.from('profiles').upsert({ id: userId, terms_agreed_at: new Date().toISOString() });
  if (error) throw error;
}

/**
 * 카카오 등 OAuth로 로그인한 사용자는 회원가입 폼을 거치지 않아서 profiles 행이 없다.
 * 이메일/비밀번호 가입자와 달리 우리가 직접 닉네임을 물어본 적이 없으니, provider가 준
 * 닉네임·프로필 사진(user_metadata)을 profiles에 채워 넣어 "닉네임 미설정"으로 보이지
 * 않게 한다. 이미 닉네임이 있으면(사용자가 나중에 바꿨을 수도 있으니) 건드리지 않는다.
 */
export async function ensureProfileFromOAuthMetadata(user: User) {
  const provider = user.app_metadata?.provider;
  if (!provider || provider === 'email') return;

  const existing = await getProfile(user.id);
  if (existing?.nickname) return;

  const metadata = user.user_metadata ?? {};
  const nickname = metadata.name ?? metadata.full_name ?? metadata.preferred_username ?? metadata.user_name ?? null;
  const avatarUrl = metadata.avatar_url ?? metadata.picture ?? existing?.avatarUrl ?? null;
  if (!nickname && !avatarUrl) return;

  await upsertProfile({ id: user.id, nickname, avatarUrl });
}

export async function getProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, nickname, avatar_url, notifications_enabled, terms_agreed_at')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    id: data.id,
    nickname: data.nickname,
    avatarUrl: data.avatar_url,
    notificationsEnabled: data.notifications_enabled,
    termsAgreedAt: data.terms_agreed_at,
  };
}

/**
 * 알림 설정 토글 전용 — upsertProfile을 그대로 쓰면 닉네임·아바타를 안 넘겼을 때
 * null로 덮어써버리니, 이 값 하나만 바꾸는 별도 함수를 둔다.
 */
export async function updateNotificationPreference(userId: string, enabled: boolean): Promise<void> {
  const { error } = await supabase.from('profiles').update({ notifications_enabled: enabled }).eq('id', userId);
  if (error) throw error;
}
