# Google Maps API 키 발급 가이드

M3(구간 정보)와 M4(영업시간)를 완성하려면 이 3개가 필요합니다. 순서대로 진행하면 15분 안에 끝납니다.

## 1. GCP 프로젝트 생성

1. https://console.cloud.google.com/projectcreate 접속
2. 프로젝트 이름: `mungchilog` (아무 이름이나 상관없음)
3. 결제 계정 연결 (필수 — API 활성화에 결제 계정이 있어야 함. 무료 한도 안에서 쓸 거라 실제 과금은 거의 없음, PLAN.md 참고)

## 2. API 4개 활성화

https://console.cloud.google.com/apis/library 에서 각각 검색해서 "사용 설정":
- **Maps JavaScript API**
- **Places API (New)** ⚠️ **"Places API"(New 없는 것)와는 다른 별개의 API입니다.** 검색하면 이름이 비슷한 두 개가 나오는데, 반드시 **"(New)"가 붙은 것**을 선택하세요. 이 앱의 장소 검색 자동완성·영업시간 조회는 전부 New 쪽 엔드포인트(`places.googleapis.com`)만 호출합니다 — 구버전 "Places API"를 활성화·선택해도 자동완성은 계속 403으로 막힙니다. 직접 링크: https://console.cloud.google.com/apis/library/places.googleapis.com
- **Routes API**
- **Time Zone API**: 새 여행에서 대표 장소를 선택했을 때 해당 지역의 IANA 시간대를 자동 제안합니다. 활성화하지 않아도 여행 생성은 가능하며, 이때는 서울 시간(`Asia/Seoul`)을 사용합니다.

## 3. 키 2개 발급

Maps는 API 키를 용도별로 분리하는 게 원칙입니다 (PLAN.md의 "클라이언트에 Routes 키 노출 금지" 결정).

### 3-1. 클라이언트용 키 (Maps JS)

https://console.cloud.google.com/apis/credentials → "사용자 인증 정보 만들기" → "API 키"

- 이름: `mungchilog-web`
- **애플리케이션 제한사항** → HTTP 리퍼러(웹사이트) → 다음 항목 추가:
  - `https://mungchilog.dev.jyje.online/*`
  - `https://mungchilog.stg.jyje.online/*`
  - `https://mungchilog.app.jyje.online/*`
  - (선택) `http://localhost:5173/*` — 로컬 개발 서버에서도 실제 지도·장소 검색을 보고 싶으면 추가하세요. 안 넣어도 배포된 사이트는 영향 없고, 로컬에서만 "지도를 불러오지 못했습니다" 안내가 대신 뜹니다 (정상)
- **API 제한사항** → 키 제한 → **Maps JavaScript API**, **Places API (New)** 둘 다 체크
  (Places API (New)은 스팟 추가 폼의 장소 검색 자동완성에 씁니다. 안 넣어도 앱은 동작하고, 자동완성만 빠지고 이름 직접 입력으로 자연스럽게 대체됩니다)
  - 체크박스 목록에 **"Places API (New)"가 안 보인다면** 아직 프로젝트에서 활성화가 안 된 것입니다 — 위 2단계로 돌아가서 정확한 이름으로 다시 활성화한 뒤 이 화면을 새로고침하면 뜹니다. 목록에 "Places API"(New 없음)만 있고 체크했다면 그건 다른 API라 자동완성이 계속 403(Forbidden)으로 막힙니다.

이 키를 → 저에게 알려주시면 GitHub Actions repo secret `VITE_GOOGLE_MAPS_API_KEY`로 넣고 재배포합니다.

### 3-2. 서버용 키 (Places + Routes + Time Zone)

같은 화면에서 "사용자 인증 정보 만들기" → "API 키" 한 번 더

- 이름: `mungchilog-server`
- **애플리케이션 제한사항** → 없음 (서버에서만 씀, IP 제한을 걸고 싶으면 라즈베리파이 클러스터의 아웃바운드 공인 IP로 제한 가능하지만 필수는 아님)
- **API 제한사항** → 키 제한 → **Places API (New)**, **Routes API**, **Time Zone API** 체크

이 키는 → **절대 저에게 평문으로 주지 마세요.** 대신:
- 직접 `kubeseal`로 암호화해서 알려주시거나
- 저한테 "서버 키 있어요, 어떻게 넣어드릴까요"라고만 말씀하시면 제가 SealedSecret 생성 절차를 안내합니다 (`kubectl create secret ... --dry-run=client -o yaml | kubeseal ...`, 평문은 로컬에서만 잠깐 존재하고 커밋 안 됨)

## 4. 쿼터·예산 안전장치 (5분, 꼭 하세요)

https://console.cloud.google.com/apis/api/routes.googleapis.com/quotas 에서:
- Routes API 일일 쿼터를 500 정도로 낮춰두기 (기본값은 훨씬 높음)
- 일반 경로와 대중교통 대안 경로는 Essentials SKU의 월간 무료 호출 한도 안에서 시작할 수 있습니다. 다만 실시간 교통을 반영하는 운전 경로는 Pro SKU이므로, 5분 캐시가 있어도 일일 쿼터와 예산 알림을 꼭 설정하세요.

https://console.cloud.google.com/billing/budgets 에서:
- 예산 알림 $1 설정 (초과해도 과금은 막지 못하지만 알림은 받음)

## 5. 저에게 알려줄 것

- Maps JS 키 (그대로 채팅에 붙여넣으셔도 됩니다 — HTTP 리퍼러로 제한 걸려 있어서 이 도메인 밖에서는 못 씁니다)
- 서버 키는 **평문으로 채팅에 붙여넣지 마세요** — "서버 키 발급했어요"라고만 말씀하시면 안전하게 넣는 절차를 진행합니다
