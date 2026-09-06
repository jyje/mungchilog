# NAVITIME API 키 발급 가이드 (일본 대중교통용, 선택 사항)

Google Routes API는 일본 대중교통 데이터를 제공하지 않습니다 (도쿄·오사카·교토 등에서 `TRANSIT` 요청이 빈 응답이거나, 일부 구간은 조용히 도보 경로로 대체된 응답을 줍니다 — [Google 개발자 포럼](https://discuss.google.dev/t/directions-api-transit-mode-returns-zero-results/378267)에도 같은 사례가 있고 공식 답변은 없습니다). 이 키를 설정하면 일본 구간의 `TRANSIT` 요청만 [NAVITIME](https://www.navitime.co.jp/)으로 대신 보냅니다.

**이 키는 필수가 아닙니다.** 설정하지 않으면 지금처럼 구글로만 동작합니다 (일본 대중교통은 안 뜨거나 가짜 도보 경로로 남습니다). 오사카 여행처럼 일본 대중교통이 실제로 필요할 때만 설정하세요.

## 1. RapidAPI 가입 및 구독

1. https://rapidapi.com 가입 (무료)
2. "NAVITIME Route(totalnavi)" API 페이지로 이동: https://rapidapi.com/navitimejapan-navitimejapan/api/navitime-route-totalnavi
3. 요금제 선택 후 구독 (무료 체험 제공 여부·정확한 요금은 페이지에서 직접 확인 — 자주 바뀝니다)
4. "Endpoints" 탭에서 아무 엔드포인트나 열면 `X-RapidAPI-Key` 값이 보입니다

## 2. 서버에 키 설정

- 로컬 개발: `.env`에 `NAVITIME_API_KEY=`(발급받은 값) 추가. `NAVITIME_API_HOST`는 기본값(`navitime-route-totalnavi.p.rapidapi.com`)을 그대로 두면 됩니다.
- 배포 환경: 구글 서버 키와 마찬가지로 **평문으로 채팅에 붙여넣지 마세요.** "NAVITIME 키 발급했어요"라고만 말씀하시면 SealedSecret 생성 절차를 안내합니다.

## 3. 확인

키를 넣고 서버를 재시작한 뒤, 일본 좌표 두 곳(예: 오사카) 사이 `TRANSIT` 경로를 요청해보세요. 서버 로그나 응답에 이상이 있으면 우선 RapidAPI 대시보드에서 구독 상태와 쿼터를 확인하세요.

**알려진 제약**: NAVITIME 경로는 좌표(위도/경도) 기반 endpoint에만 적용됩니다. 플레이스 ID로 지정한 스팟(자동완성으로 고른 장소 등)은 좌표가 없어 계속 구글로 요청됩니다. 또한 이 통합은 NAVITIME의 공개 API 사양서를 기반으로 작성되었고, 아직 실제 계정으로 라이브 검증되지 않았습니다 — 처음 설정한 뒤에는 실제 경로가 맞게 나오는지 눈으로 한 번 확인해주세요.
