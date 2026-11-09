/**
 * 러닝 실행 화면의 지도 (네이티브). CourseRouteMap과 같은 지도 페이지(route 모드)를 쓰지만,
 * 계획된 경로(coordinates)를 한 번 그린 뒤, currentPosition이 바뀔 때마다 현재 위치와
 * 지금까지 이동한 경로를 계속 얹어서 그린다는 점이 다르다.
 */
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';

import { Colors, Radius } from '@/constants/theme';
import { ROUTE_MAP_PAGE_URL, parseMapInboundMessage, type MapOutboundMessage } from '@/lib/map';

interface LiveRunMapProps {
  plannedCoordinates: [number, number, number][];
  currentPosition: { lat: number; lng: number } | null;
}

export function LiveRunMap({ plannedCoordinates, currentPosition }: LiveRunMapProps) {
  const webViewRef = useRef<WebView>(null);
  const [mapReady, setMapReady] = useState(false);

  function post(message: MapOutboundMessage) {
    webViewRef.current?.postMessage(JSON.stringify(message));
  }

  useEffect(() => {
    if (!mapReady) return;
    post({ type: 'DRAW_ROUTE', coordinates: plannedCoordinates });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady]);

  useEffect(() => {
    if (!mapReady || !currentPosition) return;
    post({ type: 'UPDATE_POSITION', lat: currentPosition.lat, lng: currentPosition.lng });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, currentPosition?.lat, currentPosition?.lng]);

  function handleWebViewMessage(rawData: string) {
    const message = parseMapInboundMessage(rawData);
    if (message?.type === 'READY') setMapReady(true);
  }

  return (
    <View style={styles.container}>
      <WebView
        ref={webViewRef}
        source={{ uri: ROUTE_MAP_PAGE_URL }}
        style={styles.webview}
        scrollEnabled={false}
        onMessage={(event) => handleWebViewMessage(event.nativeEvent.data)}
      />
      {!mapReady && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator color={Colors.primary} size="large" />
        </View>
      )}
      <View style={styles.attribution} pointerEvents="none">
        <Text style={styles.attributionText}>GraphHopper · OpenStreetMap</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, borderRadius: Radius.card, overflow: 'hidden', backgroundColor: Colors.backgroundMuted },
  webview: { flex: 1, backgroundColor: 'transparent' },
  loadingOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.backgroundMuted,
  },
  attribution: {
    position: 'absolute',
    bottom: 4,
    right: 6,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: Radius.chip,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  attributionText: { fontSize: 9, lineHeight: 12, color: '#FFFFFF', fontWeight: '500' },
});
