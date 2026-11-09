/**
 * POST /recommend
 * 조건 입력 → 출발지 근처 "좋은 길"(공원·강변) 경유 순환 경로 시도, 실패하면 GraphHopper
 * round_trip 6회(seed 다르게) 시도로 폴백 → 급커브 적은 3개만 추림 → 각 경로에 Overpass로
 * 환경/신호등/계단 조회 → 적합도 계산 → recommendation_request + recommendation_candidate
 * 저장 → 결과 반환.
 *
 * 원칙(intent.md 03): 적합도는 서버에서 계산하고 점수·근거·알고리즘 버전을 스냅샷으로 저장한다.
 * AI는 이 파이프라인에 없다 — reasonText는 계산된 축별 점수로 만든 템플릿 문장이다.
 *
 * course(공유 가능한 물리적 경로 자산)는 여기서 안 만든다 — 추천 후보 대부분은 저장되지
 * 않고 버려지는데 매번 만들면 낭비라, 사용자가 "저장하기"/"이 코스로 달리기"를 누를 때만
 * DB 함수 ensure_course_for_candidate()(migration 0008)가 그때 만든다. 그래서 클라이언트가
 * 보는 candidate.id는 여기서도 그대로 recommendation_candidate.id다.
 */
import { createClient } from 'npm:@supabase/supabase-js@2';

import { countSharpTurns, distanceMeters } from './geometry.ts';
import { fetchRoundTripRoute } from './graphhopper.ts';
import { fetchCourseCharacteristicsForRoutes } from './overpass.ts';
import { reverseGeocodeNeighborhood } from './nominatim.ts';
import { buildWaypointBasedRoutes, isWithinTolerance, passesRoadQuality } from './routeBuilder.ts';
import { calculateFit, type RawCourse, type RunningCondition } from './scoring.ts';
import { analyzeShape, removeSpurs } from './shape.ts';

const ALGORITHM_VERSION = 'v2-graphhopper-overpass-shape';
/** 6:30/km 페이스로 가정한 예상 소요시간. 실측 페이스 데이터가 없어 mocks와 같은 가정을 쓴다. */
const ASSUMED_PACE_S_PER_KM = 390;
/**
 * GraphHopper round_trip 알고리즘은 "급커브 적은 경로"를 요청할 방법이 없어서(공식 API에
 * 그런 파라미터 자체가 없음), seed를 더 많이 시도해서 그중 급커브가 적은 것만 골라 쓴다 —
 * 최종적으로 쓰는 건 FINAL_CANDIDATE_COUNT개지만, 그걸 고르기 위해 이만큼 미리 만들어본다.
 * 이제 이 방식은 waypoint 기반 생성이 실패했을 때만 쓰는 폴백이라, GraphHopper 호출량을
 * 아끼려고 4개로 줄였다(실측: 무료 키가 하루 한도에 걸린 적이 있다).
 */
const CANDIDATE_SEED_POOL = [1, 2, 3, 4];
const FINAL_CANDIDATE_COUNT = 3;
/**
 * "표시된 횡단보도 없이 도로를 건너는" 지점이 이 개수를 넘으면 후보에서 뺀다(2026-09-16,
 * "카카오맵 횡단보도 표시와 꽤 벗어난 곳에서 길을 가로지른다" 피드백). 1개 정도는 좁은
 * 골목처럼 실제로 아무 데서나 건너도 되는 경우가 많아서 완전히 0을 요구하진 않는다 —
 * badRoadRatio와 같은 이유로, 전부 걸러지면(예: 이 동네 전체가 그런 지형) 필터 없이
 * 전체를 쓴다(결과를 아예 못 주는 것보다는 낫다).
 */
const MAX_UNMATCHED_CROSSINGS = 1;
/**
 * 사용자가 입력한 출발지와, GraphHopper가 실제로 스냅한(보행 네트워크에서 가장 가까운)
 * 시작 지점 사이의 거리(m). 이 이상이면 출발지가 건물 안이나 네트워크가 끊긴 곳에 있다는
 * 뜻일 수 있다(2026-09-16, "출발지를 임의로 옮기지 말고 접근 거리를 확인하라" 피드백
 * 이후 추가). 하드 필터는 아니다 — GraphHopper의 스냅 지점이 실제로 걸어서 접근 가능한지
 * 우리가 독립적으로 검증할 방법이 없어서, 일단 값만 로그·응답에 남겨 눈에 띄게 한다.
 */
