/**
 * 코스 상세 화면에서 실제 추천받은 경로를 보여주는 지도 — 웹 버전.
 * react-native-webview는 웹을 지원하지 않아서 <iframe>으로 같은 지도 페이지를 띄운다
 * (location-picker.web.tsx와 동일한 방식).
 *
 * 경로는 오르막/평지/내리막 구간별로 다른 색으로 그려진다 (지도 페이지 쪽에서 좌표의
 * 고도값으로 계산) — 아래 SLOPE_LEGEND 색상은 그 지도 페이지의 색과 맞춰져 있어야 한다.
 */
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { Colors, Radius, Spacing, Typography } from '@/constants/theme';
import { ROUTE_MAP_PAGE_URL, parseMapInboundMessage, type MapOutboundMessage } from '@/lib/map';

const SLOPE_LEGEND = [
  { label: '오르막', color: '#BA1A1A' },
  { label: '평지', color: '#0D6434' },
  { label: '내리막', color: '#2E86DE' },
] as const;

export function CourseRouteMap({ coordinates }: { coordinates: [number, number, number][] }) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    if (!mapReady) return;
    const message: MapOutboundMessage = { type: 'DRAW_ROUTE', coordinates };
    iframeRef.current?.contentWindow?.postMessage(JSON.stringify(message), '*');
  }, [mapReady, coordinates]);

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
    <View>
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
        <View style={styles.badge} pointerEvents="none">
          <View style={styles.badgeDot} />
          <Text style={styles.badgeText}>출발 · 도착</Text>
        </View>
        <View style={styles.attribution} pointerEvents="none">
          <Text style={styles.attributionText}>GraphHopper · OpenStreetMap</Text>
        </View>
      </View>
      <View style={styles.legend}>
        {SLOPE_LEGEND.map((item) => (
          <View key={item.label} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: item.color }]} />
            <Text style={styles.legendLabel}>{item.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { height: 220, borderRadius: Radius.card, overflow: 'hidden', backgroundColor: Colors.backgroundMuted },
  loadingOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.backgroundMuted,
  },
  badge: {
    position: 'absolute',
    top: Spacing.sm,
    left: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.primary,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
  },
  badgeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.onPrimary },
  badgeText: { ...Typography.labelSm, color: Colors.onPrimary, fontWeight: '700' },
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
  legend: { flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.xs, justifyContent: 'center' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendLabel: { ...Typography.labelSm, color: Colors.textSecondary },
});
