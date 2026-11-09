/**
 * 계정 관리 — 비밀번호 변경은 Supabase Auth가 클라이언트에서 바로 지원하지만,
 * 회원 탈퇴(auth.users 삭제)는 service_role 권한이 필요해서 클라이언트가 직접 못 한다 —
 * supabase/functions/delete-account가 그 역할을 한다.
 */
import { supabase } from '@/lib/supabase';

export async function changePassword(newPassword: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
}

export async function deleteAccount(): Promise<void> {
  const { error } = await supabase.functions.invoke('delete-account', { method: 'POST' });
  if (error) {
    const context = (error as { context?: { json?: () => Promise<{ error?: string }> } }).context;
    const body = await context?.json?.().catch(() => null);
    throw new Error(body?.error ?? '회원 탈퇴 처리에 실패했어요. 잠시 후 다시 시도해주세요.');
  }
}
