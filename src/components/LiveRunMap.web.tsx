/**
 * 러닝 실행 화면의 지도 — 웹 버전. react-native-webview는 웹을 지원하지 않아서
 * <iframe>으로 같은 지도 페이지를 띄운다 (CourseRouteMap.web.tsx와 동일한 방식).
 */
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { Colors, Radius } from '@/constants/theme';
import { ROUTE_MAP_PAGE_URL, parseMapInboundMessage, type MapOutboundMessage } from '@/lib/map';

interface LiveRunMapProps {
  plannedCoordinates: [number, number, number][];
  currentPosition: { lat: number; lng: number } | null;
}

export function LiveRunMap({ plannedCoordinates, currentPosition }: LiveRunMapProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [mapReady, setMapReady] = useState(false);

  function post(message: MapOutboundMessage) {
    iframeRef.current?.contentWindow?.postMessage(JSON.stringify(message), '*');
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

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (typeof event.data !== 'string') return;
      const message = parseMapInboundMessage(event.data);
      if (message?.type === 'READY') setMapReady(true);
    }
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  return (
    <View style={styles.container}>
      {React.createElement('iframe', {
        ref: iframeRef,
        src: ROUTE_MAP_PAGE_URL,
        style: { border: 'none', width: '100%', height: '100%' },
      })}
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
