# mungchilog — 작업 체크리스트

출발: **2026-09-07** · 개발 완료(기능 동결) 목표: **2026-09-01** (협상 대상 아님)
상세 아키텍처/결정 근거는 `PLAN.md` 참고.

로컬 라이브 리로드 개발 서버가 항상 떠 있습니다: `http://localhost:5173` (웹, HMR) → API는 `http://localhost:3000`으로 프록시. 지도 키가 배포 도메인으로만 리퍼러 제한돼 있어서, 로컬에서는 "지도를 불러오지 못했습니다" 안내가 뜹니다(정상, 배포 도메인에서만 실제 지도 로드 — 아래 블로커 항목에 로컬 허용 방법도 적어뒀습니다).

## ⛔ 사용자만 할 수 있는 것 (막힌 항목)

- **Google Cloud Console에서 Places API (New) 언블록 — 서버 키** — Maps JS 키·Routes API는 이미 라이브로 정상 동작 확인했습니다. Places API만 이 서버 키에서 `API_KEY_SERVICE_BLOCKED`로 막혀 있어서, 키의 "API 제한사항"에 **Places API (New)**를 추가해주세요 (`docs/google-maps-setup.md` 3-2 참고). 이것만 풀리면 영업시간 표시(M4)까지 완전히 끝납니다.
- **Google Cloud Console에서 Places API (New) 언블록 — 웹 키 (신규)** — 스팟 추가/수정 폼에 장소 검색 자동완성을 붙였습니다 (아래 M2 항목 참고). 이건 서버 키가 아니라 **클라이언트(`mungchilog-web`) 키**의 API 제한사항에 Places API (New)를 추가해야 동작합니다 (`docs/google-maps-setup.md` 3-1 참고). 안 해주셔도 앱은 그대로 동작하고, 자동완성만 빠진 채 이름을 직접 입력하는 지금 방식으로 자연스럽게 대체됩니다.
  - ⚠️ **1차 시도가 403(Forbidden)으로 실패한 것 확인함** — 스크린샷 확인해보니 콘솔 "API 제한사항"에 **"Places API"(New 없음)**가 체크돼 있었습니다. 이 앱이 실제로 부르는 건 New 쪽 엔드포인트(`places.googleapis.com`)라서 구버전만 체크하면 계속 막힙니다. **정확히 "Places API (New)"라는 이름의 별개 API를 활성화·체크**해야 합니다 — `docs/google-maps-setup.md` 2·3-1에 직접 링크와 구분 방법 추가해뒀습니다.
- (선택) **로컬 개발 서버에서도 실제 지도·장소 검색 보고 싶으면** — 클라이언트(`mungchilog-web`) 키의 리퍼러 허용 목록에 `http://localhost:5173/*`를 추가해주세요 (`docs/google-maps-setup.md` 3-1 참고). 배포 사이트엔 영향 없습니다. 안 해주셔도 배포된 `mungchilog.app.jyje.online`에서는 원래 정상 동작합니다 — 로컬 미리보기 편의 목적일 뿐입니다.
- Basic Auth 비밀번호 확인 — 파일로 보내드렸습니다. 비밀번호 관리자로 옮겨두세요.
- (선택) 실제 여행 일정 JSON — 09-04~05 리허설 전까지만 있으면 됩니다. `/import` 화면에 붙여넣으시면 됩니다 (레포·채팅에는 절대 안 올립니다).
- **(신규, M6) Authentik `mungchilog` OAuth2 클라이언트 생성 방식** — 제가 API 토큰으로 직접 만들지, 제가 드리는 가이드대로 콘솔에서 직접 만드실지 채팅으로 답변 필요. **Authentik 관리자 비밀번호는 절대 저에게 주지 마세요.**

