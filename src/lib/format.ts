/** 화면 표시용 포맷 함수. 여러 화면(목록/상세)이 같은 형식을 쓰도록 모아둔다. */

export function formatDistanceKm(distanceM: number): string {
  return `${(distanceM / 1000).toFixed(1)}km`;
}

export function formatDurationMinutes(durationS: number): string {
  const minutes = Math.round(durationS / 60);
  return `약 ${minutes}분`;
}

export function formatCountOrUnknown(count: number | null, unit: string): string {
  return count === null ? '확인 불가' : `${count}${unit}`;
}

/**
 * 개수 대신 "있음/없음"만 보여준다(2026-09-17, "신호등·계단은 개수 말고 있다/없다
 * 정도로만 보여달라" 요청 이후 추가) — CourseCard의 신호등·계단 지표에 쓴다.
 * null은 "정보 부족"과 "보행 가능"을 구분하는 기존 원칙 그대로 "확인 불가"로 남긴다.
 */
export function formatPresenceOrUnknown(count: number | null): string {
  if (count === null) return '확인 불가';
  return count > 0 ? '있음' : '없음';
}

/** 러닝 실행 중 타이머 표시용. 1시간 넘으면 h:mm:ss, 아니면 mm:ss */
export function formatElapsedTime(totalSeconds: number): string {
  const clamped = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(clamped / 3600);
  const m = Math.floor((clamped % 3600) / 60);
  const s = clamped % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** 러닝 페이스 표시용 (분'초"/km). 아직 계산할 데이터가 없으면 '-' */
export function formatPaceSPerKm(paceSPerKm: number | null): string {
  if (paceSPerKm === null || !Number.isFinite(paceSPerKm)) return '-';
  const m = Math.floor(paceSPerKm / 60);
  const s = Math.round(paceSPerKm % 60);
  return `${m}'${String(s).padStart(2, '0')}"`;
}
