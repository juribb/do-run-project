/**
 * 러닝 실행 화면. course-detail의 "이 코스로 달리기"에서 진입한다 —
 * useActiveRunStore에 미리 채워둔 recordId/candidate를 읽어서 그린다
 * (계획된 경로 좌표처럼 큰 데이터를 라우트 파라미터로 안 넘기려고).
 *
 * 이 화면은 탭 네비게이터 안의 한 화면이라, 같은 코스를 연달아 두 번 달리면 화면
 * 인스턴스가 재사용될 수 있다 — recordId가 바뀔 때마다(=새 러닝이 시작될 때마다)
 * 타이머·거리·완료 상태를 전부 초기화해서 이전 러닝의 흔적이 안 남게 한다.
 *
 * F-06 화면 잠금 상태에서도 GPS 기록 유지: 네이티브(iOS/Android)에서는 "항상 허용" 권한을
 * 받아서 expo-task-manager 기반 백그라운드 위치 추적(backgroundLocationTask.ts)을 쓴다 —
 * 화면이 꺼지거나 다른 앱으로 가도 OS가 위치를 계속 전달해준다. 웹은 그런 기능 자체가
 * 없어서(브라우저 탭이 백그라운드면 JS가 거의 안 돌아간다) 이 화면이 떠 있는 동안만
 * watchPositionAsync로 추적하는 기존 방식을 그대로 쓴다. Expo Go에서는 백그라운드 권한
 * 자체가 항상 거부되니(네이티브 모듈 미탑재), 그 경우 자동으로 포그라운드 추적으로
 * 폴백한다 — 실제 백그라운드 추적을 테스트하려면 Dev Build가 필요하다.
 *
 * (tabs) 그룹 안에 있지만 탭 버튼은 없다 — 하단 네비게이션을 계속 보여주기 위해서다.
 */
import { useEffect, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { Alert, Platform, Pressable, StyleSheet, Text, Vibration, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LiveRunMap } from '@/components/LiveRunMap';
import { Colors, Radius, Spacing, Typography } from '@/constants/theme';
import { BACKGROUND_LOCATION_TASK } from '@/lib/backgroundLocationTask';
import { formatElapsedTime, formatPaceSPerKm } from '@/lib/format';
import { distanceToRouteMeters } from '@/lib/geo';
import { abortRunningRecord, completeRunningRecord } from '@/lib/running';
import { useActiveRunStore } from '@/stores/activeRunStore';
import { useRunCompletionStore } from '@/stores/runCompletionStore';

type Phase = 'running' | 'saving';

/** 이 정도(미터) 이상 경로에서 벗어나면 이탈로 본다 — GPS 오차(보통 5~15m) 감안한 여유값 */
const OFF_ROUTE_THRESHOLD_M = 30;

const LOCATION_OPTIONS = {
  accuracy: Location.Accuracy.BestForNavigation,
  timeInterval: 3000,
  distanceInterval: 5,
};

/** 백그라운드 태스크가 실제로 돌고 있으면 멈춘다 — 시작한 적 없어도 안전하게 무시된다. */
async function stopBackgroundTracking() {
  const started = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK).catch(() => false);
  if (started) await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK).catch(() => {});
}

