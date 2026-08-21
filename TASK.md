# mungchilog — 작업 체크리스트

출발: **2026-09-07** · 개발 완료(기능 동결) 목표: **2026-09-01** (협상 대상 아님)
상세 아키텍처/결정 근거는 `PLAN.md` 참고.

로컬 라이브 리로드 개발 서버가 항상 떠 있습니다: `http://localhost:5173` (웹, HMR) → API는 `http://localhost:3000`으로 프록시. 지도만 리퍼러 제한 때문에 로컬에서는 placeholder로 보입니다(정상, 배포 도메인에서만 실제 지도 로드).

## ⛔ 사용자만 할 수 있는 것 (막힌 항목)

- **Google Cloud Console에서 Places API (New) 언블록** — Maps JS 키·Routes API는 이미 라이브로 정상 동작 확인했습니다. Places API만 이 서버 키에서 `API_KEY_SERVICE_BLOCKED`로 막혀 있어서, 키의 "API 제한사항"에 **Places API (New)**를 추가해주세요 (`docs/google-maps-setup.md` 3-2 참고). 이것만 풀리면 영업시간 표시(M4)까지 완전히 끝납니다.
- Basic Auth 비밀번호 확인 — 파일로 보내드렸습니다. 비밀번호 관리자로 옮겨두세요.
- (선택) 실제 여행 일정 JSON — 09-04~05 리허설 전까지만 있으면 됩니다. `/import` 화면에 붙여넣으시면 됩니다 (레포·채팅에는 절대 안 올립니다).
- (알려진 제약) 웹 폼(`+ 스팟 추가`)으로 만든 스팟은 아직 `placeId`/좌표가 없어서 지도 마커·구간 경로가 안 뜹니다. 정확한 장소가 필요하면 지금은 `/import`로 JSON에 `placeId`(또는 `lat`/`lng`)를 직접 넣어주세요 — 장소 검색 UI는 아직 없습니다 (여유 있으면 다음 작업으로).

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
- [x] **지역 일반화**: `timezone`/`currency`가 `Asia/Tokyo`/`JPY`에 하드코딩돼 있던 걸 전부 제거 (IANA 타임존 아무거나, `regionCode` 강제 삭제) — 뉴욕/USD 여행 생성까지 라이브 검증
- [x] `DELETE /api/trips/:id` + 목록 삭제 버튼
- [x] taste-skill 적용 (터치 타겟, 탭 피드백 — 랜딩페이지 전용 항목은 범위 밖으로 제외)
- [x] **라이브에서 실제 Google 지도 렌더링 확인** (사용자 스크린샷으로 확인)

## M3 — Routes 프록시 + 캐시 ✅ 완료, 라이브 동작 확인
- [x] `POST /api/legs/compute` — 501(키 없음)/캐시/Routes API 호출, 30일 TTL, `(fromPlaceId, toPlaceId, mode, 요일·시간대 버킷)` 캐시 키
- [x] **버그 발견·수정 (인프라)**: 서버의 모든 외부 HTTPS 호출이 `fetch failed`로 실패하고 있었음. 원인은 r4spi 클러스터 CoreDNS가 AAAA 쿼리를 전부 NXDOMAIN으로 응답하도록 설정돼 있는데(의도된 IPv4 전용 정책), Alpine의 musl libc `getaddrinfo()`가 AAAA NXDOMAIN을 "호스트 자체가 없음"으로 해석해서 A 레코드 폴백 없이 전체 조회를 실패시킴 — Google뿐 아니라 `www.google.com` 같은 아무 외부 호스트나 다 실패했었음. 클러스터 공용 CoreDNS 설정(다른 프로덕션 서비스들이 의존)은 건드리지 않고, 이 앱의 아웃바운드 호출에만 `dns.resolve4()` 기반 IPv4 전용 조회를 붙여서 해결 (`apps/server/src/dns-fix.ts`). 실제 Alpine 컨테이너에서 Google API 응답(진짜 400/404) 받는 것까지 확인
- [x] **버그 발견·수정 (코드)**: `LegInfo`가 여행 당일 시각 대신 요청 시점("지금")을 Routes API에 넘기고 있어서 미래 날짜 조회가 틀어질 뻔함 — codex가 잡음, IANA 타임존 기반 정확한 변환으로 수정 (뉴욕 서머타임까지 검증)
- [x] **라이브 검증**: 서버 키로 Routes API 실제 호출 성공 확인 (가짜 placeId로 404는 정상 — 진짜 장소 데이터가 아직 없어서)
- [x] **지도 위 경로 시각화 (신규 요청 반영)**: 하루 동선을 지도에 화살표 폴리라인으로 표시. Routes API가 실제로 준 도로/철도 경로(`encodedPath`)를 그리고, 아직 안 풀렸으면 좌표 간 직선으로 우아하게 대체 (`RouteOverlay.tsx`) — 키/placeId 갖춰지면 코드 변경 없이 자동으로 실제 경로로 업그레이드
- [ ] Cloud Console Routes 일일 쿼터 상한 + 예산 알림 — 사용자가 스크린샷으로 이미 일부 설정 확인해주심

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

## 다음 후보 (여유 있으면, 마일스톤 아님)
- 웹 폼으로 스팟 추가할 때 Google Places 검색/자동완성 붙이기 (지금은 JSON import만 placeId를 받을 수 있음)

## 리허설 & 출발 준비 (09-02 ~ 09-07)
- [ ] 09-02~03: 실기기 리허설 (폰 설치, 기내모드, 로밍 시뮬레이션) — PWA 설치가 Basic Auth와 실제로 잘 맞물리는지 최종 확인
- [ ] 09-04~05: 실제 여행 데이터 입력 + 하루 통째 예행연습
- [ ] 09-06: 예비일 — 아무 작업 안 함
- [ ] 폴백 확인: `trips.data` JSON → Google My Maps export

## v1에서 뺀 것 (하지 않음)
TSP 자동 최적화, 다인 공유/동시편집, 예산 정산, 사진 업로드, 항공/숙박 예약 파싱, Electron 데스크톱 셸(여행 후로)
