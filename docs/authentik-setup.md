# Authentik OIDC 로그인 설정 가이드

M6(로그인/승인/공유)를 완성하려면 Authentik에 mungchilog용 OAuth2 Provider + Application을 만들어야 합니다. `jyje/cluster`의 ArgoCD가 이미 같은 패턴으로 Authentik SSO를 쓰고 있습니다 (`clusters/r4spi/apps/argocd.yaml` 참고) — 그것과 동일한 방식입니다.

## 1. Application + Provider 생성 (진행 중이면 이어서)

Authentik 관리자 화면 → Applications → Create with Provider (지금 열려 있는 마법사):

**1단계 — Configure the Application** (이미 입력하신 값 그대로 진행)
- Application Name: `Mungchilog`
- 슬러그: `mungchilog`
- 그룹: 비워도 됨
- 정책 엔진 모드: `ANY` (기본값)
- UI 설정: 비워도 됨

**2단계 — Choose a Provider Type**
- **OAuth2/OpenID Provider** 선택

**3단계 — Configure the Provider** (여기가 핵심)
- 이름: `mungchilog` (기본값 그대로 둬도 됨)
- Authorization flow: 기본값(default-authorization-flow) 그대로
- **클라이언트 유형(Client type)**: **Confidential** ⚠️ (Public 아님 — 서버가 클라이언트 시크릿을 갖고 있어야 합니다)
- **Client ID**: 자동 생성된 값 그대로 두거나, 원하시면 `mungchilog`로 직접 바꿔도 됩니다 (ArgoCD도 `argocd`로 바꿔서 씀). 어느 쪽이든 나중에 저에게 이 값만 알려주시면 됩니다 (평문으로 채팅에 붙여넣으셔도 괜찮은 값입니다 — client ID는 비밀이 아닙니다).
- **Client Secret**: 자동 생성됩니다. **이건 저에게 평문으로 주지 마세요** — 아래 "3. 서버에 안전하게 전달" 참고.
- **Redirect URIs/Origins (RegEx가 아니라 Strict 매칭 권장)**:
  - `https://mungchilog.app.jyje.online/auth/callback`
  - (선택) 로컬에서 전체 로그인 플로우까지 테스트하고 싶으면 `http://localhost:3000/auth/callback`도 추가
- Signing Key: 기본값 그대로
- Scopes: 기본 매핑에 `openid`, `email`, `profile`이 포함돼 있으면 그대로 (보통 기본값에 다 있습니다)
- Subject mode: 기본값 그대로. Mungchilog는 표준 OIDC의 `iss`와 `sub` 조합으로 사용자를 식별하고, `email`은 초대와 표시 용도로만 사용합니다.

**4단계 — Configure Bindings (Policy)**: 필요 없으면 건너뛰기(Skip)