const ORIGIN_ACCESS_WARNING_M = 150;
/**
 * 순환형 후보에서 "이미 지나간 길을 다시 지나는" 구간이 이 비율을 넘으면 후보에서 뺀다
 * (2026-10-05, "경로 모양이 이상하다" 피드백 이후 추가 — 갔던 길을 되돌아오는 막대사탕
 * 모양·가지가 달린 모양을 걸러낸다). 실측 데이터 없이 정한 잠정치다. 다른 필터와 같은 이유로
 * 전부 걸러지면 필터 없이 전체를 쓴다(결과를 아예 못 주는 것보다는 낫다).
 */
const MAX_LOOP_OVERLAP_RATIO = 0.2;
/**
 * 정렬용 모양 벌점 가중치 — 급회전 개수(보통 3~15)와 같은 눈금에 얹는다. 겹침 10%p는 급회전
 * 2.5개, 자기 교차 1회는 급회전 4개, 둥글지 않은 정도(0~1)는 최대 5개만큼으로 친다.
 */
const SHAPE_PENALTY = { overlap: 25, crossing: 4, nonCompact: 5 } as const;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RequestBody {
  originLat: number;
  originLng: number;
  targetDistanceKm: number;
  slopePreference: RunningCondition['slopePreference'];
  environmentPreferences: RunningCondition['environmentPreferences'];
  extraConditions: RunningCondition['extraConditions'];
}

