/**
 * 좌표 → 사람이 읽을 수 있는 주소 변환 (역지오코딩).
 * expo-location이 iOS/Android 각각의 OS 제공 지오코더를 그대로 쓴다 —
 * 별도 API 키나 외부 서비스가 필요 없다.
 */
import * as Location from 'expo-location';

/** OS/지역에 따라 채워지는 필드가 달라서, 있는 것만 자연스럽게 이어붙인다 */
export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  try {
    const results = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
    const address = results[0];
    if (!address) return null;

    const parts = [address.region, address.city, address.district, address.street].filter(
      (part): part is string => Boolean(part),
    );
    // 연속으로 같은 값이 중복되는 경우(예: region과 city가 동일)가 있어 제거한다
    const deduped = parts.filter((part, i) => part !== parts[i - 1]);
    return deduped.length > 0 ? deduped.join(' ') : null;
  } catch (e) {
    console.warn('[geocoding] 역지오코딩 실패', e);
    return null;
  }
}
