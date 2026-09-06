# 스팟 시각 필드 마이그레이션: `dwellMinutes` → `plannedDeparture` (v0.2.0)

## 왜

기존에는 스팟의 "언제까지 있을지"가 `dwellMinutes`(시작 시각으로부터 몇 분 후)로만
표현됐다. 시작 시각(`plannedArrival`) 없이는 계산할 기준이 없으니, "시작은
모르지만 몇 시까지는 마쳐야 하는" 일정을 저장할 방법이 아예 없었다.

v0.2.0부터 `plannedDeparture`(절대 시각)를 독립 필드로 추가해서 시작/종료를
각각 선택적으로 가질 수 있게 했다. 넷 다(시작만/종료만/둘 다/둘 다 없음)
유효한 상태다.

## 애플리케이션은 이 마이그레이션에 의존하지 않는다

`apps/web/src/schedule.ts`의 `spotScheduleDisplay`/`scheduleWarnings`/
`routeDepartureIso`, `apps/web/src/legTiming.ts`의 `resolveLegAnchor`
전부 `plannedDeparture`가 없으면 `dwellMinutes`로 자동 대체해서 계산한다.
즉 이 문서의 마이그레이션이 실행되지 않아도 앱은 정상 동작한다.

이 스크립트/Job은 **저장된 데이터를 실제로 정리**하기 위한 것이다 — 두 가지
표현이 영구히 공존하도록 방치하지 않고, `dwellMinutes`를 스키마에서 완전히
제거할 v0.3.0 전에 기존 데이터를 새 형태로 옮겨두기 위함이다.

## 목표 semver

| 버전 | 상태 | 의미 |
|---|---|---|
| **v0.2.0** (이번 릴리스) | `charts/mungchilog` Chart.yaml/appVersion, `apps/server` package.json에 반영됨 | `plannedDeparture` 도입, `dwellMinutes`는 읽기/쓰기 모두 계속 허용(레거시 폴백). 마이그레이션 스크립트/Job 제공 |
| **v0.3.0** (목표, 아직 미착수) | dev/stg/prd 전 환경에서 마이그레이션이 완료됐다고 확인된 후에만 진행 | `apps/web/src/types.ts`·`apps/server/src/schema.ts`의 `SpotSchema`에서 `dwellMinutes` 필드 완전 삭제. 그 전에 삭제하면 아직 마이그레이션되지 않은 트립의 종료 시각 데이터가 저장할 때마다 조용히 사라짐(Zod가 스키마에 없는 키를 파싱 시 그냥 버리기 때문) |

v0.3.0 작업을 시작하기 전에 이 문서의 "환경별 실행 절차"를 dev → stg → prd
순서로 전부 거쳤는지 반드시 확인할 것.

## 무엇이 바뀌는가

트립 하나의 `data` 컬럼(JSON blob) 안에서, 각 스팟에 대해:

```jsonc
// 이전
{ "plannedArrival": "19:00", "dwellMinutes": 90 }

// 이후
{ "plannedArrival": "19:00", "plannedDeparture": "20:30" }
```

- `plannedDeparture`가 이미 있으면 `dwellMinutes`는 그냥 버려진다(둘 다 있을
  이유가 없으므로 새 필드가 항상 우선).
- `plannedArrival`이 없는데 `dwellMinutes`만 있으면(측정 기준이 없으므로)
  `dwellMinutes`만 버려진다 — 애초에 아무것도 설명하지 못하던 값이다.
- **멱등**: 한 번 옮겨진 트립을 다시 돌려도 아무것도 바뀌지 않는다(참조
  동일성으로 확인, `apps/server/src/spot-time-migration.test.ts` 참고).
- `updated_at`은 건드리지 않는다 — 사용자 편집이 아니라 저장 형식 정리이므로
  "최근 수정" 목록 순서나 알림에 영향을 주면 안 된다.

핵심 로직: [`apps/server/src/spot-time-migration.ts`](../../apps/server/src/spot-time-migration.ts)
(순수 함수, 단위 테스트 있음). 실행 스크립트:
[`apps/server/scripts/migrate-spot-time-fields.mjs`](../../apps/server/scripts/migrate-spot-time-fields.mjs).

## 실행 방법

### 로컬 (셸 스크립트)

