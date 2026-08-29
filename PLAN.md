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
- DB: SQLite. 일정과 지도 캐시 외에 사용자, 세션, 여행별 멤버십, 가입 요청, 초대, 알림, 감사 로그를 같은 DB에 저장한다.
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

### 3.5 스토리지 - `subdir-usb` NFS와 SQLite rollback journal

클러스터에 사용할 수 있는 `longhorn` StorageClass가 없어서 실제 배포는 기본 `subdir-usb` NFS PVC를 사용한다. SQLite WAL은 NFS의 공유 메모리와 파일 잠금 특성에 맞지 않으므로 서버는 `PRAGMA journal_mode = DELETE`를 강제한다. Deployment는 단일 replica와 단일 writer를 유지하고, 여러 Pod가 같은 DB를 동시에 열지 않게 한다. PVC 용량은 1Gi로 시작한다.

여행 목록의 대표 이미지는 초기 단계에서만 `trips.data.cover.imageDataUrl`에 Base64 data URL로 저장한다. JPEG, PNG, WebP만 허용하고 원본 바이트는 2 MiB로 제한한다. 목록은 사진을 우선 표시하고, 사진이 없으면 `cover.spotId`가 가리키는 장소의 지도를 표시한다. 이 임시 저장은 사용자 앨범이 아니며, 객체 저장소와 접근 제어, 기존 데이터 이전은 [#9](https://github.com/jyje/mungchilog/issues/9)에서 처리한다.

## 4. 데이터 모델

```
trips: id(UUIDv4), title, timezone, currency, startDate, endDate, data(JSON, cover: { spotId?, imageDataUrl? }), version, createdAt, updatedAt, deletedAt
legs:  id, fromSpotId, toSpotId, mode, distanceM, durationS, fareAmount, polyline, fetchedAt   ← TTL 30일 캐시
users: id, oidcIssuer, oidcSubject, email, name, status(pending/approved/rejected/suspended), platformRole(admin/user), createdAt
sessions: id, userId, createdAt, expiresAt
trip_members: tripId, userId, role(owner/editor/guest), createdAt
trip_join_requests: id, tripId, requesterId, status(pending/approved/rejected/canceled/blocked), requestedAt, decidedAt, decidedBy
trip_invites: id, tripId, tokenHash, role(editor/guest), expiresAt, claimedBy, claimedAt, redeemedAt, revokedAt, createdBy
auth_intents: id, inviteId, expiresAt, createdAt
notifications: id, recipientUserId, type, entityId, readAt, createdAt
membership_audit_logs: id, actorUserId, tripId, action, targetUserId, metadata, createdAt
```

`Spot`에는 `nameLocal`(현지어 원문), `bufferMinutes`(기본 10, 대형 환승역/공항은 15 권장 — 어느 도시든) 반드시 포함.

OIDC 사용자의 정본 키는 이메일이 아니라 `(oidcIssuer, oidcSubject)`의 유일 조합이다. 이메일과 이름은 표시용 프로필로 취급한다. `INITIAL_ADMIN_EMAIL`은 Secret에서 쉼표 구분 초기 관리자 후보를 시드할 때만 쓰고, 각 후보가 검증된 로그인으로 활성화된 뒤에는 저장된 OIDC subject로 관리자를 식별한다.

여러 편집자가 전체 여행 JSON을 동시에 저장하면 마지막 저장이 앞선 변경을 덮을 수 있다. 이를 막기 위해 `trips.version`을 추가하고 모든 변경에 `If-Match` 또는 `baseVersion`을 요구한다. 버전이 다르면 서버는 `409 Conflict`를 반환하고 클라이언트가 최신 데이터를 다시 불러온 뒤 사용자에게 충돌을 알려야 한다.

## 5. 인증, 가입 요청, 멤버십, 초대

### 5.1 두 단계 접근 모델

인증과 여행 접근 권한을 분리한다.

1. 미로그인 사용자는 OIDC 로그인과 공개 정적 자산 외에는 접근할 수 없다.
2. 최초 로그인 사용자는 `pending`으로 생성된다. `/auth/me`, `/auth/logout`, 승인 대기 화면 외에는 어떤 API도 사용할 수 없다.
3. 플랫폼 관리자가 승인하면 `/trips` UI에 들어갈 수 있다. 이 화면은 공개 여행 목록이나 제목 검색을 제공하지 않고, 현재 사용자가 이미 가입한 여행만 보여준다.
4. 가입한 여행이 없으면 빈 상태와 정확한 여행 UUID 입력 폼만 보여준다.
5. 여행 UUID 조회는 제목과 소유자 표시명만 포함한 최소 카드만 반환한다. 날짜, 목적지, 일정, 멤버 목록은 멤버십 승인 전에는 공개하지 않는다.
6. 사용자가 가입 요청을 보내면 소유자만 요청을 검토하고 `guest` 또는 `editor`로 승인할 수 있다.

초대 링크도 플랫폼 관리자 승인을 우회하지 않는다. 이미 승인된 사용자는 링크 사용 직후 가입하고 해당 여행으로 이동한다. 신규 또는 `pending` 사용자는 유효한 링크로 OIDC 로그인을 마치면 초대를 자신의 계정에 선점하고 승인 대기 화면으로 이동한다. 관리자가 계정을 승인하면 선점된 초대를 자동 적용하고 여행으로 이동한다. 링크가 1시간 뒤 만료되더라도 만료 전에 계정에 선점됐다면 관리자 승인 대기 중인 선점은 유지한다.

초기 플랫폼 관리자는 다른 관리자가 존재하지 않는 부트스트랩 문제를 피하기 위해 `INITIAL_ADMIN_EMAIL`의 쉼표 구분 목록을 사용한다. OIDC가 설정된 새 데이터베이스는 목록의 각 주소를 `pending` 관리자 후보로 사전 생성하고, 각각의 검증된 OIDC 로그인이 완료될 때만 해당 후보를 `approved` 관리자로 활성화한다. 이후 일반 사용자는 모두 관리자 승인을 거친다.

### 5.2 권한 표

| 주체 | 가입 여행 목록 | UUID 최소 조회 | 일정 조회 | 일정 편집 | 가입 승인·멤버 관리 | 초대 링크 | 여행 삭제 | 플랫폼 사용자 관리 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `pending` 사용자 | 아니오 | 아니오 | 아니오 | 아니오 | 아니오 | 아니오 | 아니오 | 아니오 |
| 승인된 비멤버 | 빈 목록만 | 예 | 아니오 | 아니오 | 아니오 | 아니오 | 아니오 | 아니오 |
| `guest` | 예 | 예 | 예 | 아니오 | 아니오 | 아니오 | 아니오 | 아니오 |
| `editor` | 예 | 예 | 예 | 예 | 아니오 | 아니오 | 아니오 | 아니오 |
| `owner` | 예 | 예 | 예 | 예 | 예 | 예 | 예 | 아니오 |
| 플랫폼 `admin` | 본인이 가입한 여행만 | 예 | 멤버십이 있을 때만 | 멤버십 역할에 따름 | 소유자일 때만 | 소유자일 때만 | 소유자일 때만 | 예 |

플랫폼 관리자는 계정 승인 담당자이지 모든 여행을 볼 수 있는 슈퍼유저가 아니다. 여행 데이터 권한은 항상 `trip_members` 관계로 판정한다. 서버는 기본 거부 방식으로 모든 요청마다 사용자 상태와 여행 관계를 다시 확인한다.

`editor`는 날짜, 스팟, 순서, 메모, 체크리스트 등 여행 내용 전체를 편집할 수 있다. 여행 삭제, 가입 요청 처리, 역할 변경, 멤버 제거, 초대 생성 및 취소, 소유권 이전은 할 수 없다. `guest`는 읽기 전용이다.

각 여행은 정확히 한 명의 소유자를 유지한다. 소유권 이전은 기존 소유자와 새 소유자의 역할을 하나의 트랜잭션에서 교환한다. 게스트와 편집자는 멤버의 표시명과 역할만 볼 수 있고 이메일은 볼 수 없다. 소유자는 가입 요청과 멤버 관리 화면에서만 이메일을 볼 수 있다.

### 5.3 UUID 조회와 가입 요청

- 여행 ID는 UUIDv4로 유지한다. UUID의 추측 난이도는 보조 방어선일 뿐 권한 검사를 대체하지 않는다.
- 소유자 화면에는 여행 UUID 복사 버튼을 제공한다. UUID 자체는 가입 권한이 아니며, 조회 뒤에도 소유자 승인이 필요하다.
- `POST /api/trips/lookup`에 정확한 UUID를 보내 최소 정보만 조회한다. 공개 목록, 부분 일치, 제목 검색, 추천 기능은 만들지 않는다.
- 조회 및 요청 API는 사용자와 IP 기준 속도 제한을 적용한다. 초기값은 조회 10회/분, 가입 요청 5회/시간이다.
- 동일 사용자와 여행 사이에는 활성 가입 요청을 하나만 허용한다. 중복 요청은 기존 상태를 반환하고 소유자 알림도 중복 생성하지 않는다.
- 거절 후 재요청에는 24시간 대기 시간을 둔다. 소유자는 반복 요청 사용자를 `blocked`로 바꿀 수 있다.
- 소유자가 승인할 때 `guest` 또는 `editor`를 명시해야 하며, 승인과 멤버십 생성은 하나의 DB 트랜잭션으로 처리한다.

### 5.4 사이트 내 알림

- v1 알림은 사이트 내부 알림 센터와 읽지 않은 개수 배지로 제공한다. 브라우저 푸시와 이메일은 v1 범위에서 제외한다.
- 가입 요청이 생성되면 해당 여행 소유자에게만 알림을 만든다. 온라인 상태에서는 15~30초 폴링과 창 포커스 재조회로 갱신하고, 오프라인이었다면 다음 접속 시 표시한다.
- 알림을 누르면 여행의 가입 요청 패널로 이동한다. 여기서 요청자 표시명과 이메일을 확인하고 `guest` 또는 `editor`로 승인하거나 거절, 차단할 수 있다.
- 승인, 거절, 역할 변경, 멤버 제거, 초대 생성, 선점, 사용, 취소는 감사 로그에 남긴다. 초대 원문 토큰과 일정 내용은 로그에 남기지 않는다.

### 5.5 초대 링크

- 소유자만 `guest` 또는 `editor` 역할을 선택해 링크를 생성한다.
- 만료시간은 5분, 15분, 30분, 60분 중 선택하며 기본값과 최대값은 60분이다.
- v1 초대 링크는 한 사람만 사용할 수 있는 단일 사용 링크다. 여러 사람을 초대할 때는 각각 새 링크를 만든다.
- 토큰은 암호학적으로 안전한 32바이트 난수로 만들고 DB에는 SHA-256 해시만 저장한다. 원문은 생성 응답에서 한 번만 보여준다.
- 공유 URL은 `/invite#token=<원문>` 형태를 사용한다. fragment는 HTTP 요청과 서버 접근 로그에 자동 전송되지 않는다. SPA는 즉시 token을 서버의 초대 의도 생성 API로 교환하고 `history.replaceState`로 주소에서 제거한다.
- 로그인 전에는 서버가 짧은 수명의 `auth_intent`와 HttpOnly 쿠키만 만들며, OIDC callback의 이동 대상은 서버가 허용한 내부 경로만 사용한다. 사용자 입력 URL을 그대로 redirect하지 않는다.
- 링크 사용은 트랜잭션 안에서 선점한다. 동시에 여러 명이 열어도 한 계정만 성공한다. 이미 멤버인 사용자가 열면 역할을 낮추거나 높이지 않고 기존 여행으로 이동한다.
- 소유자는 사용 전 링크를 취소할 수 있다. 만료, 취소, 사용 완료 토큰은 다시 쓸 수 없다.

### 5.6 OIDC와 웹 보안 기준

- Authentik을 표준 OIDC Provider로 사용하되 애플리케이션 코드는 issuer discovery 기반으로 유지한다.
- Authorization Code + PKCE, `state`, `nonce`, 정확히 등록된 redirect URI를 사용한다. implicit flow는 사용하지 않는다.
- 세션 쿠키는 서버 저장형 opaque ID, `HttpOnly`, `Secure`, `SameSite=Lax`로 만들고 로그인 성공 시 회전한다.
- 상태 변경 API는 SameSite 쿠키에만 의존하지 않고 Origin 검사 또는 CSRF 토큰을 추가한다.
- 초대와 가입 요청의 권한 판정은 UI가 아니라 서버에서 수행한다. 권한 실패는 기본적으로 존재 여부를 과하게 노출하지 않는 `404` 또는 일관된 오류로 처리한다.
- 로그아웃, 계정 정지, 멤버 제거 시 서버 세션과 해당 사용자의 PWA 개인 캐시를 정리한다.
- Authentik 2025.10 이후 `email_verified` 기본값이 false일 수 있으므로, Google Source의 검증 상태를 반영하는 scope mapping을 명시적으로 구성한다. 사용자 식별은 항상 issuer와 subject를 기준으로 한다.

### 5.7 Ingress 전환

기존 Ingress Basic Auth는 OIDC 도입 전 임시 보호 수단이었다. 외부 초대 링크 사용자는 공유 Basic Auth 비밀번호를 알 수 없으므로, OIDC 라이브 검증이 끝난 뒤 애플리케이션 경로의 Basic Auth를 제거해야 한다. 전환 순서는 다음과 같다.

1. Basic Auth를 유지한 상태에서 관리자와 테스트 계정으로 OIDC 및 권한 회귀 테스트를 완료한다.
2. API가 미로그인, `pending`, 비멤버 요청을 모두 기본 거부하는지 확인한다.
3. Ingress의 Basic Auth를 제거하고 로그인, 초대, 정적 자산, PWA 설치를 외부 네트워크에서 재검증한다.
4. `/healthz`는 민감 정보를 포함하지 않는 상태 응답만 공개한다. 로그인과 초대 엔드포인트에는 Ingress 또는 애플리케이션 속도 제한을 적용한다.

### 5.8 API 초안

```text
GET    /auth/me
GET    /auth/login
GET    /auth/callback
POST   /auth/logout
POST   /auth/invite-intents                 # raw token을 짧은 수명 로그인 의도로 교환

GET    /api/trips                           # 현재 사용자의 가입 여행만
POST   /api/trips/lookup                    # 정확한 UUID, 최소 정보만
POST   /api/trips/:id/join-requests
GET    /api/trips/:id/join-requests         # owner only
POST   /api/trips/:id/join-requests/:rid/approve
POST   /api/trips/:id/join-requests/:rid/reject
POST   /api/trips/:id/join-requests/:rid/block

POST   /api/trips/:id/invites               # owner, role + ttlMinutes
GET    /api/trips/:id/invites               # owner, 원문 token 제외
DELETE /api/trips/:id/invites/:inviteId
PATCH  /api/trips/:id/members/:userId       # owner, guest/editor 변경
DELETE /api/trips/:id/members/:userId       # owner, owner 자신은 불가
POST   /api/trips/:id/transfer-ownership     # owner, 명시 확인 필요

GET    /api/notifications
POST   /api/notifications/:id/read
POST   /api/notifications/read-all
```

### 5.9 설계 근거

- [OAuth 2.0 Security Best Current Practice, RFC 9700](https://www.rfc-editor.org/rfc/rfc9700.html)
- [OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)
- [OWASP Forgot Password Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html): 초대 URL 토큰의 난수성, 안전한 저장, 단일 사용, 만료, 속도 제한 원칙에 적용
- [Authentik OAuth 2.0 Provider 문서](https://docs.goauthentik.io/add-secure-apps/providers/oauth2/)

## 6. Google Maps API (유지)

| API | 용도 | 캐시 |
|---|---|---|
| Maps JavaScript API | 지도/폴리라인 렌더링 | 없음, 클라이언트 키 |
| Places API (New) | 장소 검색·영업시간·사진 | `placeId`만 영구 저장 |
| Routes API `computeRoutes` | 구간 거리/시간/대중교통 | `(fromPlaceId, toPlaceId, mode, 요일·시간대 버킷)` 키, 30일 TTL |

드래그 중 호출 금지, 드롭 후 debounce 800ms. Cloud Console에서 Routes 일일 쿼터 상한 + 예산 알림 $1 선(先) 설정.

## 7. D-day 로드맵

출발일은 **2026-09-07**, 기능 동결 목표는 **2026-09-01**이다. 우선순위는 다음과 같다.

1. **관통 배포부터**: `apps/server`에 `/healthz`만 있는 빈 껍데기를 GHCR→`jyje/cluster` PR→ArgoCD sync까지 통과시켜 `https://mungchilog.app.jyje.online`이 폰에서 열리는 것 확인 (DNS는 이미 끝남)
2. JSON import + 목록 화면
3. 지도 + 마커 + 폴리라인
4. Routes 프록시 + 구간 정보
5. 살 것/먹을 것 체크 + 영업시간
6. PWA + 오프라인 캐시 → **기능 동결**
7. OIDC, 플랫폼 승인, 가입 요청, 게스트·편집자 권한, 초대 링크
8. Basic Auth 제거 후 외부 초대와 권한 매트릭스 재검증
9. 실기기 리허설 (기내모드 포함)
10. 실제 여행 데이터 입력 + 예행연습
11. 예비일 (아무것도 안 함)

## 8. v1에서 뺄 것

TSP 경로 최적화, 예산 정산, 다중 사진 앨범, 예약 파싱, 브라우저 푸시·이메일 알림, 실시간 커서, CRDT 기반 동시편집은 v1에서 제외한다. 대표 이미지의 객체 저장소 이전은 [#9](https://github.com/jyje/mungchilog/issues/9)로 관리한다. OIDC 인증, 관리자 승인, 여행별 게스트·편집자 공유는 M6으로 v1 범위에 포함한다.

## 9. 폴백

D-3 리허설에서 안 되면 `trips.data` JSON을 Google My Maps로 export. `export` 버튼이 이 계획 전체의 보험.

## 10. UI component system and map control safety

### 10.1 Decision

The web application remains React and Vite. Adopt shadcn/ui as the accessible primitive source, not as a screen-level visual theme. Existing mobile-first map interaction, theme tokens, and product language remain the authority for product styling.

- The correct development route spelling is `/gallery`.
- `/gallery` is available only on `mungchilog.dev.jyje.online` and localhost. It must not render in staging or production, even when the same immutable web image is promoted between environments.
- `apps/web/src/components/ui/` contains only files generated by the shadcn CLI. Treat it as read-only. Do not change generated source files to make product-specific visual or behavioral changes.
- `apps/web/src/components/system/` sits beside `ui/` and contains reusable Mungchilog interaction contracts, product classes, and map-specific adaptations. Standard primitives may be imported directly and configured with their documented props and ordinary layout values. Do not introduce pass-through wrappers.
- Shared product tokens remain in the application stylesheet. Product compositions may map them to shadcn states without replacing the established light, dark, typography, and mobile behavior.
- All touch controls retain a minimum 44 by 44 CSS pixel target, visible keyboard focus, and a non-color-only selected state.

### 10.2 Implementation slices

Each completed slice is locally verified and committed separately. Remote push, PR creation, and deployment remain explicit follow-up actions.

1. **Foundation and boundaries**
   - Add the shadcn Vite configuration, Tailwind support, aliases, and the generated component directory.
   - Add a component ownership document and repository instructions that prohibit direct modification of `components/ui`.
   - Preserve existing theme tokens and validate both light and dark mode before any screen migration.

2. **Product composition contracts**
   - Use shadcn `Button`, `Tooltip`, `Popover`, `DropdownMenu`, `Sheet`, `Dialog`, `Tabs`, and `Switch` directly for their standard states and documented props.
   - Create a `components/system/` module only when a contract is repeated and product-specific, starting with `MapIconButton` for touch target, tooltip, and map selection state.
   - Keep focus, disabled, loading, keyboard, and touch behavior in each product contract. Add product-specific classes only in that contract layer.

3. **Development component gallery**
   - Add the host-guarded `/gallery` route.
   - Show primitive states including default, hover, focus, disabled, loading, and dark mode.
   - Add map composition specimens for the trip header, date controls, participant menu, itinerary sheet, current location, follow itinerary, and status messaging.

4. **Native Google Maps control inventory**
   - Capture a representative dated itinerary with the actual Google Maps JavaScript controls visible.
   - Record the bounding boxes of map type, camera or zoom, Street View, keyboard shortcut, attribution, and any conditional native controls.
   - Repeat the inventory for at least these viewport classes: 360 by 800, 390 by 844, 412 by 915, 768 by 1024, 1024 by 768, 1142 by 1119, and 1440 by 900.
   - Treat Google controls as dynamic. Control placement must respond to their measured geometry rather than relying on a fixed right or bottom offset.

5. **Map control layout engine**
   - Introduce a map control layout provider that combines safe-area insets, the app header, floating itinerary panel, and measured native Google Maps control bounds.
   - Place app-owned controls in a single non-overlapping rail. On narrow screens this rail moves around the native controls instead of using a diagonal arrangement.
   - Convert the existing current-location and itinerary-follow controls to `MapIconButton` wrappers first.
   - Continue with header, menu, participant, date, and itinerary actions only after their dedicated geometry checks are in place.

6. **Gallery and automated verification**
   - Render live map-control specimens in the development gallery when a Maps key is available, and degrade safely when it is not.
   - Use deterministic geometry tests for each supported viewport. An app control rectangle must not intersect a measured native control rectangle, safe-area exclusion, or the itinerary panel.
   - Capture browser screenshots for the representative itinerary in light and dark themes and confirm keyboard focus, touch targets, Escape dismissal, and back-navigation dismissal.

### 10.3 Remaining execution order

The first four slices are complete locally. The remaining work is intentionally ordered so that map behavior is measured before it is restyled. The current local `dev` branch now contains the geometry contract, the runtime native-control measurement, the screen-by-screen shadcn migration, and the development-gallery specimen. Remote push and deployment remain separate approval steps.

Local progress (2026-08-29):

- Completed: geometry helpers and supported viewport fixtures.
- Completed: a single collision-safe app-control rail for current location and itinerary following.
- Completed: contextual location/follow status and dismissal regression coverage.
- Completed: trip header, participant sheet, day actions, cover settings, itinerary cards, opening-hours tooltip, editor actions, and gallery migration.
- Completed: automated gallery checks at all seven supported viewport sizes; the app rail stayed inside the map and had zero intersections with the measured native-control fixtures.
- Remaining: live screenshots and device checks for every viewport, including permission-denied, unavailable-location, following, paused, selected-route, light, and dark states.

1. **Inventory fixture and geometry contract (completed locally)**
   - Add a development-only representative itinerary fixture that has a header, a populated itinerary panel, and visible route markers.
   - Record app-owned and native-control rectangles in a test harness. Native Google Maps DOM is not a public integration contract, so production placement must use conservative exclusion zones derived from the inventory rather than brittle selectors.
   - Define pure rectangle helpers and fixed viewport fixtures for 360 by 800, 390 by 844, 412 by 915, 768 by 1024, 1024 by 768, 1142 by 1119, and 1440 by 900.
   - Commit boundary: geometry helpers and deterministic tests only. No production control movement in this slice.

2. **Single app-control rail (completed locally)**
   - Introduce one map-control rail that owns the positions of `현재 위치` and `따라가기`. The rail receives the map viewport insets, the native-control exclusion zone, and safe-area padding.
   - Replace the two independent absolute-position calculations. The app controls remain vertically aligned, have 44 by 44 minimum targets, and never form a diagonal pair.
   - Use `MapIconButton` for the icon, tooltip, pressed state, disabled state, and keyboard focus. Do not modify the generated shadcn Button or Tooltip source.
   - Commit boundary: rail wiring plus the two buttons. Existing route selection and device-location behavior must remain unchanged.

3. **Contextual status and selection feedback (completed locally)**
   - Move location accuracy, permission, and follow-progress information out of the native-control area. Compact messages appear in an app-owned safe region, while screen-reader announcements remain non-visual.
   - Use a direct shadcn primitive where standard behavior is enough. Create a system component only if the status placement or dismissal behavior becomes a reused map contract.
   - Verify Escape clears follow state and active map or itinerary selection without moving the map, reordering spots, or losing edits.
   - Commit boundary: status placement and dismissal regression tests.

4. **Screen-by-screen map UI migration (completed locally)**
   - Migrate the trip header actions, participant actions, date actions, and narrow-screen itinerary panel one surface at a time.
   - For each surface, retain existing labels, routes, data mutations, keyboard behavior, and analytics-relevant controls. Standard shadcn props are applied directly. Only repeated map-specific behavior goes into `components/system`.
   - Confirm each screen in light and dark mode before proceeding to the next surface.
   - Commit boundary: one user-visible surface per commit.

5. **Live map and device verification (remaining)**
   - Use a real dated itinerary with a permitted Maps key to capture the native controls at every supported viewport. Confirm the app rail avoids the visible zoom, map type, Street View, attribution, keyboard shortcut, and conditional controls.
   - Test pointer, keyboard, touch, location denied, location unavailable, route absent, following, paused, and selected-route states.
   - Add screenshots to the development gallery or test artifact flow only. Do not expose diagnostic routes on staging or production.
   - Commit boundary: evidence and regression coverage. Push and deployment remain separate approval steps.

### 10.4 Design and accessibility guardrails

- Preserve the existing calm map-first language: one blue accent, rounded floating controls, compact labels, and no decorative animation.
- Use static interaction feedback only. Button press, focus, selected, disabled, loading, empty, and error states must be clear without relying on color alone.
- Keep a single page theme at a time and verify the same hierarchy in both light and dark mode.
- Treat map controls as functional equipment, not card content. Elevation is allowed only to separate a tappable control from map imagery.
- On narrow screens the itinerary sheet, app-control rail, and native map controls each receive separate space. They must not cover one another.

### 10.5 Acceptance criteria

- No app-owned map button overlaps an interactive Google Maps control at any supported viewport.
- A selected map or itinerary state remains visible and understandable without relying only on color.
- The first Back action and Escape clear selection without navigating away or discarding edits.
- The development gallery is unreachable from staging and production hosts.
- shadcn generated files remain untouched after generation. Product customizations are traceable to the sibling wrapper directory.
- Existing routes, OIDC behavior, PWA behavior, Google Maps loading, and itinerary interactions pass focused regression checks after every migration slice.

### 10.6 Development UI storyboard

The development-only gallery evolves from a primitive catalog into an interactive storyboard. It remains unavailable on staging and production hosts and never calls a trip, identity, location, or Maps API.

1. **Storyboard foundation**
   - Add an explicit storyboard section after the primitive catalog.
   - Keep each scene as a live React composition using the same shadcn primitives and product tokens as the application, not a static screenshot or a separate visual language.
   - Provide deterministic sample content only. Do not render user names, live locations, invitation tokens, or copied travel data.

2. **Core travel flow scenes**
   - Show the journey from an empty trip library, through creating a trip, to a populated itinerary with a selected place and route context.
   - Show loading, empty, and recoverable error states next to the successful state so a visual review includes the entire interaction cycle.
   - Make selection visible through an order label, focus treatment, and semantic state rather than color alone.

3. **Collaboration scenes**
   - Show the member panel, invitation entry point, location-sharing consent, and following state as a separate scene.
   - Make the privacy boundary explicit: sharing is opt-in, temporary, and only visible to trip participants.

4. **Responsive review**
   - Provide phone, tablet, and desktop canvases. Each scene uses the same responsive breakpoints as the application and preserves 44 by 44 controls.
   - Keep map application controls inside the measured rail. Native Maps controls remain represented as exclusions in the storyboard until a live Maps key is available.

5. **Verification and commit boundaries**
   - Add focused tests for scene labels, state controls, and development-only access.
   - Commit the storyboard foundation, core flow scenes, and collaboration/responsive scenes separately after local verification.