function toWktLineStringZ(coords: [number, number, number][]): string {
  const points = coords.map(([lng, lat, ele]) => `${lng} ${lat} ${ele ?? 0}`).join(', ');
  return `SRID=4326;LINESTRING Z(${points})`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: '로그인이 필요합니다.' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 이 클라이언트로는 "누가 요청했는지"만 확인한다 (RLS를 그대로 적용받는 사용자 권한).
    const supabaseAsUser = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: userError,
    } = await supabaseAsUser.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: '로그인이 필요합니다.' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body: RequestBody = await req.json();
    const condition: RunningCondition = {
      targetDistanceKm: body.targetDistanceKm,
      slopePreference: body.slopePreference,
      environmentPreferences: body.environmentPreferences,
      extraConditions: body.extraConditions,
    };

    // 무료 키 하나로는 GraphHopper의 "분당 요청 수" 제한에 걸리기 쉬워서(실측: 응답 바디가
    // "Minutely API limit heavily violated" — 하루 크레딧 소진이 아니라 짧은 시간에 요청이
    // 몰릴 때 걸리는 제한이다. 순환형+왕복형을 동시에 생성하도록 바꾸면서 요청 하나당
    // GraphHopper 호출이 최대 2배로 늘어난 게 원인 중 하나였다), GRAPHHOPPER_API_KEY_2
    // (선택)를 추가로 등록해두면 첫 번째 키가 막혔을 때(429) graphhopper.ts가 자동으로
    // 두 번째 키로 넘어간다(2026-09-16, "무료 키 두 개를 등록해두고 하나가 막히면 자동으로
    // 바꿔 쓰게 해달라" 요청 이후 추가).
    const graphhopperKeys = [Deno.env.get('GRAPHHOPPER_API_KEY'), Deno.env.get('GRAPHHOPPER_API_KEY_2')].filter(
      (k): k is string => !!k,
    );
    if (graphhopperKeys.length === 0) {
      return new Response(JSON.stringify({ error: '서버 설정 오류입니다. 관리자에게 문의해주세요.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const targetDistanceM = condition.targetDistanceKm * 1000;

    // 출발지 근처 공원·강변길을 지나는 순환 경로를 먼저 시도한다 — round_trip과 달리
    // 어디를 지나는지 직접 정해서 만들기 때문에 "뛰기 좋은 길"에 훨씬 가깝다.
    let routePool = await buildWaypointBasedRoutes(body.originLat, body.originLng, targetDistanceM, graphhopperKeys);

    if (routePool.length === 0) {
      // 근처에 쓸 만한 공원·강변길이 없거나 거리를 못 맞췄으면, 기존 round_trip 방식으로
      // 폴백한다 — 후보 풀을 넉넉히 만들어서 하나가 실패해도 나머지는 계속 진행한다 (SPEC.md 6번).
      const routeResults = await Promise.all(
        CANDIDATE_SEED_POOL.map((seed) => fetchRoundTripRoute(body.originLat, body.originLng, targetDistanceM, seed, graphhopperKeys)),
      );
      const allRoutes = routeResults.filter((r): r is NonNullable<typeof r> => r !== null);
      // round_trip 경로는 waypoint 방식(tryDirection/tryOutAndBack)과 달리 거리 허용
      // 오차(±20%) 검증이 전혀 없었다 — 목표 5km에 3km대 후보가 그대로 통과하는 걸
      // 실측으로 확인했다(2026-09-16, 품질 검증 중 발견). 여기서도 같은 기준을 적용한다.
      const withinDistance = allRoutes.filter((r) => isWithinTolerance(r.distanceM, targetDistanceM));
      // 거리 조건을 만족하는 후보가 하나도 없으면(전부 걸러지면), 그나마 목표 거리에
      // 가장 가까운 것들이라도 쓴다 — 결과를 아예 못 주는 것보다는 낫다.
      const distanceFiltered =
        withinDistance.length > 0
          ? withinDistance
          : allRoutes.sort((a, b) => Math.abs(a.distanceM - targetDistanceM) - Math.abs(b.distanceM - targetDistanceM));
      // round_trip은 어디를 지나는지 지정할 방법이 없어서 waypoint 방식보다 품질이 낮게 나오기
      // 쉽다 — 품질 필터를 통과하는 후보가 하나라도 있으면 그것만 쓰고, 전혀 없으면(예: 이
      // 동네 전체가 주거지역) 필터 없이 전체를 쓴다 — 결과를 아예 못 주는 것보다는 낫다.
      const filtered = distanceFiltered.filter(passesRoadQuality);
      routePool = filtered.length > 0 ? filtered : distanceFiltered;
    }

    if (routePool.length === 0) {
      return new Response(JSON.stringify({ error: '경로를 만들지 못했어요. 잠시 후 다시 시도해주세요.' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 급커브가 적은 순으로 정렬해서 상위 FINAL_CANDIDATE_COUNT개만 쓴다 — 나머지는 버린다
    // (Overpass 조회·적합도 계산도 이 상위권만 대상으로 해서 불필요한 호출을 줄인다).
    // 왕복형의 반환점(turnaroundPoint)은 의도적으로 180도 꺾이는 지점이라 급회전으로
    // 세지 않는다 — 안 그러면 왕복형이 항상 순환형보다 불리하게 정렬된다.
    // 강 근처 경로(isRiverPath)는 급회전 수와 무관하게 항상 먼저 온다(2026-09-17, "한강
    // 근처면 무조건 한강 길을 뛰게 하고 싶다" 요청) — routeBuilder.ts가 후보 "생성" 단계
    // 에서 강 그룹을 우선했어도, 여기서 급회전 수로만 최종 정렬하면 회전이 좀 더 있는
    // 강변 순환로가 회전이 적은 사각형 코스 등에 밀릴 수 있어서, 최종 정렬 기준으로도
    // 명시적으로 반영한다.
    // 순환형에서 "갔다가 같은 길로 되돌아오는 가지"를 먼저 잘라낸다(shape.ts). 잘라낸 뒤
    // 거리 허용 오차(±20%)를 벗어나면 원본을 그대로 둔다 — 그건 아래 겹침 벌점이 다룬다.
    // 급회전 개수도 가지를 자른 뒤에 세야 가지 끝점(180도 꺾임)이 불필요하게 벌점으로 잡히지 않는다.
    const cleanedPool = routePool.map((route) => {
      if (route.routeType === 'OUT_AND_BACK') return route;
      const cleaned = removeSpurs(route.coordinates);
      if (!cleaned) return route;
      const distanceM = Math.round(cleaned.distanceM);
      if (!isWithinTolerance(distanceM, targetDistanceM)) return route;
      return {
        ...route,
        coordinates: cleaned.coordinates,
        distanceM,
        ascentM: Math.max(0, Math.round(route.ascentM - cleaned.removedAscentM)),
        descentM: Math.max(0, Math.round(route.descentM - cleaned.removedDescentM)),
      };
    });

    const measured = cleanedPool.map((route) => {
      const isOutAndBack = route.routeType === 'OUT_AND_BACK';
      const shape = analyzeShape(route.coordinates, { isOutAndBack });
      const sharpTurnCount = countSharpTurns(
        route.coordinates,
        undefined,
        undefined,
        route.turnaroundPoint ? { point: route.turnaroundPoint, radiusM: 30 } : undefined,
      );
      // 왕복형은 어차피 한 길을 오가는 구조라 "둥근 정도"를 따지지 않는다.
      const nonCompact = isOutAndBack ? 0 : 1 - shape.compactness;
      const penalty =
        sharpTurnCount +
        SHAPE_PENALTY.overlap * shape.overlapRatio +
        SHAPE_PENALTY.crossing * shape.selfCrossings +
        SHAPE_PENALTY.nonCompact * nonCompact;
      return { route, shape, penalty };
    });

    const withoutRetracing = measured.filter(
      ({ route, shape }) => route.routeType === 'OUT_AND_BACK' || shape.overlapRatio <= MAX_LOOP_OVERLAP_RATIO,
    );
    const routes = (withoutRetracing.length > 0 ? withoutRetracing : measured)
      .sort((a, b) => {
        if (a.route.isRiverPath !== b.route.isRiverPath) return a.route.isRiverPath ? -1 : 1;
        return a.penalty - b.penalty;
      })
      .slice(0, FINAL_CANDIDATE_COUNT)
      .map(({ route }) => route);

    // Overpass 무료 공개 서버는 같은 클라이언트에서 동시에 여러 요청을 보내면(테스트로
    // 실측: 3개 동시 요청 중 2개가 "서버가 바빠서" 실패함) 대부분 실패한다 — 그래서 후보마다
    // 따로 호출하지 않고, 후보들의 bbox를 합쳐서 한 번의 Overpass 호출로 다 같이 조회한다
    // (2026-09-15: 후보 3개를 순서대로 3번 부르니 그것만으로 20~30초씩 걸려서, 한 번으로
    // 줄였다 — 어차피 같은 출발지 근처라 bbox가 많이 겹쳐서 정확도 손실은 없다).
    // Nominatim은 별개 서버라 이 호출과 무관하게 병렬로 같이 돌려도 된다.
    const [neighborhood, rawCharacteristicsList] = await Promise.all([
      reverseGeocodeNeighborhood(body.originLat, body.originLng),
      fetchCourseCharacteristicsForRoutes(routes.map((route) => ({ coordinates: route.coordinates, turnaroundPoint: route.turnaroundPoint }))),
    ]);
    const namePrefix = neighborhood ?? '출발지 인근';

    const paired = routes.map((route, i) => ({ route, characteristics: rawCharacteristicsList[i] }));

    // 확인된 보행 금지(foot=no)/통제구역(access=no·private) 구간을 지나가는 후보는
    // 무조건 뺀다 — 다른 필터와 달리 "전부 걸러지면 필터 없이 통과" 예외를 두지 않는다
    // (2026-09-16, "보행 금지 구간이 다른 선호 점수로 상쇄되지 않게 하라" 피드백).
    // 확인 불가(null)는 안전하다는 뜻이 아니지만, 근거 없이 차단할 수도 없어 통과시킨다.
    const walkabilityFiltered = paired.filter(({ characteristics }) => characteristics.hasConfirmedProhibitedSegment !== true);
    if (walkabilityFiltered.length === 0) {
      // 상위 후보 전부가 확인된 보행 금지 구간을 지나간다 — 흔치 않지만, 이 경우는 절대
      // 다른 필터처럼 "필터 없이 통과"시키지 않고 그대로 실패로 반환한다.
      return new Response(JSON.stringify({ error: '안전하게 걸을 수 있는 경로를 만들지 못했어요. 잠시 후 다시 시도해주세요.' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 표시된 횡단보도 없이 도로를 건너는 지점이 너무 많은 후보는 뺀다 — 전부 걸러지면
    // (필터 없이도 결과가 아예 안 나오는 것보다는 낫다는 판단으로) walkabilityFiltered를 그대로 쓴다.
    const qualityFiltered = walkabilityFiltered.filter(
      ({ characteristics }) =>
        characteristics.unmatchedCrossingCount === null || characteristics.unmatchedCrossingCount <= MAX_UNMATCHED_CROSSINGS,
    );
    const finalPairs = qualityFiltered.length > 0 ? qualityFiltered : walkabilityFiltered;

    const scored = finalPairs.map(({ route, characteristics }) => {
      const rawCourse: RawCourse = {
        distanceM: route.distanceM,
        ascentM: route.ascentM,
        environmentRatios: characteristics.environmentRatios,
        trafficLightCount: characteristics.trafficLightCount,
        stairCount: characteristics.stairCount,
      };
      const { fitScore, reasonText: baseReasonText } = calculateFit(rawCourse, condition);
      // 순환형/왕복형 표시 — scoring.ts는 이 축을 몰라도 되게, 여기서 근거 문장 맨 앞에
      // 붙인다(2026-09-16, "결과에 순환형/왕복형/혼합형을 표시하고 근거를 보여달라" 피드백).
      const shapeLabel = route.routeType === 'OUT_AND_BACK' ? '왕복형' : '순환형';
      const reasonText = `${shapeLabel} · ${baseReasonText}`;
      const [startLng, startLat] = route.coordinates[0];
      const originAccessDistanceM = Math.round(distanceMeters(body.originLng, body.originLat, startLng, startLat));
      if (originAccessDistanceM > ORIGIN_ACCESS_WARNING_M) {
        console.error(
          '[recommend] 출발지-네트워크 접근 거리가 큼(GraphHopper가 멀리 스냅했을 수 있음)',
          originAccessDistanceM,
        );
      }
      return { route, characteristics, fitScore, reasonText, originAccessDistanceM };
    });
    scored.sort((a, b) => b.fitScore - a.fitScore);

    // 여기서부터는 서버 권한으로 쓴다 — recommendation_candidate는 클라이언트가 직접 못 쓰게
    // RLS를 걸어뒀고(SPEC.md), 이 함수가 바로 그 "서버"다.
    const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const { data: requestRow, error: requestError } = await supabaseAdmin
      .from('recommendation_request')
      .insert({
        user_id: user.id,
        origin_lat: body.originLat,
        origin_lng: body.originLng,
        target_distance_km: condition.targetDistanceKm,
        slope_pref: condition.slopePreference,
        environment_prefs: condition.environmentPreferences,
        extra_conditions: condition.extraConditions,
      })
      .select('id')
      .single();

    if (requestError || !requestRow) {
      console.error('[recommend] recommendation_request 저장 실패', requestError);
      return new Response(JSON.stringify({ error: '추천 결과를 저장하지 못했어요.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const candidates = [];
    for (let i = 0; i < scored.length; i++) {
      const { route, characteristics, fitScore, reasonText, originAccessDistanceM } = scored[i];
      const distanceKm = route.distanceM / 1000;
      const name = `${namePrefix} ${distanceKm.toFixed(1)}km 코스`;

      const { data: candidateRow, error: candidateError } = await supabaseAdmin
        .from('recommendation_candidate')
        .insert({
          request_id: requestRow.id,
          rank: i + 1,
          distance_m: route.distanceM,
          ascent_m: route.ascentM,
          descent_m: route.descentM,
          fit_score: fitScore,
          reason_text: reasonText,
          algorithm_version: ALGORITHM_VERSION,
          geometry: toWktLineStringZ(route.coordinates),
          // course는 아직 안 만든다 — 저장하기/이 코스로 달리기를 누를 때만 ensure_course_for_candidate()가
          // 만든다(대부분의 후보는 저장되지 않고 버려지므로, 여기서 매번 만들면 낭비다).
          // 그때 필요한 값들(이름·환경비율 등)만 미리 스냅샷으로 남겨둔다.
          name,
          traffic_light_count: characteristics.trafficLightCount,
          stair_count: characteristics.stairCount,
          environment_ratios: characteristics.environmentRatios,
        })
        .select('id')
        .single();

      if (candidateError || !candidateRow) {
        console.error('[recommend] recommendation_candidate 저장 실패', candidateError);
        continue; // 이 후보만 건너뛴다 — 나머지는 계속 반환한다.
      }

      candidates.push({
        id: candidateRow.id,
        name,
        coordinates: route.coordinates,
        distanceM: route.distanceM,
        ascentM: route.ascentM,
        descentM: route.descentM,
        estimatedDurationS: Math.round(distanceKm * ASSUMED_PACE_S_PER_KM),
        environmentRatios: characteristics.environmentRatios,
        trafficLightCount: characteristics.trafficLightCount,
        stairCount: characteristics.stairCount,
        fitScore,
        reasonText,
        routeType: route.routeType,
        confirmedSidewalkRatio: characteristics.confirmedSidewalkRatio,
        originAccessDistanceM,
      });
    }

    return new Response(JSON.stringify({ candidates }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('[recommend] 처리 중 오류', e);
    return new Response(JSON.stringify({ error: '알 수 없는 오류가 발생했어요.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
