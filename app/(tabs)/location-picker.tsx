/**
 * 출발 지점 설정 화면. GPS로 현재 위치를 구해서 지도에 보여주고,
 * 지도를 탭하거나 마커를 드래그해서 위치를 직접 조정할 수도 있다.
 *
 * 지도 자체는 이 앱 코드가 아니라 별도 정적 페이지(src/lib/map.ts의 MAP_PAGE_URL)를
 * WebView로 띄운 것이다 — @react-native-kakao/map이 관리 중단 상태라 택한 방식.
 * WebView는 Expo Go에 기본 포함돼 있어서 Dev Build 없이 바로 테스트할 수 있다.
 *
 * (tabs) 그룹 안에 있지만 탭 버튼은 없다 — 하단 네비게이션을 계속 보여주기 위해서다.
 */
import { useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

import { SEOUL_CITY_HALL } from '@/constants/location';
import { Colors, Radius, Spacing, Typography } from '@/constants/theme';
import { reverseGeocode } from '@/lib/geocoding';
import { MAP_PAGE_URL, parseMapInboundMessage, type MapOutboundMessage } from '@/lib/map';
import { useLocationStore, type SelectedLocation } from '@/stores/locationStore';
import { useRecommendationConditionStore } from '@/stores/recommendationConditionStore';

export default function LocationPickerScreen() {
  const webViewRef = useRef<WebView>(null);
  const setStoredLocation = useLocationStore((s) => s.setLocation);

  const [permissionDenied, setPermissionDenied] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [pendingCenter, setPendingCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [selected, setSelected] = useState<SelectedLocation | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [geocoding, setGeocoding] = useState(false);

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setPermissionDenied(true);
        setSelected({ ...SEOUL_CITY_HALL, source: 'manual' });
        setPendingCenter(SEOUL_CITY_HALL);
        return;
      }
      try {
        const position = await Location.getCurrentPositionAsync({});
        const center = { lat: position.coords.latitude, lng: position.coords.longitude };
        setSelected({ ...center, source: 'gps' });
        setPendingCenter(center);
      } catch (e) {
        console.warn('[location-picker] GPS 위치 확인 실패, 서울시청으로 대체', e);
        setSelected({ ...SEOUL_CITY_HALL, source: 'manual' });
        setPendingCenter(SEOUL_CITY_HALL);
      }
    })();
  }, []);

  // 좌표가 바뀔 때마다 사람이 읽을 수 있는 주소로 바꿔서 보여준다.
  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    setGeocoding(true);
    setAddress(null);
    reverseGeocode(selected.lat, selected.lng).then((result) => {
      if (cancelled) return; // 그 사이 위치가 또 바뀌었으면 오래된 결과는 버린다
      setAddress(result);
      setGeocoding(false);
    });
    return () => {
      cancelled = true;
    };
  }, [selected?.lat, selected?.lng]);

  // 지도가 준비된 뒤에 좌표를 보내야 유실되지 않는다 — 둘 중 늦게 끝나는 쪽이 트리거한다.
  useEffect(() => {
    if (mapReady && pendingCenter) {
      const message: MapOutboundMessage = { type: 'SET_CENTER', ...pendingCenter };
      webViewRef.current?.postMessage(JSON.stringify(message));
    }
  }, [mapReady, pendingCenter]);

  function handleWebViewMessage(rawData: string) {
    const message = parseMapInboundMessage(rawData);
    if (!message) return;
    if (message.type === 'READY') {
      setMapReady(true);
    } else if (message.type === 'LOCATION_SELECTED') {
      setSelected({ lat: message.lat, lng: message.lng, source: 'manual' });
    }
  }

  function handleConfirm() {
    if (!selected) return;
    setStoredLocation({ ...selected, address: address ?? undefined });
    // 추천 화면이 지금까지 골라둔 거리·경사·환경 조건을 초기화하지 않도록 알려준다 —
    // 없으면 추천 화면의 포커스 효과가 이 복귀도 "새로 들어온 것"으로 보고 리셋해버린다.
    useRecommendationConditionStore.getState().markPreserveOnReturn();
    // router.back()은 이 화면 안에서 스택이 꼬여서(?) 홈으로 튕기는 경우가 있어 —
    // 취소 버튼과 마찬가지로 항상 추천 화면으로 명시적으로 이동한다.
    router.replace('/recommend');
  }

  function handleCancel() {
    useRecommendationConditionStore.getState().markPreserveOnReturn();
    router.replace('/recommend');
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Pressable onPress={handleCancel} hitSlop={12}>
          <Text style={styles.headerButton}>취소</Text>
        </Pressable>
        <Text style={styles.headerTitle}>출발 지점 설정</Text>
        <Pressable onPress={handleConfirm} disabled={!selected} hitSlop={12}>
          <Text style={[styles.headerButton, styles.headerConfirm, !selected && styles.headerButtonDisabled]}>확인</Text>
        </Pressable>
      </View>

      {permissionDenied && (
        <View style={styles.noticeBar}>
          <Text style={styles.noticeText}>위치 권한이 없어서 기본 위치로 표시돼요. 지도를 눌러 직접 골라주세요.</Text>
        </View>
      )}

      <View style={styles.mapContainer}>
        <WebView
          ref={webViewRef}
          source={{ uri: MAP_PAGE_URL }}
          style={styles.webview}
          onMessage={(event) => handleWebViewMessage(event.nativeEvent.data)}
        />
        {!mapReady && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator color={Colors.primary} size="large" />
          </View>
        )}
      </View>

      <View style={styles.footer}>
        <View style={styles.footerTextWrap}>
          <Text style={styles.footerLabel}>선택한 위치</Text>
          <Text style={styles.footerValue} numberOfLines={1}>
            {!selected
              ? '위치를 확인하는 중...'
              : geocoding
                ? '주소를 확인하는 중...'
                : (address ?? `위도 ${selected.lat.toFixed(5)}, 경도 ${selected.lng.toFixed(5)}`)}
          </Text>
        </View>
        <Pressable
          style={[styles.selectButton, !selected && styles.selectButtonDisabled]}
          onPress={handleConfirm}
          disabled={!selected}
        >
          <Text style={styles.selectButtonText}>선택</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.backgroundBase },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerButton: { ...Typography.bodyMd, color: Colors.textSecondary },
  headerConfirm: { color: Colors.primary, fontWeight: '700' },
  headerButtonDisabled: { opacity: 0.4 },
  headerTitle: { ...Typography.titleMd, color: Colors.textPrimary },
  noticeBar: {
    backgroundColor: Colors.secondaryContainer,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  noticeText: { ...Typography.labelMd, color: Colors.primary },
  mapContainer: { flex: 1 },
  webview: { flex: 1 },
  loadingOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.backgroundMuted,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  footerTextWrap: { flex: 1, gap: 2 },
  footerLabel: { ...Typography.labelSm, color: Colors.textMuted },
  footerValue: { ...Typography.titleSm, color: Colors.textPrimary },
  selectButton: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.control,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  selectButtonDisabled: { opacity: 0.4 },
  selectButtonText: { ...Typography.titleSm, color: Colors.onPrimary },
});
