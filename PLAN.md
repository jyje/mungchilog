# mungchilog — 계획

여행 동선을 짜고, 실시간으로 구글 지도 기반 거리·교통수단·살 것/먹을 것을 보여주는 개인용 여행 로그 앱. 이름은 `mungchilog` (뭉치 + log) 그대로 확정.

이 문서는 이전 세션에서 나온 초안(단일 RPi + docker compose 가정)을 실제 인프라 조사 결과로 재작성한 버전이다. 실행 체크리스트는 `TASK.md` 참고.

## 1. 인프라 현황 (2026-08-21 조사 확정)

기존 문서는 "RPi 한 대 + docker compose"를 가정했는데, 실제로는 이미 운영 중인 4노드 microk8s GitOps 클러스터(`r4spi`)가 있다. 계획을 그 위에 얹는다.

| 항목 | 실측값 |
|---|---|
| 클러스터 | microk8s v1.36.2, 노드 4대 (`raspi-40` control-plane, `raspi-41/50/51` worker), ARM64 |
| kubectl 컨텍스트 | 로컬 macOS에 `microk8s` 컨텍스트로 이미 설정됨 (`kubectl --context microk8s ...`) |
| GitOps | ArgoCD, app-of-apps 패턴. `argocd/apps` Application → `jyje/cluster` repo `clusters/r4spi/apps/` 디렉터리를 재귀 감시, 자동 sync |
| 앱 배포 단위 | 앱마다 ArgoCD `Application` 매니페스트 1개 (repo: `jyje/cluster`) + 그 안에서 참조하는 vendored Helm chart (`helm/<app>/<app>-<ver>/`, 같은 repo) |
| AppProject | `base`(일반), `ai`(LLM 계열), `default`. mungchilog은 AI 워크로드가 아니므로 `base` 사용 |
| Ingress | ingress-nginx (`className: nginx`), **hostNetwork DaemonSet**으로 운영 중 — LoadBalancer 타입 금지 (과거 MetalLB ARP 충돌로 CNPG 장애 낸 이력 있음) |
| TLS | cert-manager, `ClusterIssuer: nginx-letsencrypt-prod` (HTTP-01), 앱마다 개별 `tls.secretName` |
| DNS 패턴 | `*.app.jyje.online` → CNAME → `r5iny.iptime.org.` (홈 라우터 iptime DDNS로 포트포워딩, Cloudflare Tunnel 아님) |
| 시크릿 관리 | Sealed Secrets. `jyje/cluster`는 퍼블릭 레포이므로 **plaintext 시크릿을 Application valuesObject에 절대 넣지 않는다** |
| 스토리지 | 기본 StorageClass `subdir-usb` (NFS, Retain). 그 외 Longhorn(분산 블록), SeaweedFS(S3) 존재 |
| 레지스트리 | GHCR 사용 중이나 imagePullSecret 없음 → 기존 앱 이미지는 모두 public 패키지 |
| 리소스 제약 | 노드당 RAM 8GB. 2026-06-28 overcommit으로 인한 kubelet OOM/NodeNotReady 이력 있음 → 신규 워크로드는 request/limit을 반드시 명시하고 작게 유지 |

### DNS — 완료

`mungchilog.app.jyje.online` → CNAME → `r5iny.iptime.org.` 레코드를 Porkbun에 이미 생성했다 (기존 `n8n.app`, `grafana.app` 등과 동일 패턴, record id `577214606`). 이제 클러스터 쪽 Ingress만 뜨면 바로 접속 가능.

## 2. 범위 재조정 (D-14 미만, 이전 세션 확정 사항 유지)

앱 자체는 특정 국가·도시에 종속되지 않는다. 목적지/시간대/통화는 여행마다 사용자가 지정하는 값이고, 최초로 실제 쓰는 여행이 일본일 뿐이다 (아래 데이터 모델·좌표계 설계도 이 전제로 되어 있음).

- Electron 데스크톱: v1 제외, 여행 후로.
- 모노레포(pnpm+Turborepo): 생략. 단일 `apps/web`(Vite React) + `apps/server`(Hono) 2개 프로젝트로 충분.
- DB: SQLite. 테이블은 `trips`(일정 JSON 컬럼), `legs`(구간 캐시) 2개.
- 일정 입력: CRUD UI보다 `POST /api/trips/import` (JSON 통째로) 먼저. JSON이 정본이자 폴백(Google My Maps로 export).

## 3. 이번에 새로 확정한 아키텍처 결정

### 3.1 레포 2개로 분리 (기존 클러스터 컨벤션을 따름)

- `jyje/mungchilog`: 애플리케이션 코드(web/server) + Dockerfile + GitHub Actions
- `jyje/cluster`: ArgoCD `Application` 매니페스트 + vendored Helm chart (`helm/mungchilog/mungchilog-0.1.0/`)

**이미지 태그 반영 흐름**: `mungchilog` CI가 GHCR에 이미지를 푸시하면, 같은 워크플로우가 `jyje/cluster`에 PR을 열어 `Application.spec.source.helm.valuesObject.image.tag`를 bump한다. ArgoCD가 자동 sync. (직접 push 대신 PR로 하는 이유: `jyje/cluster`는 다른 프로젝트들과 공유하는 신뢰 경계이므로, 실수로 다른 앱을 건드리는 사고를 리뷰 단계에서 거른다.)

