# RUNBOOK: Recovery v1 + Auto Lapse + Safe Nudge Rollout

## 1) 목적
Recovery Milestone 1~2(수동 복구, Auto Lapse, Safe Nudge)를 운영에 안전하게 롤아웃하기 위한 실행 가이드입니다.

적용 범위:
- 플래그 기반 단계적 활성화 (Phase 0~3)
- 마이그레이션/경로/크론/지표 검증
- 장애 시 부분 롤백 절차

비범위:
- Milestone 3(주간 리뷰/프로토콜 확장)
- 신규 푸시 알림 인프라 도입

## 2) 전제 / 가정
- 기준 코드: `main` SHA `20da6426ea2ddec9bdb89e20781979b09c886b8f`
- Recovery 기본 플래그는 모두 `false`
- API base URL 예시: `https://api.rutineiq.com`
- 스케줄러는 아래 중 하나를 사용:
  - 대안 A: Render Cron (권장)
  - 대안 B: 외부 스케줄러/GitHub Actions에서 `curl` 호출

## 3) 환경변수

### 필수
| Key | 기본값 | 설명 |
|---|---:|---|
| `RECOVERY_V1_ENABLED` | `false` | Recovery API 전체 노출 토글 |
| `AUTO_LAPSE_ENABLED` | `false` | Auto Lapse cron 활성화 |
| `RECOVERY_NUDGE_ENABLED` | `false` | Nudge cron + in-app nudge 활성화 |
| `RECOVERY_CRON_TOKEN` | 없음 | cron 엔드포인트 보호 토큰 |

### 권장 (기본값 유지 가능)
| Key | 기본값 | 설명 |
|---|---:|---|
| `RECOVERY_LAPSE_DEFAULT_THRESHOLD_HOURS` | `12` | 자동 lapse 기준 시간 |
| `RECOVERY_AUTO_LAPSE_COOLDOWN_HOURS` | `24` | auto lapse 재생성 억제 윈도우 |
| `RECOVERY_NUDGE_COOLDOWN_HOURS` | `24` | nudge 재발송 억제 윈도우 |
| `RECOVERY_QUIET_HOURS_START` | `22` | quiet hours 시작(로컬시간) |
| `RECOVERY_QUIET_HOURS_END` | `8` | quiet hours 종료(로컬시간) |
| `RECOVERY_AUTO_LAPSE_BATCH_SIZE` | `500` | auto-lapse 후보 처리 상한 |
| `RECOVERY_NUDGE_BATCH_SIZE` | `500` | nudge 후보 처리 상한 |

## 4) 마이그레이션 순서 (필수)
순서대로 적용:
1. `supabase/patches/2026-02-17_recovery_sessions.sql`
2. `supabase/patches/2026-02-18_recovery_state_and_nudges.sql`

검증 SQL 실행:
```bash
psql "$SUPABASE_DB_URL" -f scripts/recovery-db-preflight.sql
```

빠른 확인 SQL:
```sql
select
  to_regclass('public.recovery_sessions') as recovery_sessions,
  to_regclass('public.user_recovery_state') as user_recovery_state,
  to_regclass('public.recovery_nudges') as recovery_nudges;
```

## 5) OpenAPI 경로 검증
배포 후 즉시 실행:
```bash
/Users/taeksoojung/Desktop/RutineIQ/scripts/recovery-openapi-check.sh https://api.rutineiq.com
```

필수 경로(12개):
- `/api/recovery/lapse`
- `/api/recovery/active`
- `/api/recovery/mode-opened`
- `/api/recovery/checkin`
- `/api/recovery/protocol/start`
- `/api/recovery/action/complete`
- `/api/recovery/complete`
- `/api/recovery/summary`
- `/api/recovery/cron/auto-lapse`
- `/api/recovery/cron/nudge`
- `/api/recovery/nudge`
- `/api/recovery/nudge/ack`

## 6) 수동 검증 커맨드 세트