## M0 — 관통 배포 ✅ 완료 (08-21)
- [x] Porkbun DNS, Helm chart + ArgoCD Application, PR [#49](https://github.com/jyje/cluster/pull/49) 병합
- [x] 배포 중 발견된 버그 수정: 존재하지 않는 `longhorn` StorageClass → `subdir-usb` (PR [#50](https://github.com/jyje/cluster/pull/50))
- [x] 개인 여행 정보 보호를 위해 Basic Auth (SealedSecret)
- [x] `https://mungchilog.app.jyje.online/healthz` → 200 (Playwright로 확인)

## M1 — JSON import + 목록 화면 ✅ 완료 (08-21)
- [x] SQLite (`node:sqlite`), `POST /api/trips/import` (upsert), `GET/DELETE /api/trips/:id`
- [x] 여행 일정 JSON 스키마(zod), `examples/trip-sample.json`

## M2 — 지도 + 마커 + 드래그 + 입력 UI ✅ 완료, 라이브 검증됨
- [x] `apps/web` (Vite + React 19 + TS), `@vis.gl/react-google-maps` 지도+마커
- [x] dnd-kit 스팟 순서 드래그, 체크리스트 토글, `/import` JSON 붙여넣기
- [x] **웹에서 직접 만들기**: `/new`로 여행 생성(제목/날짜/시간대/통화), `+ 날짜`/`+ 스팟 추가`/`+ 살 것·먹을 것 추가` 인라인 폼, 스팟·아이템 삭제 — JSON 없이도 전부 웹 UI로 가능
- [x] **웹 폼에 장소 검색 자동완성 추가**: `+ 스팟 추가` 이름 입력창에 New Places API 기반 자동완성을 붙여서, 웹에서 만든 스팟도 `/import` JSON처럼 `placeId`/`lat`/`lng`를 자동으로 받고 지도 마커·구간 경로가 바로 뜨게 함 (`PlaceAutocompleteInput.tsx`, 지도·자동완성이 `MapsScope`로 하나의 Maps JS 로더를 공유). 웹 키에 Places API (New)가 아직 안 풀려 있으면 자동완성만 조용히 빠지고 이름 직접 입력으로 대체됨 (위 블로커 항목 참고)
- [x] **스팟 인라인 수정**: 각 스팟 카드에 ✎ 버튼 — 이름(장소 검색 포함)/현지어 이름/도착 시각/메모를 그 자리에서 바로 고칠 수 있음, 삭제 후 재입력할 필요 없음 (`SpotForm.tsx`를 추가·수정 양쪽에서 재사용)
- [x] **지도 마커에 방문 순서 번호 표시 + 전체 동선이 한눈에 들어오게 자동 확대/축소**: 스팟의 `order`대로 1, 2, 3... 핀에 번호가 붙고, 스팟이 추가/삭제/재정렬될 때마다 지도가 그날의 전체 경로가 다 보이도록 자동으로 범위를 맞춤 (`FitToSpots`)
- [x] **버그 발견·수정**: 지도 키가 로컬 리퍼러를 막을 때(`RefererNotAllowedMapError`) Google Maps 내부 마커 컴포넌트가 처리되지 않은 예외를 던져 콘솔을 오류로 도배하던 것 — `useApiLoadingStatus`로 로드 실패 상태를 감지해서 마커 대신 안내 문구로 우아하게 대체
- [x] **버그 발견·수정**: 스팟 수정 폼을 카드 안에 넣을 때 `<li>` 안에 `<li>`가 중첩돼 React가 하이드레이션 오류를 내던 것 — 수정 폼의 최상위 태그를 `<div>`로 변경 (추가 폼처럼 목록의 새 항목으로 쓸 때만 호출부에서 `<li>`로 감쌈)
- [x] **지역 일반화**: `timezone`/`currency`가 `Asia/Tokyo`/`JPY`에 하드코딩돼 있던 걸 전부 제거 (IANA 타임존 아무거나, `regionCode` 강제 삭제) — 뉴욕/USD 여행 생성까지 라이브 검증
- [x] `DELETE /api/trips/:id` + 목록 삭제 버튼
- [x] taste-skill 적용 (터치 타겟, 탭 피드백 — 랜딩페이지 전용 항목은 범위 밖으로 제외)
- [x] **라이브에서 실제 Google 지도 렌더링 확인** (사용자 스크린샷으로 확인)
- [x] **노션 스타일 마크다운 메모**: 스팟별 메모(기존 `note` 필드)를 마크다운 작성/미리보기 토글 편집기로 업그레이드하고, 새로 **일자별 메모**(`day.note`, 오늘 계획·준비물 등)도 추가. 렌더링은 `marked`로 클라이언트에서만 처리 — 서버는 여전히 불투명한 문자열로 저장(스키마에 `optional` 필드 하나 추가, 마이그레이션 불필요) (`MarkdownEditor.tsx`/`MarkdownView.tsx`)
- [x] **지도/목록 레이아웃 전면 개편 (사용자 피드백 반영)**: 이전 버전(지도 위 하단 시트 고정)의 "좌우 여백 없음", "지도가 좁다", "위치 못 바꿈" 피드백을 반영해 전체를 다시 짬 — `#root`의 중앙 정렬/여백 밖으로 완전히 빠져나온 `position:fixed` 풀뷰포트 셸로 교체 (`SplitMapShell.tsx`):
  - 패널(날짜 탭+메모+스팟 목록)을 **하단/좌측/우측** 중 고를 수 있음 — 좌측 상단 ☰ 메뉴 버튼
  - 패널 크기를 **마우스/터치 드래그**로 조절 (Pointer Events, 하단은 세로 바, 좌우는 세로 핸들), 위치·크기 모두 localStorage에 저장돼 다음 방문에도 유지
  - **지도 전체화면** 토글 — 같은 메뉴에서 패널을 완전히 숨기고 지도만 꽉 채움
  - 처음 진입 시 기본 배치는 화면 폭 기준 자동 판단 (768px 미만 폰 → 하단 시트, 그 이상 태블릿/데스크톱 → 우측 분할) — 여행 중 폰이든 태블릿이든 자연스럽게 시작하도록
  - 패널 안쪽에 좌우 padding 복원 (이전 버전에서 스팟 카드가 패널 가장자리에 붙어 있던 문제 수정)
- [x] **버그 발견·수정**: 지도 우상단 Google 기본 전체화면 버튼이 눌러도 반응 없음 — 이 페이지의 `position:fixed` 풀뷰포트 구조와 브라우저 Fullscreen API가 서로 안 맞아서(버튼은 뜨는데 동작을 안 함) 생긴 문제. 이미 만들어둔 앱 자체의 "☰ 메뉴 → 지도 전체화면" 토글이 같은 역할을 하므로, Google 기본 버튼은 `fullscreenControl={false}`로 아예 제거
- [x] **버그 발견·수정**: `+ 날짜`로 날짜를 늘려도 상단에 표시되는 여행 기간(`startDate ~ endDate`)이 안 바뀌던 것 — 새 날짜가 기존 `endDate`보다 뒤면 `endDate`도 같이 밀어주도록 수정
- [x] **대표 장소와 대표 이미지**: 여행 상세에서 일정의 스팟을 대표 장소로 선택하고 JPEG, PNG, WebP 이미지를 2 MiB까지 업로드할 수 있음. 목록은 사진을 우선 표시하고 없으면 대표 장소의 지도를 표시. 이미지 data URL은 일시적으로 `trips.data`에 저장하며, 객체 저장소 이전과 마이그레이션은 [#9](https://github.com/jyje/mungchilog/issues/9)에서 진행

## M3 — Routes 프록시 + 캐시 ✅ 완료, 라이브 동작 확인
- [x] `POST /api/legs/compute` — 501(키 없음)/캐시/Routes API 호출, 30일 TTL, `(fromPlaceId, toPlaceId, mode, 요일·시간대 버킷)` 캐시 키
- [x] **버그 발견·수정 (인프라)**: 서버의 모든 외부 HTTPS 호출이 `fetch failed`로 실패하고 있었음. 원인은 r4spi 클러스터 CoreDNS가 AAAA 쿼리를 전부 NXDOMAIN으로 응답하도록 설정돼 있는데(의도된 IPv4 전용 정책), Alpine의 musl libc `getaddrinfo()`가 AAAA NXDOMAIN을 "호스트 자체가 없음"으로 해석해서 A 레코드 폴백 없이 전체 조회를 실패시킴 — Google뿐 아니라 `www.google.com` 같은 아무 외부 호스트나 다 실패했었음. 클러스터 공용 CoreDNS 설정(다른 프로덕션 서비스들이 의존)은 건드리지 않고, 이 앱의 아웃바운드 호출에만 `dns.resolve4()` 기반 IPv4 전용 조회를 붙여서 해결 (`apps/server/src/dns-fix.ts`). 실제 Alpine 컨테이너에서 Google API 응답(진짜 400/404) 받는 것까지 확인
- [x] **버그 발견·수정 (코드)**: `LegInfo`가 여행 당일 시각 대신 요청 시점("지금")을 Routes API에 넘기고 있어서 미래 날짜 조회가 틀어질 뻔함 — codex가 잡음, IANA 타임존 기반 정확한 변환으로 수정 (뉴욕 서머타임까지 검증)
- [x] **라이브 검증**: 서버 키로 Routes API 실제 호출 성공 확인 (가짜 placeId로 404는 정상 — 진짜 장소 데이터가 아직 없어서)
- [x] **지도 위 경로 시각화 (신규 요청 반영)**: 하루 동선을 지도에 화살표 폴리라인으로 표시. Routes API가 실제로 준 도로/철도 경로(`encodedPath`)를 그리고, 아직 안 풀렸으면 좌표 간 직선으로 우아하게 대체 (`RouteOverlay.tsx`) — 키/placeId 갖춰지면 코드 변경 없이 자동으로 실제 경로로 업그레이드
- [x] **구간별 동선 선택**: 연속 스팟마다 직선·대중교통·운전·도보를 저장하고, Routes API의 최대 3개 대안 경로 중 하나를 선택. 운전일 때만 실시간 교통을 선택할 수 있으며 5분 캐시로 호출량을 제한.
- [ ] Cloud Console Routes 일일 쿼터 상한 + 예산 알림 — 사용자가 스크린샷으로 이미 일부 설정 확인해주심
- [x] **조사 완료 (인프라, 알려진 제약으로 남김)**: 잘못된 입력을 보내면 `POST/PUT/DELETE`가 진짜 이유(400 등) 대신 `405 Method Not Allowed`로 보임 — 앱이 막힌 게 아니라, 클러스터 전역 ingress-nginx ConfigMap의 `custom-http-errors`(400,401,403,404,405,408,409,410,429,500,502,503,504) 설정이 `proxy_intercept_errors on`을 트리거해서, 앱이 낸 4xx/5xx 응답을 nginx가 가로채 GET/HEAD 전용인 `error-pages` 서비스로 내부 리다이렉트하고 거기서 다시 405가 나는 것. **정상 입력에는 영향 없음** (`/api/trips/import` 유효 payload는 계속 201). 인그레스 단위로만 우회 가능한지 라이브로 확인해봤는데: (1) `nginx.ingress.kubernetes.io/custom-http-errors` 어노테이션은 전역 목록에서 코드를 빼는 게 아니라 더하는 것만 됨(빈 값·`599` 테스트로 확인) — mungchilog Ingress만 예외 처리하는 용도로 못 씀. (2) `configuration-snippet`으로 `proxy_intercept_errors off`를 강제하는 방법은 문법상 가능하나(`allow-snippet-annotations: true`), 다른 프로덕션 앱도 걸려있는 공유 인그레스 컨트롤러에 라이브로 임의 nginx 설정을 주입하는 변경이라 사용자 확인 없이 실행하지 않음. 전역 ConfigMap 변경(다른 앱들도 영향)은 이 프로젝트 범위 밖이라 보류 — 실사용(웹 UI 정상 입력) 흐름엔 영향 없으므로 v1은 이대로 둠

## M4 — 살 것/먹을 것 체크 + 영업시간 🔑 Places API 언블록만 대기
- [x] 체크리스트 UI/데이터 모델, `nameLocal`(현지어 원문) 표시
- [x] `GET /api/places/:id/hours` + `OpeningHours` 컴포넌트 작성 완료, DNS 버그도 같이 해결됨
- [ ] 🔑 Places API (New)가 이 키에서 차단 상태 (`API_KEY_SERVICE_BLOCKED`) — 콘솔에서 풀어주시면 바로 "오늘 여는가" 뜸

## M5 — PWA + 오프라인 ✅ 완료, 라이브 검증됨
- [x] vite-plugin-pwa (manifest/서비스워커/오프라인 캐싱), IndexedDB persister
- [x] **버그 발견·수정**: Basic Auth가 `/sw.js`·manifest까지 막던 것 → 정적 자산 무인증 Ingress 분리 (PR [#52](https://github.com/jyje/cluster/pull/52))
- [x] **정리**: ArgoCD UI에 인그레스 경로 7개가 깨진 URL처럼 나열되던 것 → 2개로 통합 (PR [#58](https://github.com/jyje/cluster/pull/58), 기능 변화 없음, 전체 경로 재검증 완료)
- [x] Playwright 라이브 검증: 가져오기 → 드래그 → 체크리스트 → 새로고침 후에도 유지
- [ ] **실기기 홈화면 설치 테스트** — 헤드리스 브라우저로는 신뢰 불가, D-3 리허설에서
- [ ] 비행기모드 조회 확인
- [ ] **이 날짜 이후 코드 변경 금지**

## M6 - 로그인(Authentik OIDC) + 관리자 승인 + 여행 공유 🚧 진행 중 (08-22 설계 확정)

**확정된 제품 규칙**: 최초 로그인 사용자는 플랫폼 관리자의 승인을 받기 전까지 어떤 여행 조회도 할 수 없다. 승인 뒤에도 공개 여행 목록과 검색은 없고, 본인이 가입한 여행만 목록에 나타난다. 비멤버 여행은 정확한 UUID로 최소 정보만 확인하고 가입 요청할 수 있다. 여행 역할은 소유자, 게스트(읽기 전용), 편집자로 구분한다. 상세 권한표와 API 초안은 `PLAN.md` 5절 참고.

**현재 기반 코드 상태**: 표준 OIDC, 서버 세션, `pending` 계정, 관리자 승인 화면, `owner`/`editor` 멤버십, 초대 UI의 1차 코드가 작성돼 있고 로컬 임시 DB에서 소유자 조회, 편집자 수정, 비멤버 404, 편집자 삭제 403을 확인했다. 아래 체크리스트는 새로 확정된 가입 요청, 게스트, 단일 사용 링크, 알림, 동시편집 보호까지 포함한 완성 기준이다.

### M6.1 플랫폼 로그인과 승인 게이트

- [x] 표준 OIDC 클라이언트 기반 코드와 환경변수 플레이스홀더 추가
- [x] `/auth/login`, `/auth/callback`, `/auth/me`, `/auth/logout`, 서버 저장형 세션 쿠키 1차 구현
- [x] `/login`, `/pending`, `/admin` 기본 화면과 상단 사용자 메뉴 1차 구현
- [ ] 사용자 식별 정본을 이메일에서 `(issuer, subject)` 유일 조합으로 변경하고 이메일은 프로필로만 저장
- [ ] 사용자 상태를 `pending`/`approved`/`rejected`/`suspended`로 확장. 거절 시 계정을 삭제해 재로그인으로 우회하게 하지 말고 세션을 즉시 폐기
- [ ] `pending`, `rejected`, `suspended` 사용자는 `/auth/me`, `/auth/logout`, 상태 안내 외 모든 API를 서버에서 기본 거부
- [ ] 승인 대기 화면은 15~30초마다 상태를 확인하고, 계정 승인 및 선점 초대 적용 뒤 해당 여행 또는 `/trips`로 자동 이동
- [x] Secret의 쉼표 구분 `INITIAL_ADMIN_EMAIL` 목록으로 초기 관리자 후보를 시드하고, 검증된 OIDC 로그인 뒤 저장된 subject로 활성 관리자 식별
- [ ] Authorization Code + PKCE, state, nonce, 세션 회전, exact redirect URI, CSRF 또는 Origin 검사 회귀 테스트
- [ ] Authentik의 Google Source 검증 상태를 반영하는 `email_verified` scope mapping 문서화 및 적용

### M6.2 비공개 여행 탐색과 가입 요청

- [ ] `/trips`는 현재 사용자가 가입한 여행만 반환. 공개 전체 목록, 제목 검색, 추천 API는 만들지 않음
- [ ] 가입 여행이 없는 승인 사용자에게 빈 목록, UUID 입력 폼, 보낸 가입 요청 상태를 표시
- [ ] 소유자 여행 화면에 UUID 복사 버튼 제공. UUID만으로는 가입되지 않고 항상 요청 승인을 거치게 함
- [ ] `POST /api/trips/lookup`: UUID 문법 검증 후 제목과 소유자 표시명만 반환하고 날짜, 목적지, 일정, 멤버는 숨김
- [ ] `trip_join_requests` 테이블과 요청 생성, 취소, 목록 API 구현. `(tripId, requesterId)` 활성 요청은 하나만 허용
- [ ] 조회 10회/분, 가입 요청 5회/시간의 사용자 및 IP 속도 제한 추가
- [ ] 거절 후 24시간 재요청 제한과 소유자의 `blocked` 처리 추가
- [ ] 가입 요청 생성과 소유자 알림 생성을 하나의 트랜잭션으로 처리하고 중복 알림 방지

### M6.3 여행 역할, 승인, 멤버 관리

- [ ] `trip_members.role`을 `owner`/`editor`/`guest`로 확장
- [ ] 게스트는 일정과 지도 읽기만 허용하고 모든 변경 API에서 403
- [ ] 편집자는 날짜, 스팟, 순서, 메모, 체크리스트를 편집할 수 있지만 여행 삭제, 가입 승인, 역할 변경, 멤버 제거, 초대, 플랫폼 사용자 관리는 금지
- [ ] 소유자는 가입 요청을 `guest` 또는 `editor`로 승인, 거절, 차단하고 기존 멤버 역할 변경 및 제거 가능
- [ ] 플랫폼 관리자는 계정만 관리하고, 멤버십이 없는 여행의 일정과 멤버 정보를 볼 수 없도록 회귀 테스트
- [ ] 마지막 소유자는 스스로 나가거나 제거할 수 없게 하고, 명시적 소유권 이전 API와 확인 UI 추가
- [ ] 여행 삭제는 소유자만 가능하며 제목 재입력 확인과 7일 복구 가능한 soft delete 적용

### M6.4 사이트 알림

- [ ] `notifications` 테이블, 읽지 않은 개수, 목록, 하나 읽기, 모두 읽기 API 구현
- [ ] 가입 요청 시 해당 여행 소유자에게만 알림 생성
- [ ] 상단 알림 배지와 알림 센터 구현. 15~30초 폴링 및 창 포커스 시 즉시 갱신
- [ ] 알림 클릭 시 여행 가입 요청 패널로 이동하고 요청자 표시명, 이메일, 게스트·편집자 승인 선택 제공
- [ ] 브라우저 푸시와 이메일 알림은 v1 제외. 오프라인 중 발생한 알림은 다음 접속 시 표시

### M6.5 1시간 이내 단일 사용 초대 링크

- [ ] `trip_invites`와 `auth_intents` 테이블 추가. 소유자만 `guest`/`editor` 역할과 5/15/30/60분 TTL 선택 가능, 기본·최대 60분
- [ ] 암호학적 32바이트 난수 토큰 생성, DB에는 SHA-256 해시만 저장, 원문 URL은 생성 직후 한 번만 표시
- [ ] `/invite#token=...` 진입 시 SPA가 token을 서버의 짧은 수명 로그인 의도로 교환하고 즉시 주소에서 token 제거
- [ ] 미로그인 사용자는 OIDC 로그인 후 처리. 승인 사용자면 초대를 트랜잭션으로 단일 사용 처리하고 `/trips/:id`로 이동
- [ ] `pending` 사용자가 만료 전에 로그인하면 초대를 그 계정에 선점하고 승인 대기. 플랫폼 승인 뒤 자동 가입 및 여행 이동
- [ ] 초대 링크는 플랫폼 관리자 승인을 우회하지 않으며, 만료, 취소, 사용 완료 뒤 재사용 불가
- [ ] 이미 멤버인 사용자는 기존 역할을 변경하지 않고 여행으로 이동
- [ ] 소유자의 활성 링크 목록 및 취소 UI 구현. 목록 API와 로그에는 원문 token을 절대 포함하지 않음

### M6.6 다중 편집 안전성과 감사

- [ ] `trips.version`과 `If-Match` 또는 `baseVersion` 기반 낙관적 잠금 추가. 오래된 편집은 `409 Conflict`로 거부
- [ ] 충돌 시 최신 여행을 다시 가져오고 사용자에게 재적용 또는 취소 선택 제공. 조용한 last-write-wins 금지
- [ ] `membership_audit_logs` 추가. 가입 승인·거절·차단, 역할 변경, 제거, 초대 생성·선점·사용·취소, 소유권 이전 기록
- [ ] 로그아웃, 계정 정지, 멤버 제거 시 서버 세션과 브라우저의 해당 사용자 PWA 개인 캐시 정리
- [ ] 만료 세션, 초대, 로그인 의도, 오래된 읽은 알림의 주기적 정리 작업 추가

### M6.7 인프라와 라이브 검증

- [ ] ⚠️ Authentik에 `mungchilog` OAuth2 Provider/Application 생성 방식 결정. 관리자 비밀번호는 공유하지 않고 제한된 API 토큰 또는 콘솔 가이드 사용
- [ ] Authentik confidential client, exact redirect URI, Google Source, 테스트 계정 구성
- [ ] `mungchilog-server-oidc` SealedSecret으로 Client Secret 전달. 평문은 레포와 채팅에 남기지 않음
- [ ] Basic Auth 유지 상태에서 관리자, pending, 승인 사용자, 게스트, 편집자, 소유자 권한 매트릭스 라이브 검증
- [ ] OIDC와 API 기본 거부 검증 뒤 애플리케이션 Ingress Basic Auth 제거. 외부 초대 사용자가 공유 비밀번호 없이 로그인할 수 있게 전환
- [ ] 외부 네트워크에서 로그인, 가입 요청, 소유자 알림, 게스트 읽기, 편집자 수정, 초대 링크, 로그아웃, PWA 캐시 격리 재검증
- [ ] 만료 링크, 취소 링크, 동시 링크 사용, 승인 대기 중 링크 만료, 중복 가입 요청, 편집 충돌의 실패 경로 E2E 테스트

## 다음 후보 (여유 있으면, 마일스톤 아님)
- [ ] [#9](https://github.com/jyje/mungchilog/issues/9) 대표 이미지 Base64 저장을 객체 저장소로 이전

## 리허설 & 출발 준비 (09-02 ~ 09-07)
- [ ] 09-02~03: 실기기 리허설 (폰 설치, 기내모드, 로밍 시뮬레이션) - PWA 설치, OIDC 세션 유지, 사용자별 오프라인 캐시 격리 확인
- [ ] 09-04~05: 실제 여행 데이터 입력 + 하루 통째 예행연습
- [ ] 09-06: 예비일 — 아무 작업 안 함
- [ ] 폴백 확인: `trips.data` JSON → Google My Maps export

## v1에서 뺀 것 (하지 않음)
TSP 자동 최적화, 예산 정산, 다중 사진 앨범, 항공/숙박 예약 파싱, Electron 데스크톱 셸, 브라우저 푸시·이메일 알림, 실시간 커서, CRDT 기반 동시편집. 대표 이미지의 객체 저장소 이전은 [#9](https://github.com/jyje/mungchilog/issues/9)로 관리한다. OIDC와 여행별 게스트·편집자 공유는 M6으로 v1에 포함한다.
