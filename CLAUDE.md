# DO RUN (러닝 코스 추천 앱)

조건(거리·경사·환경·부가조건)을 입력하면 실제 걸을 수 있는 순환/왕복 러닝 코스를 추천하고,
코스 상세 → 러닝 → 기록·평가까지 이어지는 앱. 한국어 UI·한국어 주석이 기본이다.

@AGENTS.md

## 스택
- Expo SDK 57 + expo-router(파일 기반 라우팅), React Native 0.86, **웹도 같이 지원**(정적 export)
- 상태: Zustand(`src/stores`). 서버: Supabase(Auth, Postgres, Edge Functions/Deno, Storage)
- 경로 계산: GraphHopper Directions API. 지도 데이터: OpenStreetMap(Overpass API 미러)
- 지도 표시: 카카오맵 JS SDK를 WebView로 띄움(별도 저장소 `juribb/running-course-map-web`)
- 배포: 웹은 Vercel 정적 배포

## 자주 쓰는 명령
```bash
npx expo start --web              # 웹 개발 서버 (포트 8081)
npx tsc --noEmit                  # 타입체크 (Edge Function 폴더는 Deno 전용이라 별도)
bash scripts/deploy-web.sh        # 웹 빌드+Vercel 프로덕션 배포 (반드시 이 스크립트로)
npx supabase db push              # 마이그레이션 적용
npx supabase functions deploy recommend
```
테스트 프레임워크는 없다. 검증은 타입체크 + 브라우저/Playwright 직접 확인으로 한다.

## 구조
- `app/(tabs)/` — **모든 화면이 한 개의 Tabs 네비게이터 안에 있다.** 탭 버튼 없는 화면(결과, 코스 상세,
  로그인 등)은 `href: null`로 등록해 하단 메뉴가 계속 보이게 한다.
- `src/lib` 서버 호출·도메인 로직, `src/stores` Zustand, `src/constants` 옵션·가중치·약관 문구
- `supabase/functions/recommend/` — 추천 파이프라인
  (`routeBuilder` 후보 생성 → `shape` 모양 정리 → `overpass` 환경·신호등·계단 조회 → `scoring` 적합도)
- `supabase/migrations/` — 순번 SQL. 새 마이그레이션은 0015부터

## 꼭 지킬 것
- **적합도 로직은 두 곳에 있다**: `src/lib/scoring.ts`(클라이언트)와 `supabase/functions/recommend/scoring.ts`
  (서버 사본, Edge Function은 `@/` 경로를 못 씀). 바꿀 땐 **두 파일을 같이** 고친다. 가중치는 40/25/25/10(합 100).
- **이 서비스에는 AI/LLM이 없다.** 추천은 규칙 기반 가중합이고 추천 이유 문구는 템플릿이다.
  발표·문서에서 "AI가 추천한다"고 쓰지 말 것. AI는 개발 과정에서만 썼다.
- **없는 기능을 UI/문서에 쓰지 않는다.** 예: 평가(`course_reviews`)는 저장·조회만 하고 추천에 반영되지 않는다.
  (실제로 "평가가 다음 추천을 정확하게 만든다"는 문구가 있다가 사실이 아니라 고쳤다.)
- 비밀키(`.env`, 구글 `client_secret*.json`, service_role)는 절대 커밋하지 않는다.
  서버 비밀은 코드가 아니라 Supabase 환경변수에만 둔다.
- 외부 키·계정은 **삭제는 명시적으로 요청받았을 때만**. 테스트로 만든 계정은 끝나면 Admin API로 정리한다.

## 배포 (웹)
- 항상 `scripts/deploy-web.sh`. `expo export`가 `dist/`를 통째로 새로 만들어 `vercel.json`·`.vercelignore`가
  사라지므로, 스크립트가 백업본(`vercel.deploy-config.json.bak`, `vercel-ignore-config.bak`)을 복원한다.
- Vercel은 `node_modules`라는 이름의 폴더를 자동 제외한다 → 아이콘 폰트 경로를 `vendor-modules`로 바꾸는
  단계가 스크립트에 있다. 건드리지 말 것.
- 배포 URL을 새로 쓰면 Supabase Auth `uri_allow_list`에 추가해야 로그인 리다이렉트가 된다.
- 번들의 한글은 `\uXXXX`로 이스케이프돼서 `grep 한글`로는 배포 확인이 안 된다.

## 알려진 함정 (실제로 겪은 것)
**React Native Web / 화면**
- `Alert.alert()`는 웹에서 아무 동작도 안 한다(no-op). 확인창이 필요하면 웹용 대체 UI를 쓴다.
- 일반 `<Svg>`는 웹에서 `position: static`이라 absolute 형제 아래로 가려진다 → `position: 'relative'`를 준다.
- 탭 화면은 **계속 마운트된 채로 남는다**(`unmountOnBlur` 미지원). 스크롤 위치·`useState`가 남으므로
  `useFocusEffect`로 직접 초기화한다. 의도적으로 돌아오는 경로(조건 수정, 위치 선택, 로그인 닫기)는
  `markPreserveOnReturn()`을 먼저 호출해야 입력값이 유지된다.
- `page.screenshot({fullPage:true})`는 먹지 않는다(`body{overflow:hidden}`). 뷰포트 높이를 키워서 찍는다.
- 하단 탭바: 웹에서는 `height: calc(58px + env(safe-area-inset-bottom))` + `paddingBottom: env(...)`.
  `app/+html.tsx`의 `viewport-fit=cover`가 있어야 사파리 안전영역이 0이 아니다.
- `profileStore.profile`: `undefined`=아직 조회 전, `null`=조회했는데 없음. 이 구분을 깨면 SNS 로그인 때마다
  약관 동의 화면이 다시 뜬다.

**추천 서버**
- Overpass는 필터 15개를 한 쿼리로 보내면 타임아웃 → **인프라 8 + 환경 7 두 쿼리를 병렬**로 보낸다.
- `OVERPASS_RETRIES`는 **0 유지**. 후보 3개 × 15초 × 재시도면 클라이언트 타임아웃(70초)을 넘는다.
- GraphHopper 무료 키는 분당 한도가 있어 키 2개를 번갈아 쓴다(429 시 자동 전환). 테스트 호출을 아껴 쓴다.
- 확인된 보행 금지(foot=no)/출입 통제 구간은 다른 필터와 달리 "전부 걸러지면 통과" 예외가 없다.

## 운영 메모
- Supabase 무료 프로젝트(`xwuesgbzfnzvrsxzawrf`)는 오래 안 쓰면 **일시정지**된다. 정지 중엔 추천·로그인이 전부 안 된다.
  발표·시연 전에 대시보드에서 Restore 상태를 확인한다.
- Supabase 키 확인: `npx supabase projects api-keys --project-ref <ref>` (토큰은 맥 키체인 "Supabase CLI").
- Playwright로 가입/추천 흐름을 돌릴 때는 `devices['iPhone 13']`, 위치는 `context.setGeolocation`으로 지정한다.
  테스트 후보 수는 위치에 따라 달라진다.

## 작업 방식 (선호)
- 원인부터 코드·데이터로 확인하고 고친다. 추측으로 문구/수치를 쓰지 않는다.
- UI 변경은 브라우저에서 직접 눌러 확인한 뒤 배포한다. 배포 후 라이브 번들에서도 확인한다.
- 사용자-facing 문구가 실제 동작과 다르면 코드를 문구에 맞추기보다 먼저 사실에 맞게 낮춘다.
