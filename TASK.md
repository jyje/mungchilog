# mungchilog — 작업 체크리스트

출발: **2026-09-07** · 개발 완료(기능 동결) 목표: **2026-09-01** (협상 대상 아님)
상세 아키텍처/결정 근거는 `PLAN.md` 참고.

## ⛔ 사용자만 할 수 있는 것 (막힌 항목)

- **Google Cloud 프로젝트 + Maps Platform API 키 3종** (Maps JS / Places / Routes) — GCP 계정·결제가 필요해서 제가 대신 만들 수 없습니다. M2의 지도는 키가 없어도 자리(placeholder)만 잡아뒀고, M3(구간 정보)는 이 키 없이는 아예 시작할 수 없습니다. 발급되면 GitHub Actions repo secret `VITE_GOOGLE_MAPS_API_KEY`(Maps JS)와 서버용 키(Places/Routes, SealedSecret으로 넣을 예정)만 알려주시면 나머지는 제가 연결합니다.
- Basic Auth 비밀번호 확인 — 파일로 보내드렸습니다. 비밀번호 관리자로 옮겨두세요.
- (선택) 실제 여행 일정 JSON — 09-04~05 리허설 전까지만 있으면 됩니다. `/import` 화면에 붙여넣으시면 됩니다 (레포·채팅에는 절대 안 올립니다).

## M0 — 관통 배포 ✅ 완료 (08-21)
- [x] Porkbun DNS: `mungchilog.app.jyje.online` → CNAME → `r5iny.iptime.org.`
- [x] `apps/server` Hono 스캐폴드, Dockerfile, GH Actions → GHCR
- [x] `jyje/cluster`에 Helm chart + ArgoCD Application, PR [#49](https://github.com/jyje/cluster/pull/49) 머지
- [x] 배포 중 발견된 버그 수정: PVC가 존재하지 않는 `longhorn` StorageClass를 참조해 Pending 고착 → `subdir-usb`로 전환, PR [#50](https://github.com/jyje/cluster/pull/50) (codex 리뷰 반영, PVC 수동 재생성)
- [x] 개인 여행 정보 보호를 위해 ingress에 Basic Auth 추가 (SealedSecret)
- [x] ArgoCD `Synced`/`Healthy`, PVC `Bound`, 인증서 `Ready`
- [x] `https://mungchilog.app.jyje.online/healthz` → 200 (Basic Auth, Playwright로 확인)

## M1 — JSON import + 목록 화면 ✅ 완료 (08-21)
- [x] SQLite 스키마: `trips`(JSON 컬럼), `legs`(캐시) 2테이블, `node:sqlite` 사용
- [x] NFS(`subdir-usb`) 위에서 안전하도록 `journal_mode=DELETE` 강제 (WAL 아님)
- [x] `POST /api/trips/import` (upsert), `GET /api/trips`, `GET /api/trips/:id`
- [x] 여행 일정 JSON 스키마(zod) 확정, `examples/trip-sample.json` (가상 데이터)

## M2 — 지도 + 마커 + 드래그 + 입력 UI ✅ 완료, 라이브 검증됨 (08-21~22)
- [x] `apps/web` (Vite + React 19 + TS) 스캐폴드
- [x] `@vis.gl/react-google-maps` 지도+마커 — **API 키 없으면 placeholder로 우아하게 대체** (블로커 참고)
- [x] dnd-kit으로 스팟 순서 드래그, 체크리스트 토글 (둘 다 800ms debounce로 저장)
- [x] `/import` 페이지 — JSON 붙여넣기로 일정 입력 (요청하신 "데이터 입력 플랫폼")
- [x] 서버가 `apps/web` 빌드 산출물을 `/public`로 정적 서빙 (멀티스테이지 Dockerfile)
- [x] Playwright로 실제 배포본 검증: `/import` → 저장 → `/trips/:id` 이동 → 체크리스트 토글 → 새로고침해도 유지됨 확인
- [ ] taste-skill로 시각 다듬기 — 기본 스타일은 적용, 본격 폴리싱은 M5 이후 여유 있으면

## M3 — Routes 프록시 + 캐시 (⛔ Maps API 키 대기)
- [x] `POST /api/legs/compute` 골격 작성 — 키 없으면 501, 있으면 캐시+Routes API 호출 (로컬 검증 완료, 라이브 키로는 미검증)
- [ ] Google Maps Routes/Places API 키 발급 — **사용자 액션**
- [ ] `kubeseal`로 SealedSecret 작성 → `jyje/cluster` PR
- [ ] Cloud Console에서 Routes 일일 쿼터 상한 + 예산 알림 $1 설정
- [ ] 드래그 드롭 후 debounce 800ms로만 재계산
- [ ] 구간별 수단/시간/거리 UI

## M4 — 살 것/먹을 것 체크 + 영업시간
- [x] 체크리스트 UI/데이터 모델 (M2에서 선반영, 라이브 검증됨)
- [ ] Places `regularOpeningHours` 표시 ("오늘 여는가") — Maps 키 필요
- [x] `nameLocal`(일본어 원문) 표시

## M5 — PWA + 오프라인 → 기능 동결 (목표 09-01)
- [x] vite-plugin-pwa: manifest, 서비스워커(Workbox), 오프라인 캐싱(`/api/trips*` NetworkFirst)
- [x] **버그 발견·수정**: Basic Auth가 `/sw.js`·`/manifest.webmanifest`까지 막아서 PWA 설치가 깨질 뻔함 (Playwright로 401 확인) → 정적 자산만 별도 무인증 Ingress로 분리, PR [#52](https://github.com/jyje/cluster/pull/52) 병합, curl로 200 재확인
- [ ] IndexedDB persister (TanStack Query 캐시 영속화 — 현재는 Workbox의 NetworkFirst 캐시만 있음, 더 견고하게 하려면 추가)
- [ ] **실기기에서 홈화면 설치 테스트 필요** — 헤드리스 브라우저 자동화로는 서비스워커 등록이 불안정하게 나와서(서버 쪽은 curl로 정상 확인됨) 진짜 신뢰할 수 있는 확인은 D-3 실기기 리허설에서
- [ ] 비행기모드에서 일정 조회 확인
- [ ] **이 날짜 이후 코드 변경 금지**

## 리허설 & 출발 준비 (09-02 ~ 09-07)
- [ ] 09-02~03: 실기기 리허설 (폰 설치, 기내모드, 로밍 시뮬레이션) — **PWA 설치가 Basic Auth와 실제로 잘 맞물리는지 여기서 최종 확인**
- [ ] 09-04~05: 실제 여행 데이터 입력 + 하루 통째 예행연습
- [ ] 09-06: 예비일 — 아무 작업 안 함
- [ ] 폴백 확인: `trips.data` JSON → Google My Maps export 버튼 동작

## v1에서 뺀 것 (하지 않음)
TSP 자동 최적화, 다인 공유/동시편집, 예산 정산, 사진 업로드, 항공/숙박 예약 파싱, Electron 데스크톱 셸(여행 후로)
