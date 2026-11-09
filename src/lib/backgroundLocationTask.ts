/**
 * F-06 화면 잠금 상태에서도 GPS 기록 유지. Expo Go는 백그라운드 위치 추적을 지원하지
 * 않아서(별도 Dev Build 필요) 지금까지는 running.tsx가 화면이 떠 있는 동안(포그라운드)만
 * watchPositionAsync로 추적했다 — 이 파일은 그 한계를 넘는 실제 백그라운드 추적을 구현한다.
 *
 * TaskManager.defineTask는 반드시 모듈 최상단(컴포넌트 밖)에서, 앱이 뜨자마자 한 번은
 * 실행돼야 한다 — OS가 앱이 백그라운드/종료 상태일 때 위치 업데이트를 전달하려고 앱을
 * 깨우는데, 그 시점에 이 태스크가 이미 "등록"돼 있어야 콜백이 불린다. app/_layout.tsx에서
 * 이 파일을 그냥 import만 해두는 이유가 이거다(부수효과만 필요, 내보내는 값을 안 씀).
 *
 * 콜백은 컴포넌트가 마운트돼 있지 않을 때도 불릴 수 있어서, React state가 아니라
 * activeRunStore(zustand, 모듈 싱글턴)에 직접 addPoint한다 — running.tsx는 그 store를
 * 구독하고 있으니 화면이 다시 보일 때 최신 경로가 그대로 반영된다. 러닝 중이 아닐 때
 * (recordId가 없을 때) 도착한 업데이트는 무시한다 — 태스크 등록 자체는 앱 실행 내내
 * 유지되고, running.tsx가 시작/종료 시점에만 실제 업데이트 구독을 걸고 끊기 때문이다.
 */
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

import { useActiveRunStore } from '@/stores/activeRunStore';

export const BACKGROUND_LOCATION_TASK = 'running-background-location-task';

TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
  if (error) {
    console.error('[backgroundLocationTask]', error);
    return;
  }
  if (!data) return;

  const { locations } = data as { locations: Location.LocationObject[] };
  const store = useActiveRunStore.getState();
  if (!store.recordId) return; // 진행 중인 러닝이 없으면(태스크만 남아있는 경우) 무시한다.

  for (const location of locations) {
    store.addPoint(location.coords.longitude, location.coords.latitude, location.coords.altitude);
  }
});