```bash
apps/server/scripts/migrate-spot-time-fields.sh --dry-run   # 무엇이 바뀔지만 확인
apps/server/scripts/migrate-spot-time-fields.sh              # 실제 적용
# 또는 apps/server 안에서: npm run migrate:spot-time-fields -- --dry-run
```

`DB_PROVIDER`/`DB_SQLITE_PATH`/`DB_POSTGRES_*` 등, 서버가 읽는 것과 같은
환경변수를 그대로 읽는다(`../../.env` 자동 로드). 로컬/포트포워딩된 DB에
직접 붙어서 클러스터에 올리기 전에 먼저 확인할 때 쓴다.

### 클러스터 (ArgoCD PreSync 훅)

`charts/mungchilog`에 `migration.spotTimeFields`로 켜고 끄는 Job 템플릿이
있다(`templates/migration-job.yaml`). 이 Job은 평범한 Job이 아니라
**ArgoCD PreSync 훅**으로 렌더링된다 — `enabled: true`인 동안은 sync할
때마다 이전 실행을 지우고(`hook-delete-policy: BeforeHookCreation`) 새로
한 번 실행하며, **Deployment가 새 이미지로 롤아웃되기 전에** 먼저 끝나야
하고, 실패하면 그 sync 자체가 실패해 롤아웃까지 막힌다. 즉 "이 마이그레이션이
통과한 뒤에만 새 버전이 트래픽을 받는다"는 걸 ArgoCD가 직접 보장한다 —
Job 로그를 사람이 기억해뒀다가 따로 확인하는 방식이 아니다.

기본값은 `enabled: false`이므로 이 훅은 평소 sync에는 전혀 관여하지 않고,
켜져 있을 때만 매 sync마다 재실행된다.

## 환경별 실행 절차 (dev → stg → prd 순서 엄수)

1. `jyje/cluster` 저장소의 해당 환경 파일
   (`clusters/r4spi/apps/mungchilog-<env>.yaml`)에서 먼저 dry-run으로 켠다:
   ```yaml
   helm:
     valuesObject:
       migration:
         spotTimeFields:
           enabled: true
           dryRun: true
   ```
   커밋 → ArgoCD sync. PreSync 훅이라 sync 자체가 이 Job의 완료를 기다린다.
   완료되면 로그 확인:
   ```bash
   kubectl logs -n mungchilog-<env> job/mungchilog-migrate-spot-time-fields
   ```
   "Would upgrade N trip(s)..." 요약과, trip별로 몇 개 스팟이 바뀌는지 확인.
2. 이상 없으면 `dryRun: false`로 바꿔 다시 커밋 → sync. `BeforeHookCreation`
   덕분에 이전(dry-run) Job은 자동으로 지워지고 새로 실행되므로, 수동으로
   Job을 지우거나 이름을 바꿀 필요가 없다.
3. 완료 로그에서 "Upgraded N trip(s), ... 0 unparsable"을 확인한다.
   `unparsable`이 0이 아니면 해당 트립 id를 로그에서 찾아 직접 조사 —
   스크립트는 파싱 실패한 행을 건드리지 않고 건너뛴다(데이터 훼손 없음).
   이 시점에 sync는 이미 성공했고(훅이 통과했으므로) 새 이미지도 함께
   롤아웃됐다.
4. 확인이 끝나면 `migration.spotTimeFields.enabled`를 다시 `false`로
   되돌려 커밋한다 — 다음 sync부터는 이 훅이 더 이상 관여하지 않는다.
   (완료된 Job 자체의 로그는 `kubectl delete`하기 전까진 클러스터에
   남아 있으니, 지우기 전에 필요하면 다시 확인할 수 있다.)
5. dev에서 위 절차를 확인한 뒤에만 stg, 그다음 prd로 반복한다.

## 롤백

이 마이그레이션은 순수하게 형태 변환이라 정보 손실이 없다(위 규칙 참고 -
`plannedDeparture`가 없던 `dwellMinutes`만 버려지는 경우도 애초에 계산
불가능했던 값이라 실질적 손실이 아니다). 문제가 생기면:

- 서버 코드 자체는 두 형태를 모두 계속 이해하므로 코드 롤백이 필요 없다.
- 데이터를 되돌리고 싶다면 마이그레이션 실행 전 시점의 DB 백업에서 복원한다
  (이 스크립트 자체는 되돌리는 스크립트를 제공하지 않는다 - 애초에 막을
  이유가 없는 무손실 정리 작업이기 때문).