### 6.1 공통 변수
```bash
export API_BASE_URL="https://api.rutineiq.com"
export ACCESS_TOKEN="<user_jwt>"
export RECOVERY_CRON_TOKEN="<cron_token>"
```

### 6.2 플래그 OFF 회귀 확인
모든 플래그 OFF 시 Recovery 엔드포인트는 `404`가 정상:
```bash
curl -i "$API_BASE_URL/api/recovery/lapse" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}'
```

cron 스모크(OFF 모드):
```bash
API_BASE_URL="$API_BASE_URL" MODE=off RECOVERY_CRON_TOKEN="$RECOVERY_CRON_TOKEN" \
  /Users/taeksoojung/Desktop/RutineIQ/scripts/recovery-cron-smoke.sh
```

### 6.3 수동 Recovery E2E (Phase 1)
```bash
# 1) lapse 생성
SESSION_ID=$(curl -sS -X POST "$API_BASE_URL/api/recovery/lapse" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"entry_surface":"dashboard"}' | jq -r '.session_id')

# 2) mode opened
curl -sS -X POST "$API_BASE_URL/api/recovery/mode-opened" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"session_id\":\"$SESSION_ID\",\"entry_surface\":\"dashboard\"}"

# 3) checkin
curl -sS -X POST "$API_BASE_URL/api/recovery/checkin" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"session_id\":\"$SESSION_ID\",\"energy_level\":3,\"time_budget_bucket\":10,\"context_tag\":\"workday\"}"

# 4) protocol start
curl -sS -X POST "$API_BASE_URL/api/recovery/protocol/start" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"session_id\":\"$SESSION_ID\",\"protocol_type\":\"mva_ladder\",\"intensity_level\":2}"

# 5) minimum action complete
curl -sS -X POST "$API_BASE_URL/api/recovery/action/complete" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"session_id\":\"$SESSION_ID\",\"action_type\":\"focus_2min\",\"duration_min\":2}"

# 6) recovery complete
curl -sS -X POST "$API_BASE_URL/api/recovery/complete" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"session_id\":\"$SESSION_ID\"}"
```

### 6.4 Auto-lapse idempotency 검증 (Phase 2)
```bash
# ON 모드에서는 두 번 호출해도 동일 사용자 open session 중복 생성 0이어야 함
API_BASE_URL="$API_BASE_URL" MODE=on RECOVERY_CRON_TOKEN="$RECOVERY_CRON_TOKEN" \
  /Users/taeksoojung/Desktop/RutineIQ/scripts/recovery-cron-smoke.sh

curl -sS -X POST "$API_BASE_URL/api/recovery/cron/auto-lapse" \
  -H "X-Recovery-Cron-Token: $RECOVERY_CRON_TOKEN"

curl -sS -X POST "$API_BASE_URL/api/recovery/cron/auto-lapse" \
  -H "X-Recovery-Cron-Token: $RECOVERY_CRON_TOKEN"
```

운영 DB에서 중복 open 세션 확인:
```sql
select user_id, count(*)
from public.recovery_sessions
where status='open'
group by user_id
having count(*) > 1;
```

### 6.5 Nudge 억제 + ack 멱등성 검증 (Phase 3)
```bash
# nudge cron 호출
curl -sS -X POST "$API_BASE_URL/api/recovery/cron/nudge" \
  -H "X-Recovery-Cron-Token: $RECOVERY_CRON_TOKEN"

# pending nudge 조회
NUDGE_ID=$(curl -sS "$API_BASE_URL/api/recovery/nudge" \
  -H "Authorization: Bearer $ACCESS_TOKEN" | jq -r '.nudge.nudge_id // empty')

# ack 2회 (멱등)
curl -sS -X POST "$API_BASE_URL/api/recovery/nudge/ack" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"nudge_id\":\"$NUDGE_ID\"}"

curl -sS -X POST "$API_BASE_URL/api/recovery/nudge/ack" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"nudge_id\":\"$NUDGE_ID\"}"
```

## 7) Phase 0~3 롤아웃 절차

