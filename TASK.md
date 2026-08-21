# mungchilog — 작업 체크리스트

출발: **2026-09-07** · 개발 완료(기능 동결) 목표: **2026-09-01** (협상 대상 아님)
상세 아키텍처/결정 근거는 `PLAN.md` 참고.

## M0 — 관통 배포 (오늘, 2026-08-21)
- [x] Porkbun DNS: `mungchilog.app.jyje.online` → CNAME → `r5iny.iptime.org.` 생성
- [x] `apps/server` 최소 Hono 스캐폴드 (`GET /healthz`, 정적 파일 서빙)
- [x] `apps/server/Dockerfile` (multi-stage, arm64)
- [x] `.github/workflows/build.yml` — GHCR 푸시 (`linux/arm64`)
- [x] `jyje/mungchilog` main에 첫 커밋 push
- [x] GH Actions 빌드 성공 확인 (`gh run list --repo jyje/mungchilog`) — GHCR public 패키지 확인 완료
- [x] `jyje/cluster`에 Helm chart(`helm/mungchilog/mungchilog-0.1.0/`) + ArgoCD `Application`(`clusters/r4spi/apps/mungchilog.yaml`) 추가, PR ([#49](https://github.com/jyje/cluster/pull/49))
- [ ] **PR #49 리뷰 후 머지** (사용자 액션 필요) → ArgoCD sync 확인 (`kubectl --context microk8s get application mungchilog -n argocd`)
- [ ] `kubectl --context microk8s get pods,ingress,certificate -n mungchilog` 정상 확인
- [ ] `curl -sI https://mungchilog.app.jyje.online/healthz` → 200
- [ ] 폰에서 실제 접속 확인

## M1 — JSON import + 목록 화면 (08-24 ~ 08-25)
- [ ] SQLite 스키마: `trips`(JSON 컬럼), `legs`(캐시) 2테이블
- [ ] PVC를 `longhorn` StorageClass로 마운트 (NFS 아님 — SQLite WAL 락 이슈)
- [ ] `POST /api/trips/import` — 일정 JSON 통째로 저장
- [ ] `GET /api/trips/:id` — 조회
- [ ] 일자별 스팟 목록 화면 (지도 없이)
- [ ] 여행 일정 JSON 스키마 확정, 예시 파일 작성

## M2 — 지도 + 마커 + 드래그 (08-26 ~ 08-27)
- [ ] `apps/web` (Vite + React) 스캐폴드
- [ ] Google Maps JS API 키 발급 (HTTP referrer 제한: `mungchilog.app.jyje.online`)
- [ ] `@vis.gl/react-google-maps`로 지도 렌더링 + 마커
- [ ] dnd-kit으로 스팟 순서 드래그
- [ ] **taste-skill 적용** (`.agents/skills/design-taste-frontend` 등) — 레이아웃/타이포/모션 기본기
- [ ] 서버가 `apps/web` 빌드 산출물을 `/apps/server/public`에 정적 서빙하도록 빌드 파이프라인 연결

## M3 — Routes 프록시 + 캐시 (08-28 ~ 08-30)
- [ ] Google Maps Routes/Places API 키 발급 (서버 전용, 클라이언트 미노출)
- [ ] `kubeseal`로 SealedSecret 작성 → `jyje/cluster` PR (hermes-agent 패턴과 동일하게 `extraResources`로 인라인)
- [ ] Cloud Console에서 Routes 일일 쿼터 상한 + 예산 알림 $1 설정
- [ ] `POST /api/legs/compute` — `(fromPlaceId, toPlaceId, mode, 요일·시간대 버킷)` 캐시 키, 30일 TTL
- [ ] 드래그 드롭 후 debounce 800ms로만 재계산 (드래그 중 호출 금지)
- [ ] 구간별 수단/시간/거리 UI

## M4 — 살 것/먹을 것 체크 + 영업시간 (08-31)
- [ ] `items` 테이블/JSON: kind(buy|eat|todo), title, price, done
- [ ] 스팟 탭 → 체크리스트 UI
- [ ] Places `regularOpeningHours` 표시 ("오늘 여는가" 우선)
- [ ] `nameLocal`(일본어 원문) 표시 — 현지에서 화면 보여줄 용도

## M5 — PWA + 오프라인 → 기능 동결 (09-01)
- [ ] Workbox 서비스워커, manifest.json
- [ ] IndexedDB persister (TanStack Query)
- [ ] 홈화면 설치 테스트
- [ ] 비행기모드에서 일정/지도 조회 확인
- [ ] **이 날짜 이후 코드 변경 금지**

## 리허설 & 출발 준비 (09-02 ~ 09-07)
- [ ] 09-02~03: 실기기 리허설 (폰 설치, 기내모드, 로밍 시뮬레이션)
- [ ] 09-04~05: 실제 여행 데이터 입력 + 하루 통째 예행연습
- [ ] 09-06: 예비일 — 아무 작업 안 함
- [ ] 폴백 확인: `trips.data` JSON → Google My Maps export 버튼 동작

## v1에서 뺀 것 (하지 않음)
TSP 자동 최적화, 다인 공유/동시편집, 예산 정산, 사진 업로드, 항공/숙박 예약 파싱, 인증(Electron 데스크톱 셸도 여행 후로)
