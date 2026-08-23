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
- Subject mode: 기본값 그대로 (이 앱은 `sub`이 아니라 `email` 클레임으로 사용자를 식별합니다)

**4단계 — Configure Bindings (Policy)**: 필요 없으면 건너뛰기(Skip)

**5단계 — Submit**: 완료되면 Provider 상세 화면에서 발급된 **Client ID**/**Client Secret**을 볼 수 있습니다.

## 2. 로컬 테스트 계정 만들기 (`test` / `test1234`)

구글 계정 없이도 OIDC 로그인 흐름 자체를 테스트할 수 있도록, Authentik 자체 로컬 계정을 하나 만듭니다 (Google 소셜 로그인과 무관):

1. 관리자 화면 → **Directory → Users → Create**
2. Username: `test`, Name: 아무 이름(예: `테스트 사용자`), Email: `test@mungchilog.local` (아무 도메인이나 상관없음, 실제 메일 아니어도 됨)
3. 생성 후 그 사용자 행의 **⋮ (더보기) → Set password**
4. 비밀번호: `test1234`
5. 이 계정은 Google 로그인이 아니라 Authentik 자체 로그인 화면(아이디/비밀번호 입력)으로 로그인하게 됩니다 — mungchilog 로그인 버튼을 누르면 Authentik이 "Google로 계속하기" 버튼과 "사용자명/비밀번호" 입력 폼을 같이 보여줄 텐데, 테스트 계정은 후자로 로그인하시면 됩니다.

## 3. 서버에 안전하게 전달

- **Client ID**: 평문으로 채팅에 알려주셔도 됩니다.
- **Client Secret**: 절대 채팅에 평문으로 붙여넣지 마세요. 대신:
  - 직접 `kubeseal`로 암호화해서 SealedSecret을 만들어 PR로 올려주시거나
  - 저한테 "Authentik 클라이언트 시크릿 발급했어요"라고만 말씀하시면, Google Maps 서버 키 때 했던 것과 동일한 절차(`kubectl create secret ... --dry-run=client -o yaml | kubeseal ...`)로 SealedSecret을 만들어 `jyje/cluster`에 PR을 올립니다. 평문은 로컬에서만 잠깐 존재하고 커밋되지 않습니다.

## 4. 최종적으로 이 값들이 설정됩니다 (제가 배포 설정에 반영)

| 환경변수 | 값 |
|---|---|
| `OIDC_ISSUER_URL` | `https://authentik.app.jyje.online/application/o/mungchilog/` |
| `OIDC_CLIENT_ID` | (3단계에서 발급된 값) |
| `OIDC_CLIENT_SECRET` | (3단계에서 발급된 값, SealedSecret으로만 전달) |
| `OIDC_REDIRECT_URI` | `https://mungchilog.app.jyje.online/auth/callback` |
| `ADMIN_EMAIL` | `jyjeon@outlook.com` |

로컬 개발에서는 이 값들을 안 넣으면(즉 `.env`에 아무것도 안 적으면) 로그인 없이 관리자 권한으로 자동 로그인된 것처럼 동작합니다 (Google Maps 키 없을 때 placeholder로 대체되는 것과 같은 패턴) - 로컬 개발 편의를 위한 것이고, 배포 환경에서는 항상 실제 로그인이 강제됩니다.

실제 OIDC 로그인까지 로컬에서 확인할 때는 `.env`에 위 값을 두고 다음 명령을 실행합니다. 이 모드는 웹을 빌드한 뒤 서버가 함께 제공하므로 callback 후에도 같은 `localhost:3000` 앱으로 돌아옵니다.

```bash
npm --prefix apps/server run dev:oidc
```
