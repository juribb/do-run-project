/**
 * 좌표 → 사람이 읽을 수 있는 주소 변환 (역지오코딩) — 웹 버전.
 * expo-location의 reverseGeocodeAsync는 OS 지오코더를 쓰는데 웹에는 그게 없어서 지원되지 않는다.
 * 대신 OpenStreetMap Nominatim을 직접 호출한다 (무료, 키 불필요).
 * 브라우저는 fetch에서 User-Agent를 직접 설정할 수 없어서, Nominatim 이용 정책이 허용하는 대로
 * 브라우저가 자동으로 붙이는 Referer로 식별한다.
 */
export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  try {
    const url = new URL('https://nominatim.openstreetmap.org/reverse');
    url.searchParams.set('lat', String(lat));
    url.searchParams.set('lon', String(lng));
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('accept-language', 'ko');

    const response = await fetch(url.toString());
    if (!response.ok) return null;

    const data = await response.json();
    const address = data?.address ?? {};
    const parts = [
      address.region ?? address.state,
      address.city,
      address.borough ?? address.city_district,
      address.suburb ?? address.neighbourhood,
    ].filter((part: string | undefined): part is string => Boolean(part));
    // 연속으로 같은 값이 중복되는 경우(예: region과 city가 동일)가 있어 제거한다
    const deduped = parts.filter((part, i) => part !== parts[i - 1]);
    return deduped.length > 0 ? deduped.join(' ') : null;
  } catch (e) {
    console.warn('[geocoding.web] 역지오코딩 실패', e);
    return null;
  }
}