export default function RunningScreen() {
  const recordId = useActiveRunStore((s) => s.recordId);
  const courseId = useActiveRunStore((s) => s.courseId);
  const candidate = useActiveRunStore((s) => s.candidate);
  const startedAt = useActiveRunStore((s) => s.startedAt);
  const distanceM = useActiveRunStore((s) => s.distanceM);
  const path = useActiveRunStore((s) => s.path);
  const addPoint = useActiveRunStore((s) => s.addPoint);
  const resetRun = useActiveRunStore((s) => s.reset);

  const [phase, setPhase] = useState<Phase>('running');
  const [elapsedS, setElapsedS] = useState(0);
  const [currentPosition, setCurrentPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [isOffRoute, setIsOffRoute] = useState(false);
  const watchSubscription = useRef<Location.LocationSubscription | null>(null);
  const wasOffRouteRef = useRef(false);

  // 시작하자마자 온 게 아니라(예: 화면 새로고침 등) 진행 중인 러닝이 없으면 되돌아간다.
  // phase가 'saving'일 때는 예외다 — handleFinish가 저장 성공 후 resetRun()으로 스토어를
  // 비우고 기록 상세로 보내는 도중인데, 이 효과가 그 recordId 변화에 반응해서 홈으로
  // 되돌리면 기록 상세 이동이 덮어써진다.
  useEffect(() => {
    if (phase === 'saving') return;
    if (!recordId || !candidate || !startedAt) {
      router.replace('/(tabs)');
    }
  }, [recordId, candidate, startedAt, phase]);

  // 새 러닝이 시작될 때마다(recordId가 바뀔 때마다) 화면 상태를 전부 초기화한다 —
  // 탭 네비게이터가 이 화면 인스턴스를 재사용해서, 안 하면 이전 러닝의 완료/거리/시간이 남는다.
  useEffect(() => {
    if (!recordId) return;
    setPhase('running');
    setElapsedS(0);
    setCurrentPosition(null);
    setLocationError(null);
    setIsOffRoute(false);
    wasOffRouteRef.current = false;
  }, [recordId]);

  // 타이머 — 1초마다 경과 시간을 갱신한다.
  useEffect(() => {
    if (!startedAt || phase !== 'running') return;
    const interval = setInterval(() => {
      setElapsedS(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [startedAt, phase]);

  // GPS 추적 시작/종료 — 웹은 포그라운드 watch, 네이티브는 백그라운드 태스크를 쓴다.
  // 실제 위치 처리(현재 위치 표시·이탈 감지)는 addPoint가 채우는 path를 보는 아래 별도
  // effect가 맡는다 — 백그라운드 태스크 콜백은 컴포넌트 밖에서 store에 직접 addPoint하기
  // 때문에, "위치가 들어왔을 때 할 일"을 여기(watch 콜백 안)에만 두면 화면이 꺼져있는
  // 동안 들어온 위치에는 그 처리가 전혀 안 붙는다.
  useEffect(() => {
    if (phase !== 'running') return;
    let cancelled = false;

    (async () => {
      const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
      if (foregroundStatus !== 'granted') {
        setLocationError('위치 권한이 없어서 경로를 기록할 수 없어요. 설정에서 위치 권한을 허용해주세요.');
        return;
      }

      async function startForegroundWatch() {
        const subscription = await Location.watchPositionAsync(LOCATION_OPTIONS, (position) => {
          if (cancelled) return;
          addPoint(position.coords.longitude, position.coords.latitude, position.coords.altitude);
        });
        if (cancelled) {
          subscription.remove();
          return;
        }
        watchSubscription.current = subscription;
      }

      if (Platform.OS === 'web') {
        // 웹은 백그라운드 위치 추적 자체가 없다(브라우저 탭이 백그라운드면 JS가 거의 안 돈다).
        await startForegroundWatch();
        return;
      }

      try {
        const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();
        if (backgroundStatus !== 'granted') {
          // 권한을 물어보긴 했지만 사용자가 거부한 경우 — 포그라운드로 폴백한다.
          setLocationError('화면이 꺼지면 기록이 멈출 수 있어요. 설정에서 위치 권한을 "항상 허용"으로 바꾸면 계속 기록돼요.');
          await startForegroundWatch();
          return;
        }
        if (cancelled) return;

        await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
          ...LOCATION_OPTIONS,
          showsBackgroundLocationIndicator: true,
          foregroundService: {
            notificationTitle: '러닝 기록 중',
            notificationBody: '화면을 나가도 경로를 계속 기록하고 있어요.',
          },
        });
      } catch (e) {
        // Expo Go는 "항상 허용" 권한에 필요한 Info.plist 키 자체가 없어서, 거부 상태를
        // 반환하는 게 아니라 아예 예외(ERR_LOCATION_INFO_PLIST)를 던진다 — Dev Build가
        // 아니라 Expo Go로 테스트 중일 때 흔히 겪는 상황이라, 그냥 포그라운드로 폴백한다.
        console.error('[running] 백그라운드 위치 권한 요청 실패', e);
        if (cancelled) return;
        setLocationError('화면이 꺼지면 기록이 멈출 수 있어요. Dev Build에서 실행하면 화면이 꺼져도 계속 기록돼요.');
        await startForegroundWatch();
      }
    })();

    return () => {
      cancelled = true;
      watchSubscription.current?.remove();
      watchSubscription.current = null;
      stopBackgroundTracking();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // 위치가 새로 들어올 때마다(포그라운드 watch든 백그라운드 태스크든 결국 addPoint로
  // path가 늘어난다) 현재 위치 표시와 경로 이탈 감지를 갱신한다.
  useEffect(() => {
    const last = path[path.length - 1];
    if (!last) return;
    const [lng, lat] = last;
    setCurrentPosition({ lat, lng });

    // 경로 이탈 감지 — 계획된 경로에서 임계값보다 멀어지면 처음 벗어나는 순간에만 진동으로 알린다
    // (계속 벗어나 있는 동안 매번 울리면 방해만 되니, 상태가 바뀔 때만 알림을 준다).
    if (candidate && candidate.coordinates.length > 0) {
      const distance = distanceToRouteMeters({ lat, lng }, candidate.coordinates);
      const offRoute = distance > OFF_ROUTE_THRESHOLD_M;
      if (offRoute !== wasOffRouteRef.current) {
        wasOffRouteRef.current = offRoute;
        setIsOffRoute(offRoute);
        if (offRoute) Vibration.vibrate(400);
      }
    }
  }, [path, candidate]);

  async function handleFinish() {
    if (!recordId || !courseId || !candidate) return;
    watchSubscription.current?.remove();
    watchSubscription.current = null;
    await stopBackgroundTracking();
    setPhase('saving');

    const durationS = elapsedS;
    const avgPaceSPerKm = distanceM > 0 ? Math.round(durationS / (distanceM / 1000)) : null;
    const finalDistanceM = Math.round(distanceM);

    try {
      await completeRunningRecord({
        recordId,
        distanceM: finalDistanceM,
        durationS,
        avgPaceSPerKm,
        actualPath: path,
      });
      useRunCompletionStore.getState().set({
        recordId,
        courseId,
        courseName: candidate.name,
        distanceM: finalDistanceM,
        durationS,
        avgPaceSPerKm,
      });
      resetRun();
      router.replace('/run-complete');
    } catch (e) {
      console.error('[running] 러닝 기록 저장 실패', e);
      Alert.alert('오류', '러닝 기록을 저장하지 못했어요. 다시 시도해주세요.');
      setPhase('running'); // 재시도할 수 있게 되돌린다 — GPS 추적은 위 useEffect가 다시 붙여준다.
    }
  }

  function handleAbort() {
    Alert.alert('러닝을 그만할까요?', '지금까지 기록은 저장되지 않아요.', [
      { text: '계속 달리기', style: 'cancel' },
      {
        text: '그만하기',
        style: 'destructive',
        onPress: async () => {
          watchSubscription.current?.remove();
          await stopBackgroundTracking();
          if (recordId) {
            try {
              await abortRunningRecord(recordId);
            } catch (e) {
              console.error('[running] 러닝 중단 처리 실패', e);
            }
          }
          resetRun();
          router.replace('/(tabs)');
        },
      },
    ]);
  }

  if (!candidate) return null; // 위 useEffect가 곧 홈으로 보낸다.

  const livePaceSPerKm = distanceM > 0 ? elapsedS / (distanceM / 1000) : null;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Pressable onPress={handleAbort} hitSlop={12} style={styles.closeButton}>
          <Ionicons name="close" size={24} color={Colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {candidate.name}
        </Text>
        <View style={styles.closeButton} />
      </View>

      {locationError && (
        <View style={styles.noticeBar}>
          <Text style={styles.noticeText}>{locationError}</Text>
        </View>
      )}

      {isOffRoute && (
        <View style={styles.offRouteBar}>
          <Ionicons name="warning-outline" size={16} color={Colors.caution} />
          <Text style={styles.offRouteText}>경로를 벗어났어요. 지도를 확인해주세요.</Text>
        </View>
      )}

      <View style={styles.mapWrap}>
        <LiveRunMap plannedCoordinates={candidate.coordinates} currentPosition={currentPosition} />
      </View>

      <View style={styles.statsCard}>
        <View style={styles.stat}>
          <Text style={styles.statLabel}>거리</Text>
          <Text style={styles.statValue}>{(distanceM / 1000).toFixed(2)}km</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.stat}>
          <Text style={styles.statLabel}>시간</Text>
          <Text style={styles.statValue}>{formatElapsedTime(elapsedS)}</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.stat}>
          <Text style={styles.statLabel}>페이스</Text>
          <Text style={styles.statValue}>{formatPaceSPerKm(livePaceSPerKm)}</Text>
        </View>
      </View>

      <Pressable
        style={[styles.finishButton, phase === 'saving' && styles.finishButtonDisabled]}
        onPress={handleFinish}
        disabled={phase === 'saving'}
      >
        <Text style={styles.finishButtonText}>{phase === 'saving' ? '저장 중...' : '종료'}</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.backgroundBase },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
  },
  closeButton: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { ...Typography.titleMd, color: Colors.textPrimary, flex: 1, textAlign: 'center' },
  noticeBar: {
    backgroundColor: Colors.secondaryContainer,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  noticeText: { ...Typography.labelMd, color: Colors.primary },
  offRouteBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFF3E3',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  offRouteText: { ...Typography.labelMd, color: Colors.caution, flexShrink: 1 },
  mapWrap: { flex: 1, marginHorizontal: Spacing.md },
  statsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: Spacing.md,
    padding: Spacing.md,
    borderRadius: Radius.card,
    backgroundColor: Colors.backgroundMuted,
  },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  statDivider: { width: 1, height: 32, backgroundColor: Colors.border },
  statLabel: { ...Typography.labelSm, color: Colors.textMuted },
  statValue: { ...Typography.headlineSm, color: Colors.textPrimary },
  finishButton: {
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.md,
    height: 56,
    borderRadius: Radius.control,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  finishButtonDisabled: { opacity: 0.7 },
  finishButtonText: { ...Typography.titleMd, color: Colors.onPrimary },
});