### 3.2 이미지

- `ghcr.io/jyje/mungchilog-web` (Vite 빌드 산출물 + nginx 정적 서빙, 또는 server가 static도 서빙 — 컨테이너 1개로 합치는 쪽을 권장, 아래 3.4 참고)
- `ghcr.io/jyje/mungchilog-server` (Hono API + Maps 프록시)
- `docker/build-push-action`, `platforms: linux/arm64` (RPi가 유일한 타겟이므로 amd64 빌드는 생략해 빌드 시간 절약)
- GHCR 패키지 공개(public)로 설정 → imagePullSecret 불필요 (기존 컨벤션과 동일)

### 3.3 시크릿

Google Maps **Routes/Places API 키**(과금 대상)는 로컬에서 `kubeseal`로 암호화해 `SealedSecret` 매니페스트로 `jyje/cluster`에 커밋한다. 지도 타일 렌더링용 Maps JS 키(HTTP referrer 제한 걸림, 저과금)만 클라이언트 번들에 둔다.

### 3.4 서버 1개로 합칠지 여부

원안은 `apps/web`(PWA) + `apps/server`(API) 분리였다. 리소스 제약(8GB 노드, 과거 OOM 이력)과 마감(D-14 미만)을 감안하면, **Hono 서버가 빌드된 정적 파일을 같이 서빙하는 단일 컨테이너**로 합치는 쪽이 유리하다: Pod 1개, Ingress 1개, ArgoCD Application 1개, 리소스 request 1세트로 끝난다. 분리하면 서비스 2개·Deployment 2개·CORS 설정까지 늘어나는데 1인 사용자 앱에서 얻는 이득이 없다.

→ **결정: 컨테이너 1개(`mungchilog`), Hono가 `/api/*`는 API로, 나머지는 정적 파일로 서빙.** 이미지도 1개면 충분 (3.2의 web/server 분리는 철회).

### 3.5 스토리지 — 기본 StorageClass(NFS) 대신 Longhorn

SQLite는 WAL 모드에서 POSIX 파일 락에 의존하는데, 클러스터 기본 StorageClass `subdir-usb`는 NFS 기반이라 락 동작이 불안정하다(NFS는 원래 SQLite WAL과 궁합이 나쁘다는 게 잘 알려진 문제). 데이터 손상 리스크를 안고 갈 이유가 없다.

→ **결정: PVC를 `longhorn`(블록 스토리지) StorageClass로 명시.** 용량 1Gi면 충분(개인 여행 일정 데이터).

## 4. 데이터 모델 (유지)

```
trips: id, title, timezone(IANA 타임존, 여행마다 지정, 기본값 Asia/Tokyo), currency, startDate, endDate, data(JSON: days/spots/items)
legs:  id, fromSpotId, toSpotId, mode, distanceM, durationS, fareAmount, polyline, fetchedAt   ← TTL 30일 캐시
```

`Spot`에는 `nameLocal`(현지어 원문), `bufferMinutes`(기본 10, 대형 환승역/공항은 15 권장 — 어느 도시든) 반드시 포함.

## 5. Google Maps API (유지)

| API | 용도 | 캐시 |
|---|---|---|
| Maps JavaScript API | 지도/폴리라인 렌더링 | 없음, 클라이언트 키 |
| Places API (New) | 장소 검색·영업시간·사진 | `placeId`만 영구 저장 |
| Routes API `computeRoutes` | 구간 거리/시간/대중교통 | `(fromPlaceId, toPlaceId, mode, 요일·시간대 버킷)` 키, 30일 TTL |

드래그 중 호출 금지, 드롭 후 debounce 800ms. Cloud Console에서 Routes 일일 쿼터 상한 + 예산 알림 $1 선(先) 설정.

## 6. D-day 로드맵

⚠️ **정확한 출발일을 아직 못 받았다.** 아래는 이전 세션에서 "2주 미만"이라는 상대 표현으로 짠 순서다. 실제 출발일을 알려주면 날짜를 박아 넣는다. 우선순위 순서 자체는 그대로 유효:

1. **관통 배포부터**: `apps/server`에 `/healthz`만 있는 빈 껍데기를 GHCR→`jyje/cluster` PR→ArgoCD sync까지 통과시켜 `https://mungchilog.app.jyje.online`이 폰에서 열리는 것 확인 (DNS는 이미 끝남)
2. JSON import + 목록 화면
3. 지도 + 마커 + 폴리라인
4. Routes 프록시 + 구간 정보
5. 살 것/먹을 것 체크 + 영업시간
6. PWA + 오프라인 캐시 → **기능 동결**
7. 실기기 리허설 (기내모드 포함)
8. 실제 여행 데이터 입력 + 예행연습
9. 예비일 (아무것도 안 함)

## 7. v1에서 뺄 것 (유지)

TSP 경로 최적화, 다인 공유, 예산 정산, 사진 업로드, 예약 파싱, 인증(단일 사용자 + 홈 네트워크 포트포워딩이라 Authentik forward-auth로 앞단 보호할 수도 있으나 이것도 v1에서는 생략 — 도메인을 아는 사람만 접근 가능한 수준으로 충분).

## 8. 폴백

D-3 리허설에서 안 되면 `trips.data` JSON을 Google My Maps로 export. `export` 버튼이 이 계획 전체의 보험.
