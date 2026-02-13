# Changelog

## 2026-02-13 - Loop 1 (OSS Hardening)

### Added
- `tenacity` dependency for resilient OpenAI calls in API.
- `sentry-sdk[fastapi]` dependency for optional production exception observability.
- OSS research artifact: `docs/OSS_RESEARCH_2026-02-13_LOOP1.md`.

### Changed
- `apps/api/app/services/openai_service.py`
  - Added retry/backoff (`max 3 attempts`) for transient OpenAI failures:
    - transport/timeouts
    - HTTP `408/409/425/429/500/502/503/504`
  - Kept strict JSON schema flow unchanged.
- `apps/api/app/main.py`
  - Added conditional Sentry init (enabled only when `SENTRY_DSN` exists).
- `apps/api/app/core/config.py`
  - Added `SENTRY_DSN`, `SENTRY_TRACES_SAMPLE_RATE` settings.
- `apps/api/app/*`
  - Applied Black formatting across API package to remove format-check debt.
- `apps/api/app/core/security.py`, `apps/api/app/routes/demo.py`, `apps/api/app/routes/trends.py`
  - Fixed mypy typing issues so `mypy app --ignore-missing-imports` is clean.

### Safety
- No change to auth boundary, RLS policy, billing logic, or DB schema.
- No sensitive key exposure; all secrets remain server-side env only.

### Known Follow-up
- API Black formatting debt remains in legacy files; tracked for dedicated formatting loop.