### Phase 0: Deploy + Migration + Flags OFF
설정:
- `RECOVERY_V1_ENABLED=false`
- `AUTO_LAPSE_ENABLED=false`
- `RECOVERY_NUDGE_ENABLED=false`

게이트:
1. `/health` 200
2. core flow 회귀 없음
3. OpenAPI 경로 검증 통과
4. DB preflight 통과

롤백:
- 기존 배포 롤백 또는 플래그 OFF 유지

### Phase 1: Manual only
설정:
- `RECOVERY_V1_ENABLED=true`
- `AUTO_LAPSE_ENABLED=false`
- `RECOVERY_NUDGE_ENABLED=false`

게이트:
1. 수동 E2E 완주
2. `recovery_completed` 이벤트 정상 축적
3. RT p50/p90, completion rate 관찰
4. 5xx/422 비정상 급증 없음

롤백:
- `RECOVERY_V1_ENABLED=false`

### Phase 2: Auto-lapse ON (nudge OFF)
설정:
- `RECOVERY_V1_ENABLED=true`
- `AUTO_LAPSE_ENABLED=true`
- `RECOVERY_NUDGE_ENABLED=false`

게이트:
1. auto-lapse cron 2회 호출 시 open 중복 0
2. `auto_lapse_created_count`, `auto_lapse_suppressed_count(by reason)` 정상
3. cron 실행시간/쿼리 부하 허용 범위

롤백:
- `AUTO_LAPSE_ENABLED=false`

### Phase 3: Nudge ON
설정:
- `RECOVERY_V1_ENABLED=true`
- `AUTO_LAPSE_ENABLED=true`
- `RECOVERY_NUDGE_ENABLED=true`

게이트:
1. pending nudge 조회 + ack 멱등
2. 억제 정책(quiet hours / 24h rate limit / reengaged / mode_opened) 동작
3. `nudge_sent_count`, `nudge_suppressed_count(by reason)`, ack rate 모니터링
4. 부정 피드백/알림 피로 guardrail 이상 없음

롤백:
- `RECOVERY_NUDGE_ENABLED=false`

## 8) Known Failure Modes / 진단

| 증상 | 가능 원인 | 진단 | 조치 |
|---|---|---|---|
| cron 401/403 | 토큰 누락/불일치 | 요청 헤더, env 확인 | `RECOVERY_CRON_TOKEN` 재설정/재배포 |
| cron 404 | 플래그 OFF 또는 경로 오인 | 플래그/오픈API 점검 | 플래그 단계 확인, 경로 수정 |
| cron 5xx/502 | DB 객체 누락, 예외 처리 미흡 | DB preflight, API 로그, Sentry | migration 적용, preflight 보강 |
| cron 503 | 토큰 미설정/사전조건 실패 | 응답 detail 확인 | 설정 보완 후 재시도 |
| nudge quiet hours 오동작 | timezone 누락/잘못된 fallback | `user_recovery_state.timezone` 확인 | timezone 보정, locale fallback 점검 |
| 일부 사용자만 실패 | RLS/권한 정합 이슈 | Supabase 정책/서비스키 경로 점검 | 정책/권한 수정 |

## 9) 모니터링 지표
필수 모니터링:
- Recovery flow: `lapse_detected`, `recovery_mode_opened`, `minimum_action_completed`, `recovery_completed`
- Auto lapse: `auto_lapse_created_count`, `auto_lapse_suppressed_count`(reason)
- Nudge: `nudge_sent_count`, `nudge_suppressed_count`(reason), `nudge_shown`
- Error: area 태그(`recovery_v1`, `auto_lapse`, `nudge`) 기준 5xx 비율

## 10) 운영 원칙
- 플래그는 한 번에 하나씩만 활성화
- 단계 전환 전 최소 24시간 관찰
- 장애 시 전체 롤백 대신 해당 플래그만 OFF
- 이슈 등록 시 재현 커맨드 + 상태코드 + `X-Correlation-ID` 첨부
