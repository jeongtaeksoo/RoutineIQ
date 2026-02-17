# Recovery Intelligence v1/v2 (Recovery Mode + Auto Lapse + Safe Nudge)

## Scope
- Milestone 1: manual self-report recovery flow + RT pipeline + minimal RT p50 summary.
- Milestone 2: auto lapse detection + safe in-app nudge.
- Non-scope: push/email integration, AI personalization, protocol library expansion.
- Migration split:
  - `2026-02-17_recovery_sessions.sql` (Milestone 1)
  - `2026-02-18_recovery_state_and_nudges.sql` (Milestone 2 additive changes)

## Feature Flag
- API flags:
  - `RECOVERY_V1_ENABLED` (`false` by default)
  - `AUTO_LAPSE_ENABLED` (`false` by default)
  - `RECOVERY_NUDGE_ENABLED` (`false` by default)
- OFF: no behavior change for existing features. Recovery endpoints return 404.
- ON behavior:
  - Manual self-report flow: requires `RECOVERY_V1_ENABLED`.
  - Auto lapse: requires `RECOVERY_V1_ENABLED` + `AUTO_LAPSE_ENABLED`.
  - Nudge: requires `RECOVERY_V1_ENABLED` + `RECOVERY_NUDGE_ENABLED`.

## Contract Decisions (Locked)
1. **Single identifier**
   - `recovery_sessions.id (uuid)` is the single session/lapse identifier.
   - Event payload `lapse_id` = `recovery_sessions.id`.
2. **Open session uniqueness**
   - DB partial unique index: `UNIQUE(user_id) WHERE status='open'`.
   - `/api/recovery/lapse` behavior:
     - Open session exists -> return existing.
     - No open session -> create new.
3. **UUID generation strategy**
   - Uses `gen_random_uuid()` (already used in this repository + `pgcrypto` enabled).
4. **RT calculation**
   - `rt_min = floor((recovery_completed_at - lapse_start_ts) / 60s)`
   - All timestamps are `timestamptz` (UTC).
   - Same `rt_min` value is written to `recovery_completed` event meta.
5. **Meaningful engagement definition (`last_engaged_at`)**
   - Updated only by:
     - `minimum_action_completed`
     - `recovery_completed`
   - Milestone 2에서는 위 2개만 의미 있는 재참여로 취급한다.
6. **Auto lapse threshold**
   - 기본값 `12h` (`RECOVERY_LAPSE_DEFAULT_THRESHOLD_HOURS`).
   - 사용자별 값은 `user_recovery_state.lapse_threshold_hours` 우선.

## Data Model (Milestone 1)
- New table: `public.recovery_sessions`
  - status: `open | completed`
  - detection_source: `self | auto`
  - lapse_start_ts, recovery_completed_at, rt_min
  - checkin/protocol/action fields for v1 pipeline
  - correlation_id for observability

## Data Model (Milestone 2)
- `public.user_recovery_state`
  - `user_id` PK
  - `last_engaged_at`
  - `lapse_threshold_hours` (default 12)
  - `last_auto_lapse_at`, `last_nudge_at`
  - `locale`, `timezone`
  - optional quiet-hours override (`quiet_hours_start/end`)
- `public.recovery_nudges`
  - in-app nudge queue/status (`pending/shown/suppressed`)
  - unique `(user_id, session_id, nudge_channel)` to prevent duplicates

## Endpoints (Milestone 1)
- `POST /api/recovery/lapse`
- `GET /api/recovery/active`
- `POST /api/recovery/mode-opened`
- `POST /api/recovery/checkin`
- `POST /api/recovery/protocol/start`
- `POST /api/recovery/action/complete`
- `POST /api/recovery/complete`
- `GET /api/recovery/summary?window_days=14`

## Endpoints (Milestone 2)
- Scheduler endpoints (cron token required):
  - `POST /api/recovery/cron/auto-lapse`
  - `POST /api/recovery/cron/nudge`
- User nudge endpoints:
  - `GET /api/recovery/nudge`
  - `POST /api/recovery/nudge/ack`

## Events (validated at runtime)
- `lapse_detected`
- `recovery_mode_opened`
- `checkin_submitted`
- `recovery_protocol_started`
- `minimum_action_completed`
- `recovery_completed`
- `nudge_scheduled`
- `nudge_shown`
- `nudge_suppressed`
- counters in usage events:
  - `auto_lapse_created_count`
  - `auto_lapse_suppressed_count` (reason 포함)
  - `nudge_sent_count`
  - `nudge_suppressed_count` (reason 포함)

## Idempotency
- `lapse_detected`: open-session check + DB unique index + optional `Idempotency-Key` best-effort.
- `recovery_completed`: deterministic idempotency key per session and completed-state re-read to prevent duplicate completion/event.
- `auto-lapse`: DB open-session partial unique + state cooldown.
- `nudge`: unique `(user_id, session_id, channel)` + 24h nudge cooldown.

## Auto Lapse Rules (Milestone 2)
- 조건:
  - `now >= last_engaged_at + threshold`
  - open recovery session 없음
  - `last_auto_lapse_at` cooldown(기본 24h) 통과
- 생성 시각:
  - `lapse_start_ts = last_engaged_at + threshold` (탐지 시각 아님)

## Nudge Suppression Rules (Milestone 2)
- 24h 당 최대 1회 (`last_nudge_at`)
- quiet hours(기본 22:00~08:00, 사용자 로컬 시간 기준)에는 억제
- `last_engaged_at > lapse_start_ts`면 억제(re-engaged)
- open session이 있고 recovery mode 이미 열었으면(`entry_surface` 존재) 억제

## Timezone Resolution (Quiet Hours)
- 우선순위:
  1. `user_recovery_state.timezone` (IANA tz string)
  2. locale fallback (`ko`=Asia/Seoul, `ja`=Asia/Tokyo, `zh`=Asia/Shanghai, `es`=Europe/Madrid, `en`=America/New_York)
  3. unknown locale -> UTC
- DST: `zoneinfo`를 사용하므로 IANA timezone이 있으면 DST 자동 반영.
- timezone 값이 비어있거나 invalid면 locale fallback을 적용.

## Candidate Selection / Performance
- Auto lapse cron은 전체 사용자 무조건 스캔하지 않도록 후보군 1차 필터를 사용:
  - `last_engaged_at <= now-1h` (최소 임계값 기반)
  - `last_auto_lapse_at is null OR <= now-cooldown`
- DB index:
  - `user_recovery_state_last_engaged_idx`
  - `user_recovery_state_auto_lapse_candidate_idx (last_auto_lapse_at, last_engaged_at)`
- 이후 애플리케이션 레벨에서 사용자별 threshold 조건을 최종 판정.

## Observability
- `X-Correlation-ID` accepted/generated and returned.
- Error logs include `correlation_id`, route, user id.
- Recovery events are persisted to `usage_events` with structured meta.
- Sentry tags:
  - `area=recovery_v1`
  - `area=auto_lapse`
  - `area=nudge`
  - `correlation_id`

## Rollout / Rollback
- Rollout: deploy with flag OFF -> validate -> enable ON.
- Rollback:
  - manual only 끄기: `RECOVERY_V1_ENABLED=false`
  - auto lapse만 끄기: `AUTO_LAPSE_ENABLED=false`
  - nudge만 끄기: `RECOVERY_NUDGE_ENABLED=false`
- DB migration is additive and safe to keep even when feature is OFF.