**5단계 — Submit**: 완료되면 Provider 상세 화면에서 발급된 **Client ID**/**Client Secret**을 볼 수 있습니다.

## 2. 로컬 OIDC 테스트 계정 만들기 (`test` / `test1234`)

구글 계정 없이도 OIDC 로그인 흐름 자체를 테스트할 수 있도록, Authentik 자체 로컬 계정을 하나 만듭니다 (Google 소셜 로그인과 무관):

1. 관리자 화면 → **Directory → Users → Create**
2. Username: `test`, Name: 아무 이름(예: `테스트 사용자`), Email: `test@mungchilog.local` (아무 도메인이나 상관없음, 실제 메일 아니어도 됨)
3. 생성 후 그 사용자 행의 **⋮ (더보기) → Set password**
4. 비밀번호: `test1234`
5. 이 계정은 Google 로그인이 아니라 Authentik 자체 로그인 화면(아이디/비밀번호 입력)으로 로그인하게 됩니다 — mungchilog 로그인 버튼을 누르면 Authentik이 "Google로 계속하기" 버튼과 "사용자명/비밀번호" 입력 폼을 같이 보여줄 텐데, 테스트 계정은 후자로 로그인하시면 됩니다.

이 계정의 이메일은 Authentik에서 검증된 이메일로 취급하지 않습니다. `npm --prefix apps/server run dev:oidc`로 실행한 `http://localhost:3000/auth/callback`에서 전체 로그인 플로우를 시험할 수 있습니다. 운영에서는 미검증 계정도 `pending` 상태로 로그인할 수 있지만, 관리자의 명시적 승인이 전까지 여행 데이터에 접근할 수 없습니다. 기존 계정의 이메일을 주장하거나 관리자 자동 승인을 받으려면 항상 `email_verified: true`가 필요합니다.

## 3. 이메일 검증 클레임

Authentik 2025.10 이후 기본 `email` 스코프는 `email_verified: false`를 반환합니다. Mungchilog Provider에는 Google Source에서 생성된 사용자만 검증된 이메일로 내보내는 전용 `email` 스코프 매핑이 연결되어 있습니다. 이 규칙은 초대 대상 이메일과 OIDC 계정을 안전하게 연결하기 위한 것이므로, 운영에서 이 값을 무조건 `true`로 바꾸지 마세요.

새로운 신원 공급자를 추가할 때는 해당 공급자가 이메일을 검증했다는 근거를 Authentik 사용자 속성 또는 전용 Source 경로로 보존한 뒤, Provider의 `email_verified` 매핑도 그 근거에 맞춰 확장해야 합니다.

이미 검증된 로그인으로 연결된 `iss`와 `sub` 조합은 이후 Provider가 `email_verified`를 누락하거나 `false`로 발급해도 운영에서 다시 로그인할 수 있습니다. 이 경우 Mungchilog는 새 이메일 값을 저장하지 않으므로, 미검증 이메일로 초대나 관리자 부트스트랩의 대상이 바뀌지 않습니다. 이전에 보지 못한 미검증 신원은 별도의 `pending` 계정으로만 생성되며, 기존 계정의 이메일과 일치하거나 관리자 이메일인 경우에는 로그인도 거부됩니다.

## 4. 서버에 안전하게 전달

- **Client ID**: 평문으로 채팅에 알려주셔도 됩니다.
- **Client Secret**: 절대 채팅에 평문으로 붙여넣지 마세요. 대신:
  - 직접 `kubeseal`로 암호화해서 SealedSecret을 만들어 PR로 올려주시거나
  - 저한테 "Authentik 클라이언트 시크릿 발급했어요"라고만 말씀하시면, Google Maps 서버 키 때 했던 것과 동일한 절차(`kubectl create secret ... --dry-run=client -o yaml | kubeseal ...`)로 SealedSecret을 만들어 `jyje/cluster`에 PR을 올립니다. 평문은 로컬에서만 잠깐 존재하고 커밋되지 않습니다.

## 5. 최종적으로 이 값들이 설정됩니다 (제가 배포 설정에 반영)

| 환경변수 | 값 |
|---|---|
| `OIDC_ISSUER_URL` | `https://authentik.app.jyje.online/application/o/mungchilog/` |
| `OIDC_CLIENT_ID` | (3단계에서 발급된 값) |
| `OIDC_CLIENT_SECRET` | (3단계에서 발급된 값, SealedSecret으로만 전달) |
| `OIDC_REDIRECT_URI` | `https://mungchilog.app.jyje.online/auth/callback` |
| `INITIAL_ADMIN_EMAIL` | deployment Secret key |

로컬 개발에서는 이 값들을 안 넣으면(즉 `.env`에 아무것도 안 적으면) 로그인 없이 관리자 권한으로 자동 로그인된 것처럼 동작합니다 (Google Maps 키 없을 때 placeholder로 대체되는 것과 같은 패턴) - 로컬 개발 편의를 위한 것이고, 배포 환경에서는 항상 실제 로그인이 강제됩니다.

`INITIAL_ADMIN_EMAIL`은 쉼표로 구분한 초기 관리자 이메일 목록입니다. 첫 OIDC 배포 시 목록의 각 주소를 `pending` 관리자 후보로 미리 생성합니다. 각 후보는 해당 주소가 포함된 **검증된** OIDC 로그인을 완료할 때만 `approved` 관리자로 활성화되고, OIDC issuer와 subject가 연결됩니다. 따라서 Secret만 마운트했다고 관리자 세션이 생기지는 않습니다.

목록에 넣은 이메일 주소는 부트스트랩 후보 레코드로 데이터베이스에 보관됩니다. 이미 `approved` 관리자가 하나라도 있으면 이 Secret 목록은 더 이상 데이터베이스를 변경하지 않습니다. 따라서 운영 중인 관리자 추가와 회수는 별도 사용자 관리 기능으로 처리해야 합니다.

```yaml
auth:
  initialAdmin:
    existingSecret: mungchilog-oidc
    key: INITIAL_ADMIN_EMAIL
```

기존 `ADMIN_EMAIL` 환경 변수는 이미 배포된 환경의 호환을 위해서만 읽습니다. 두 키 모두 쉼표 구분 목록을 지원하지만, 새 Secret에는 `INITIAL_ADMIN_EMAIL` 키를 사용하세요.

실제 OIDC 로그인까지 로컬에서 확인할 때는 `.env`에 위 값을 두고 다음 명령을 실행합니다. 이 모드는 웹을 빌드한 뒤 서버가 함께 제공하므로 callback 후에도 같은 `localhost:3000` 앱으로 돌아옵니다.

```bash
npm --prefix apps/server run dev:oidc
```
