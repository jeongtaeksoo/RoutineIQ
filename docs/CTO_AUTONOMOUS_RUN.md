# RutineIQ Unified Project Notes

Last consolidated: 2026-02-17

This file is the single source of documentation under `docs/`.
Legacy docs in `docs/` were merged here to reduce maintenance overhead.

## 1) Product Summary
- Service: RutineIQ
- Core value: Log daily behavior -> AI analyzes patterns -> generate realistic next-day routine
- Core users: office workers, freelancers, students building sustainable routines

## 2) Tech Stack
- Web: Next.js 14 (App Router), TypeScript, TailwindCSS, shadcn/ui, Recharts
- API: FastAPI (Python 3.12), Pydantic, Tenacity, Sentry
- DB/Auth: Supabase (PostgreSQL + Auth + RLS)
- AI: OpenAI Structured Outputs (JSON Schema)
- Billing: Stripe Checkout + Webhook verification
- Deploy: Vercel (web), Render (api), Supabase (db)

## 3) Repository Structure
- `apps/web`: frontend app
- `apps/api`: backend API
- `supabase`: SQL schema and patches
- `scripts`: release and smoke scripts
- `docs/CTO_AUTONOMOUS_RUN.md`: unified documentation (this file)

## 4) Core Flows
1. Daily log input (diary-first flow)
2. Parse diary into structured blocks (`/api/parse-diary`)
3. Save logs (`/api/logs`)
4. Analyze (`/api/analyze`)
5. View report (`/api/reports`)

## 5) Data Model (Main Tables)
- `profiles`: user profile and role
- `activity_logs`: day-level entries (`user_id + date` unique)
- `ai_reports`: generated report JSON (`user_id + date` unique)
- `subscriptions`: Stripe subscription state
- `usage_events`: usage and telemetry events
- `system_errors`: redacted server-side error logs

## 6) Cohort Trend Policy
- Preview threshold: `COHORT_PREVIEW_SAMPLE_SIZE` (default 20)
- Official threshold: `COHORT_MIN_SAMPLE_SIZE` (default 50)
- High-confidence threshold: `COHORT_HIGH_CONFIDENCE_SAMPLE_SIZE` (default 100)
- Behavior:
  - `n < preview`: insufficient sample message only
  - `preview <= n < min`: preview mode (low confidence, conservative wording, hide rank label)
  - `n >= min`: full comparison mode with rank/tip

### Cohort A/B Threshold Experiment
- Enabled by `COHORT_THRESHOLD_EXPERIMENT_ENABLED`
- Control thresholds: 20 / 50 / 100
- Candidate thresholds: 30 / 80 / 150
- Rollout by `COHORT_THRESHOLD_EXPERIMENT_ROLLOUT_PCT`
- Rollback (one line): set `COHORT_THRESHOLD_EXPERIMENT_ENABLED=false` and redeploy API.

## 7) Security and Reliability
- RLS default-deny model in Supabase
- Auth required on protected APIs
- Stripe webhook signature verification
- OpenAI failures surfaced as proper API errors (no hidden success fallback)

## 8) Local Verification Commands
### API
```bash
cd /Users/taeksoojung/Desktop/RutineIQ/apps/api
.venv/bin/python -m pytest tests/ -v --tb=short
```

### Web
```bash
cd /Users/taeksoojung/Desktop/RutineIQ/apps/web
npm run lint
npm run typecheck
npm run build
npm run test:e2e
```

### Release Gate
```bash
cd /Users/taeksoojung/Desktop/RutineIQ
./scripts/release-verify.sh
```

## 9) Operations Note
- `scripts/cto_batch_runner.sh` appends cycle-run logs to this file.
- Keep this file concise for core context; append-only logs should be pruned periodically if they grow too large.

## 10) Autonomous Rewrite Update (2026-02-20 04:54:59 +0900)
- IA canonicalization executed: `/app/today`, `/app/log`, `/app/plan`, settings route split, billing page real route.
- Analyze UX improved: cancel/retry/progress hints added in Daily Flow and Report pages.
- Settings safety model changed: privacy/account danger actions moved to dedicated pages with `DELETE` confirmation.
- Observability baseline improved: `x-correlation-id` added in web client and API middleware/exception responses.
- Security baseline improved: Next.js response security headers + CSP baseline configured in `next.config.mjs`.
- Rewrite spec artifacts added:
  - `/Users/taeksoojung/Desktop/RutineIQ/docs/PRODUCT_REWRITE_MASTERPLAN_2026-02-19.md`
  - `/Users/taeksoojung/Desktop/RutineIQ/docs/PRODUCT_REWRITE_STORY_BACKLOG_2026-02-19.md`
  - `/Users/taeksoojung/Desktop/RutineIQ/docs/PRODUCT_REWRITE_ARCH_SPEC_2026-02-19.md`

## 11) Autonomous Rewrite Update (2026-02-20 05:00:39 +0900)
- Runtime response validation introduced with `zod` in web layer.
- New files:
  - `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/lib/api/schemas.ts`
  - `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/lib/api/validated-fetch.ts`
- Integrated validated fetch on key paths:
  - Report load/analyze in `/app/reports/[date]`
  - Plan preview report load in `/app/plan`
  - Profile read/write in `/app/settings/profile` and settings modal profile tab
- Trust badge UI duplicated markup removed:
  - New reusable `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/components/trust-badge.tsx`
  - Applied in insights and reports screens.
- Dependency added: `zod` (`apps/web/package.json`, lockfile updated).

## 12) Autonomous Rewrite Update (2026-02-20 05:01:44 +0900)
- i18n hardcoded nav labels reduced:
  - Added `nav_plan`, `nav_short_plan` to `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/lib/i18n.ts`
  - Refactored `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/components/app-shell.tsx` to consume i18n keys (removed locale hardcoding for plan labels).
- Extended runtime schema validation coverage:
  - `/app/plan` report preview
  - `/app/settings/profile` read/write
  - Settings modal profile read/write
- Validation helper exported via typed API layer:
  - `ApiFetchInit` exported from `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/lib/api-client.ts`
- Quality gates re-verified:
  - `npm run lint` PASS
  - `npm run typecheck` PASS
  - `npm run build` PASS

## 13) Autonomous Rewrite Update (2026-02-20 05:07:37 +0900)
- E2E suite aligned with new IA/settings safety model.
- Updated specs:
  - `/Users/taeksoojung/Desktop/RutineIQ/apps/web/e2e/settings-entrypoints.spec.ts`
  - `/Users/taeksoojung/Desktop/RutineIQ/apps/web/e2e/account-delete.spec.ts`
  - `/Users/taeksoojung/Desktop/RutineIQ/apps/web/e2e/core-flows.spec.ts` (canonical today entry)
  - `/Users/taeksoojung/Desktop/RutineIQ/apps/web/e2e/helpers/mock-api.ts` (checkout redirect to `/app/today`)
- Added new spec:
  - `/Users/taeksoojung/Desktop/RutineIQ/apps/web/e2e/analyze-cancel.spec.ts`
- Added app-segment not-found page:
  - `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/app/app/not-found.tsx`
- Verification executed:
  - `npx playwright test e2e/settings-entrypoints.spec.ts e2e/account-delete.spec.ts e2e/analyze-cancel.spec.ts` -> 6 passed
  - `npm run lint` -> PASS
  - `npm run build` -> PASS
  - `npm run typecheck` -> PASS (re-run after build to ensure `.next/types` sync)

## 14) Autonomous Rewrite Update (2026-02-20 05:16:26 +0900)
- Monetization entrypoint hardening (E9-S01):
  - Added reusable free-tier upgrade CTA component:
    - `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/components/billing-value-cta.tsx`
  - Applied CTA at high-intent screens:
    - `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/app/app/insights/page.tsx`
    - `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/app/app/reports/[date]/page.tsx`
    - `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/app/app/plan/page.tsx`
  - CTA behavior: visible for non-PRO users (or unknown plan fallback), hidden for active/trialing PRO.
- Safety regression coverage expanded (E7-S02):
  - New e2e spec:
    - `/Users/taeksoojung/Desktop/RutineIQ/apps/web/e2e/settings-danger.spec.ts`
  - Verifies privacy/account destructive actions remain disabled until `DELETE` confirmation.
- CI smoke gate updated:
  - `.github/workflows/ci.yml` now includes `e2e/settings-danger.spec.ts` in the `web_smoke` job.
- Verification executed:
  - `npm run lint` -> PASS
  - `npm run build` -> PASS
  - `npm run typecheck` -> PASS
  - `npx playwright test e2e/settings-entrypoints.spec.ts e2e/settings-danger.spec.ts e2e/account-delete.spec.ts e2e/analyze-cancel.spec.ts --project=chromium` -> 8 passed

## 15) Autonomous Rewrite Update (2026-02-20 05:25:49 +0900)
- Entitlement source-of-truth centralized through API:
  - Added backend route `/api/me/entitlements`
    - `/Users/taeksoojung/Desktop/RutineIQ/apps/api/app/routes/me.py`
    - `/Users/taeksoojung/Desktop/RutineIQ/apps/api/app/schemas/me.py`
  - Router wired in `/Users/taeksoojung/Desktop/RutineIQ/apps/api/app/main.py`
  - API tests added:
    - `/Users/taeksoojung/Desktop/RutineIQ/apps/api/tests/test_me_route.py`
- Web plan/permission reads migrated to entitlement API:
  - Added schema and cached hook:
    - `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/lib/api/schemas.ts` (`EntitlementsSchema`)
    - `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/lib/use-entitlements.ts`
  - Applied to:
    - `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/components/billing-value-cta.tsx`
    - `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/app/app/billing/page.tsx`
    - `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/app/app/settings/account/page.tsx`
    - `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/components/app-settings-panel.tsx`
- Product analytics baseline added:
  - Backend event route `/api/analytics/events`
    - `/Users/taeksoojung/Desktop/RutineIQ/apps/api/app/routes/analytics.py`
    - `/Users/taeksoojung/Desktop/RutineIQ/apps/api/app/schemas/analytics.py`
    - tests: `/Users/taeksoojung/Desktop/RutineIQ/apps/api/tests/test_analytics_route.py`
  - Frontend tracking helper:
    - `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/lib/analytics.ts`
  - Instrumented events:
    - Billing CTA click in `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/components/billing-value-cta.tsx`
    - Analyze start/success/fail/cancel in
      - `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/app/app/daily-flow/page.tsx`
      - `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/app/app/reports/[date]/page.tsx`
- E2E mock coverage updated:
  - `/Users/taeksoojung/Desktop/RutineIQ/apps/web/e2e/helpers/mock-api.ts`
    - added `/me/entitlements`, `/analytics/events`
- Verification executed:
  - API: `.venv/bin/python -m pytest -q tests/test_me_route.py tests/test_analytics_route.py` -> 5 passed
  - WEB: `npm run lint` -> PASS
  - WEB: `npm run build` -> PASS
  - WEB: `npm run typecheck` -> PASS
  - WEB: `npx playwright test e2e/settings-entrypoints.spec.ts e2e/settings-danger.spec.ts e2e/account-delete.spec.ts e2e/analyze-cancel.spec.ts --project=chromium` -> 8 passed

## 16) Autonomous Rewrite Update (2026-02-20 05:27:58 +0900)
- Monetization and analytics loop strengthened:
  - Added product analytics helper:
    - `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/lib/analytics.ts`
  - Added backend analytics ingestion route:
    - `/Users/taeksoojung/Desktop/RutineIQ/apps/api/app/routes/analytics.py`
    - `/Users/taeksoojung/Desktop/RutineIQ/apps/api/app/schemas/analytics.py`
  - Instrumented key conversion and retention events:
    - billing CTA click: `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/components/billing-value-cta.tsx`
    - checkout/account-convert events: `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/components/billing-actions.tsx`
    - analyze start/success/fail/cancel:
      - `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/app/app/daily-flow/page.tsx`
      - `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/app/app/reports/[date]/page.tsx`
- Entitlement rollout hardening:
  - CTA now waits for entitlement load to avoid PRO-user CTA flicker.
  - Settings/Billing plan display bound to `/api/me/entitlements` path.
- Test coverage and mocks updated:
  - API tests:
    - `/Users/taeksoojung/Desktop/RutineIQ/apps/api/tests/test_analytics_route.py`
    - `/Users/taeksoojung/Desktop/RutineIQ/apps/api/tests/test_me_route.py`
  - E2E mock updates:
    - `/Users/taeksoojung/Desktop/RutineIQ/apps/web/e2e/helpers/mock-api.ts`
    - added `/api/analytics/events`, `/api/me/entitlements`
- Verification executed:
  - API: `.venv/bin/python -m pytest -q tests/test_me_route.py tests/test_analytics_route.py` -> 6 passed
  - WEB: `npm run lint` -> PASS
  - WEB: `npm run build` -> PASS
  - WEB: `npm run typecheck` -> PASS
  - WEB: `npx playwright test e2e/settings-entrypoints.spec.ts e2e/settings-danger.spec.ts e2e/account-delete.spec.ts e2e/analyze-cancel.spec.ts --project=chromium` -> 8 passed

## 17) Autonomous Rewrite Update (2026-02-20 05:33:29 +0900)
- Activation loop infrastructure added (P0 onboarding/activation):
  - Backend activation endpoint:
    - `/Users/taeksoojung/Desktop/RutineIQ/apps/api/app/routes/me.py` (`GET /api/me/activation`)
    - `/Users/taeksoojung/Desktop/RutineIQ/apps/api/app/schemas/me.py` (`ActivationResponse`)
  - Activation criteria:
    - profile required fields complete (`age_group/gender/job_family/work_mode != unknown`)
    - has any log (`activity_logs` exists)
    - has any report (`ai_reports` exists)
    - server returns `next_step` among `profile|log|analyze|complete`
- Web onboarding experience + guard added:
  - New onboarding screen:
    - `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/app/app/onboarding/page.tsx`
  - New activation hook:
    - `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/lib/use-activation.ts`
    - schema: `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/lib/api/schemas.ts` (`ActivationSchema`)
  - In-app client gate to keep incomplete users in activation loop:
    - `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/components/onboarding-gate.tsx`
    - mounted in `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/components/app-shell.tsx`
- Entry route behavior upgraded:
  - `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/app/app/page.tsx`
  - server-side redirect now chooses:
    - activation complete -> `/app/today`
    - incomplete -> `/app/onboarding`
  - E2E mode keeps deterministic `/app/today` redirect
- E2E/CI hardening:
  - New smoke test:
    - `/Users/taeksoojung/Desktop/RutineIQ/apps/web/e2e/app-entry.spec.ts`
  - Mock API updated with `/api/me/activation`
    - `/Users/taeksoojung/Desktop/RutineIQ/apps/web/e2e/helpers/mock-api.ts`
  - CI smoke includes new test:
    - `/Users/taeksoojung/Desktop/RutineIQ/.github/workflows/ci.yml`
- Verification executed:
  - API: `.venv/bin/python -m pytest -q tests/test_me_route.py tests/test_analytics_route.py` -> 8 passed
  - WEB: `npm run lint` -> PASS
  - WEB: `npm run build` -> PASS
  - WEB: `npm run typecheck` -> PASS
  - WEB: `npx playwright test e2e/app-entry.spec.ts e2e/settings-entrypoints.spec.ts e2e/settings-danger.spec.ts e2e/account-delete.spec.ts e2e/analyze-cancel.spec.ts --project=chromium` -> 9 passed

## 18) Autonomous Rewrite Update (2026-02-20 05:37:13 +0900)
- Analyze timeout recovery UX improved for real-world 45s timeouts:
  - Daily Flow (`/app/log`) now starts background report polling after analyze timeout and auto-navigates to report when ready.
    - `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/app/app/daily-flow/page.tsx`
    - Added `analyzeRecoveryHint` copy (KO/EN), timeout-recovery polling (6 attempts, 5s interval).
  - Report page (`/app/reports/[date]`) now starts background report polling after timeout and auto-refreshes report content when available.
    - `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/app/app/reports/[date]/page.tsx`
    - Added `analyzeRecoveryHint` copy (KO/EN), timeout-recovery polling (6 attempts, 5s interval).
- Activation routing stabilized:
  - `/app` server entry now chooses onboarding vs today by real activation status (except deterministic E2E mode).
    - `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/app/app/page.tsx`
  - Added E2E smoke check for `/app` entry redirect:
    - `/Users/taeksoojung/Desktop/RutineIQ/apps/web/e2e/app-entry.spec.ts`
  - CI smoke includes new app-entry spec:
    - `/Users/taeksoojung/Desktop/RutineIQ/.github/workflows/ci.yml`
- Verification executed:
  - API: `.venv/bin/python -m pytest -q tests/test_me_route.py tests/test_analytics_route.py` -> 8 passed
  - WEB: `npm run lint` -> PASS
  - WEB: `npm run build` -> PASS
  - WEB: `npm run typecheck` -> PASS
  - WEB: `npx playwright test e2e/app-entry.spec.ts e2e/settings-entrypoints.spec.ts e2e/settings-danger.spec.ts e2e/account-delete.spec.ts e2e/analyze-cancel.spec.ts --project=chromium` -> 9 passed

## 19) Autonomous Rewrite Update (2026-02-20 05:39:27 +0900)
- Entitlement signal upgraded with actionable usage limits:
  - `/api/me/entitlements` now returns `analyze_used_today` and `analyze_remaining_today`.
  - Backend implementation:
    - `/Users/taeksoojung/Desktop/RutineIQ/apps/api/app/routes/me.py`
    - `/Users/taeksoojung/Desktop/RutineIQ/apps/api/app/schemas/me.py`
  - Uses `usage_events` count (`event_type=analyze`) to compute daily usage/remaining.
- Frontend entitlement schema/hook synced:
  - `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/lib/api/schemas.ts`
  - `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/lib/use-entitlements.ts`
  - E2E mock updated:
    - `/Users/taeksoojung/Desktop/RutineIQ/apps/web/e2e/helpers/mock-api.ts`
- UI value surfaced to user:
  - Billing page shows today usage and remaining count:
    - `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/app/app/billing/page.tsx`
  - Settings account shows today usage vs limit:
    - `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/app/app/settings/account/page.tsx`
- API tests updated for new entitlement fields:
  - `/Users/taeksoojung/Desktop/RutineIQ/apps/api/tests/test_me_route.py`
- Verification executed:
  - API: `.venv/bin/python -m pytest -q tests/test_me_route.py tests/test_analytics_route.py` -> 8 passed
  - WEB: `npm run lint` -> PASS
  - WEB: `npm run build` -> PASS
  - WEB: `npm run typecheck` -> PASS
  - WEB: `npx playwright test e2e/app-entry.spec.ts e2e/settings-entrypoints.spec.ts e2e/settings-danger.spec.ts e2e/account-delete.spec.ts e2e/analyze-cancel.spec.ts --project=chromium` -> 9 passed

## 20) Autonomous Rewrite Update (2026-02-20 05:40:45 +0900)
- Onboarding analytics instrumentation added:
  - New tracked events in web analytics layer:
    - `onboarding_viewed`
    - `onboarding_step_clicked`
    - `onboarding_completed`
  - Files:
    - `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/lib/analytics.ts`
    - `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/app/app/onboarding/page.tsx`
- Entitlements now include daily usage counters for stronger paywall/limit UX:
  - Added fields:
    - `analyze_used_today`
    - `analyze_remaining_today`
  - Backend:
    - `/Users/taeksoojung/Desktop/RutineIQ/apps/api/app/routes/me.py`
    - `/Users/taeksoojung/Desktop/RutineIQ/apps/api/app/schemas/me.py`
    - tests updated in `/Users/taeksoojung/Desktop/RutineIQ/apps/api/tests/test_me_route.py`
  - Web schema/hook synced:
    - `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/lib/api/schemas.ts`
    - `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/lib/use-entitlements.ts`
    - E2E mock sync: `/Users/taeksoojung/Desktop/RutineIQ/apps/web/e2e/helpers/mock-api.ts`
- UI surfaced:
  - Billing page now shows today usage + remaining analyze count.
    - `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/app/app/billing/page.tsx`
  - Settings account page now shows usage vs daily limit.
    - `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/app/app/settings/account/page.tsx`
- Verification executed:
  - API: `.venv/bin/python -m pytest -q tests/test_me_route.py tests/test_analytics_route.py` -> 8 passed
  - WEB: `npm run lint` -> PASS
  - WEB: `npm run build` -> PASS
  - WEB: `npm run typecheck` -> PASS
  - WEB: `npx playwright test e2e/app-entry.spec.ts e2e/settings-entrypoints.spec.ts e2e/settings-danger.spec.ts e2e/account-delete.spec.ts e2e/analyze-cancel.spec.ts --project=chromium` -> 9 passed

## 21) Autonomous Rewrite Update (2026-02-20 05:43:58 +0900)
- Analyze limit UX added at action points (prevents avoidable 4xx and guides upgrade):
  - Daily Flow done-step analyze action now respects entitlement remaining count.
    - `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/app/app/daily-flow/page.tsx`
    - behavior:
      - disables analyze CTA when remaining=0 for free tier
      - shows warning copy and immediate billing CTA
      - tracks billing CTA source (`daily_flow_limit`)
  - Report page analyze actions now respect entitlement remaining count.
    - `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/app/app/reports/[date]/page.tsx`
    - behavior:
      - top analyze CTA and empty-state analyze CTA disabled when remaining=0 for free tier
      - warning banner + billing CTA
      - tracks billing CTA source (`report_limit`, `report_empty_limit`)
- Supporting imports/hook wiring:
  - `useEntitlements` integrated into both screens
  - `next/link` added where direct billing CTA links are rendered
- Verification executed:
  - API: `.venv/bin/python -m pytest -q tests/test_me_route.py tests/test_analytics_route.py` -> 8 passed
  - WEB: `npm run lint` -> PASS
  - WEB: `npm run build` -> PASS
  - WEB: `npm run typecheck` -> PASS
  - WEB: `npx playwright test e2e/app-entry.spec.ts e2e/settings-entrypoints.spec.ts e2e/settings-danger.spec.ts e2e/account-delete.spec.ts e2e/analyze-cancel.spec.ts --project=chromium` -> 9 passed

## 22) Autonomous Rewrite Update (2026-02-20 05:50:11 +0900)
- Auth redirect safety hardened on login client:
  - Added strict internal-path sanitizer for post-auth redirects (`/app/...` style only).
  - Blocked `//` and non-internal redirect vectors for both query-param based redirect and OAuth post-auth cookie.
  - File:
    - `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/components/login-client.tsx`
- Insights profile-warning fatigue reduced with day-scoped dismiss:
  - Added "hide for today" action for missing required profile warning.
  - Persisted dismiss flag in localStorage keyed by date; warning reappears on next day.
  - File:
    - `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/app/app/insights/page.tsx`
- Billing recovery UX strengthened for checkout failures:
  - Added error normalization for timeout/network/generic checkout failures.
  - Added retry CTA + support mailto path + correlation-id display to reduce checkout dead-ends.
  - Added pricing value-comparison card to improve plan comprehension.
  - Files:
    - `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/components/billing-actions.tsx`
    - `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/app/app/billing/page.tsx`
- Correlation-ID regression test coverage added on API:
  - New tests verify:
    - incoming correlation-id echo on success
    - auto-generated correlation-id on missing header
    - same correlation-id preserved on exception response
  - File:
    - `/Users/taeksoojung/Desktop/RutineIQ/apps/api/tests/test_correlation_id.py`
- Verification executed:
  - API: `.venv/bin/python -m pytest -q tests/test_me_route.py tests/test_analytics_route.py tests/test_correlation_id.py` -> 11 passed
  - WEB: `npm run lint` -> PASS
  - WEB: `npm run build` -> PASS
  - WEB: `npm run typecheck` -> PASS
  - WEB: `npx playwright test e2e/app-entry.spec.ts e2e/settings-entrypoints.spec.ts e2e/settings-danger.spec.ts e2e/account-delete.spec.ts e2e/analyze-cancel.spec.ts --project=chromium` -> 9 passed

## 23) Autonomous Rewrite Update (2026-02-20 06:15:07 +0900)
- Plan page ROI experiment instrumentation added (sticky A/B variant):
  - Added localStorage-sticky variant assignment (`control` / `outcome`) on `/app/plan`.
  - Added ROI experiment hero copy variant and billing CTA tracking.
  - New analytics events:
    - `plan_roi_variant_viewed`
    - `plan_roi_cta_clicked`
  - Files:
    - `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/app/app/plan/page.tsx`
    - `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/lib/analytics.ts`
- Insights profile-required warning anti-fatigue shipped:
  - Added day-scoped dismiss action (`오늘 숨기기` / `Hide for today`) and persistence.
  - File:
    - `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/app/app/insights/page.tsx`
- Billing conversion UX and tests aligned to new settings->billing flow:
  - Updated checkout recovery/error UX in billing action block and conversion path handling.
  - Updated `core-flows` F3 scenario to follow current IA:
    - settings account tab -> billing page -> email conversion -> continue checkout.
  - File:
    - `/Users/taeksoojung/Desktop/RutineIQ/apps/web/e2e/core-flows.spec.ts`
- New E2E coverage for profile-warning dismiss behavior:
  - Added test validating warning dismiss persistence for current day.
  - Included in CI smoke suite command.
  - Files:
    - `/Users/taeksoojung/Desktop/RutineIQ/apps/web/e2e/profile-warning-dismiss.spec.ts`
    - `/Users/taeksoojung/Desktop/RutineIQ/.github/workflows/ci.yml`
- Verification executed:
  - WEB: `npm run lint` -> PASS
  - WEB: `npm run typecheck` -> PASS
  - WEB: `npx playwright test e2e/core-flows.spec.ts --project=chromium` -> 7 passed
  - WEB: `npx playwright test e2e/app-entry.spec.ts e2e/settings-entrypoints.spec.ts e2e/settings-danger.spec.ts e2e/account-delete.spec.ts e2e/analyze-cancel.spec.ts e2e/profile-warning-dismiss.spec.ts --project=chromium` -> 10 passed
  - API: `.venv/bin/python -m pytest -q tests/test_me_route.py tests/test_analytics_route.py tests/test_correlation_id.py` -> 11 passed

## 24) Autonomous Rewrite Update (2026-02-20 06:16:53 +0900)
- Billing timeout recovery path now covered by dedicated E2E test:
  - Added `billing-retry` scenario:
    - first checkout call returns 504 timeout
    - timeout copy appears
    - retry CTA succeeds and redirects to checkout success URL
  - File:
    - `/Users/taeksoojung/Desktop/RutineIQ/apps/web/e2e/billing-retry.spec.ts`
- CI smoke suite expanded to include conversion and recovery regressions:
  - Added new specs in smoke command:
    - `e2e/profile-warning-dismiss.spec.ts`
    - `e2e/billing-retry.spec.ts`
  - File:
    - `/Users/taeksoojung/Desktop/RutineIQ/.github/workflows/ci.yml`
- Core flow test alignment completed for settings -> billing -> checkout path:
  - Updated F3 flow to match current IA and conversion gating.
  - File:
    - `/Users/taeksoojung/Desktop/RutineIQ/apps/web/e2e/core-flows.spec.ts`
- Verification executed:
  - WEB: `npx playwright test e2e/billing-retry.spec.ts --project=chromium` -> 1 passed
  - WEB: `npx playwright test e2e/core-flows.spec.ts --project=chromium` -> 7 passed
  - WEB: `npx playwright test e2e/app-entry.spec.ts e2e/settings-entrypoints.spec.ts e2e/settings-danger.spec.ts e2e/account-delete.spec.ts e2e/analyze-cancel.spec.ts e2e/profile-warning-dismiss.spec.ts e2e/billing-retry.spec.ts --project=chromium` -> 11 passed
  - WEB: `npm run lint` -> PASS
  - WEB: `npm run typecheck` -> PASS

## 25) Autonomous Rewrite Update (2026-02-20 11:47:01 +0900)
- Web Vitals observability pipeline added (App Router global):
  - New client reporter component using `useReportWebVitals` with session sampling (20%).
  - Captures core metrics: `LCP`, `INP`, `CLS`, `FCP`, `TTFB`.
  - Sends sampled metrics through existing analytics ingestion as `web_vitals_sampled`.
  - Files:
    - `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/components/web-vitals-reporter.tsx`
    - `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/app/layout.tsx`
    - `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/lib/analytics.ts`
- Paywall fatigue control introduced for value CTA exposure:
  - Added local paywall policy with day/week caps and per-slot cap.
  - Applied gating to `BillingValueCta` and instrumented exposure events.
  - Files:
    - `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/lib/paywall-policy.ts`
    - `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/components/billing-value-cta.tsx`
    - `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/lib/analytics.ts`
- E2E coverage expanded for conversion fatigue and recovery:
  - Added `paywall-cap` scenario (slot exposure cap behavior).
  - Added `billing-retry` scenario (timeout -> retry -> success).
  - Included both in CI smoke suite.
  - Files:
    - `/Users/taeksoojung/Desktop/RutineIQ/apps/web/e2e/paywall-cap.spec.ts`
    - `/Users/taeksoojung/Desktop/RutineIQ/apps/web/e2e/billing-retry.spec.ts`
    - `/Users/taeksoojung/Desktop/RutineIQ/.github/workflows/ci.yml`
- Verification executed:
  - WEB: `npm run lint` -> PASS
  - WEB: `npm run typecheck` -> PASS
  - WEB: `npx playwright test e2e/paywall-cap.spec.ts e2e/billing-retry.spec.ts e2e/profile-warning-dismiss.spec.ts --project=chromium` -> 3 passed
  - WEB: `npx playwright test e2e/app-entry.spec.ts e2e/settings-entrypoints.spec.ts e2e/settings-danger.spec.ts e2e/account-delete.spec.ts e2e/analyze-cancel.spec.ts e2e/profile-warning-dismiss.spec.ts e2e/billing-retry.spec.ts e2e/paywall-cap.spec.ts --project=chromium` -> 12 passed

## 26) Autonomous Rewrite Update (2026-02-20 11:48:00 +0900)
- Redirect sanitization unified across auth entry points:
  - Added shared redirect sanitizer utility and applied it to both login and auth callback flows.
  - Eliminates duplicated redirect sanitization logic and reduces open-redirect regression risk.
  - Files:
    - `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/lib/safe-redirect.ts`
    - `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/components/login-client.tsx`
    - `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/app/auth/callback/route.ts`
- Paywall exposure cap policy implemented:
  - Introduced local policy store with daily/weekly exposure caps and per-slot cap.
  - Applied policy to `BillingValueCta` to reduce repeated prompt fatigue.
  - Added `billing_cta_exposed` telemetry event.
  - Files:
    - `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/lib/paywall-policy.ts`
    - `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/components/billing-value-cta.tsx`
    - `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/lib/analytics.ts`
- Verification/coverage:
  - Added E2E cap regression test:
    - `/Users/taeksoojung/Desktop/RutineIQ/apps/web/e2e/paywall-cap.spec.ts`
  - Updated CI smoke list:
    - `/Users/taeksoojung/Desktop/RutineIQ/.github/workflows/ci.yml`
- Verification executed:
  - WEB: `npm run lint` -> PASS
  - WEB: `npm run typecheck` -> PASS
  - WEB: `npx playwright test e2e/paywall-cap.spec.ts e2e/billing-retry.spec.ts e2e/profile-warning-dismiss.spec.ts --project=chromium` -> 3 passed
  - WEB: `npx playwright test e2e/app-entry.spec.ts e2e/billing-retry.spec.ts --project=chromium` -> 2 passed

## 27) Autonomous Rewrite Update (2026-02-20 11:49:59 +0900)
- Release verification script upgraded for practical operations:
  - Added CLI modes/options:
    - `--fast` (skip web e2e + live smoke)
    - `--skip-web-e2e`
    - `--skip-live-smoke`
    - `--strict-mypy`
  - Updated default web smoke command list to current curated E2E suite.
  - Added explicit runtime config output and help text.
  - File:
    - `/Users/taeksoojung/Desktop/RutineIQ/scripts/release-verify.sh`
- API typing quality fix discovered during release verify:
  - Resolved mypy type warnings in `me` route by using schema models/literals directly.
  - File:
    - `/Users/taeksoojung/Desktop/RutineIQ/apps/api/app/routes/me.py`
- Verification executed:
  - `bash -n /Users/taeksoojung/Desktop/RutineIQ/scripts/release-verify.sh` -> PASS
  - `/Users/taeksoojung/Desktop/RutineIQ/scripts/release-verify.sh --help` -> PASS
  - `VERIFY_FAST=1 /Users/taeksoojung/Desktop/RutineIQ/scripts/release-verify.sh --fast` -> PASS
  - API: `.venv/bin/python -m mypy app/routes/me.py --ignore-missing-imports` -> PASS
  - API: `.venv/bin/python -m pytest -q tests/test_me_route.py tests/test_analytics_route.py tests/test_correlation_id.py` -> 11 passed

## 28) Autonomous Rewrite Update (2026-02-20 12:19:02 +0900)
- Design system scale normalization (E8-S01/S02) applied to core surfaces:
  - Reduced global radius baseline to commercial scale and introduced explicit card/panel radius tokens.
  - Introduced card spacing tokens and wired into Tailwind spacing extension.
  - Files:
    - `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/app/globals.css`
    - `/Users/taeksoojung/Desktop/RutineIQ/apps/web/tailwind.config.ts`
- Shared Card component standardized on token-based geometry:
  - Removed hard-coded 32px rounding and inline shadow.
  - Switched header/content paddings to spacing tokens for consistent surface rhythm.
  - File:
    - `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/components/ui/card.tsx`
- UI surfaces aligned to updated radius scale:
  - App shell sidebar surface and settings modal panel now use tokenized radius.
  - Insights share card modal surface aligned to panel radius token.
  - Files:
    - `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/components/app-shell.tsx`
    - `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/components/app-settings-panel.tsx`
    - `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/app/app/insights/share-card.tsx`
- Verification executed:
  - WEB: `npm run lint` -> PASS
  - WEB: `npm run typecheck` -> PASS
  - WEB: `npm run build` -> PASS
  - WEB: `npx playwright test e2e/core-flows.spec.ts e2e/paywall-cap.spec.ts e2e/billing-retry.spec.ts --project=chromium` -> 9 passed

## 29) Autonomous Rewrite Update (2026-02-20 12:21:17 +0900)
- i18n quality automation added (E10-S05):
  - New audit script validates:
    - declared `Strings` keys
    - referenced `strings.<key>` usages
    - locale object key parity (EN/KO/JA/ZH/ES)
  - Supports strict mode and markdown report output.
  - File:
    - `/Users/taeksoojung/Desktop/RutineIQ/scripts/i18n-audit.sh`
- i18n report generated from current codebase:
  - `/Users/taeksoojung/Desktop/RutineIQ/docs/I18N_AUDIT_REPORT.md`
  - current status: no unknown key references, 8 unused keys reported as warnings.
- Release gate integration improved:
  - `release-verify` now runs i18n audit by default and supports `--skip-i18n-audit` option.
  - File:
    - `/Users/taeksoojung/Desktop/RutineIQ/scripts/release-verify.sh`
- Verification executed:
  - `/Users/taeksoojung/Desktop/RutineIQ/scripts/i18n-audit.sh --help` -> PASS
  - `/Users/taeksoojung/Desktop/RutineIQ/scripts/i18n-audit.sh --report /Users/taeksoojung/Desktop/RutineIQ/docs/I18N_AUDIT_REPORT.md` -> PASS
  - `bash -n /Users/taeksoojung/Desktop/RutineIQ/scripts/release-verify.sh` -> PASS
  - `/Users/taeksoojung/Desktop/RutineIQ/scripts/release-verify.sh --help` -> PASS
  - `VERIFY_FAST=1 /Users/taeksoojung/Desktop/RutineIQ/scripts/release-verify.sh --fast` -> PASS

## 30) Autonomous Rewrite Update (2026-02-20 12:24:00 +0900)
- i18n keyset cleanup completed (removed dead keys):
  - Eliminated unused `Strings` keys and locale payload fields.
  - Result: declared keys now exactly match runtime usage.
  - File:
    - `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/lib/i18n.ts`
- Release/i18n gate tightened:
  - `release-verify` now supports strict i18n enforcement by default (`I18N_STRICT_UNUSED=1`).
  - Added `--relaxed-i18n` switch for exceptional runs.
  - CI web job now includes i18n audit (`--strict-unused`).
  - Files:
    - `/Users/taeksoojung/Desktop/RutineIQ/scripts/release-verify.sh`
    - `/Users/taeksoojung/Desktop/RutineIQ/.github/workflows/ci.yml`
- i18n audit report refreshed:
  - `/Users/taeksoojung/Desktop/RutineIQ/docs/I18N_AUDIT_REPORT.md`
  - current status: declared=16, used=16, unused=0, unknown=0.
- Verification executed:
  - `/Users/taeksoojung/Desktop/RutineIQ/scripts/i18n-audit.sh --strict-unused --report /Users/taeksoojung/Desktop/RutineIQ/docs/I18N_AUDIT_REPORT.md` -> PASS
  - WEB: `npm run lint` -> PASS
  - WEB: `npm run typecheck` -> PASS
  - WEB: `npm run build` -> PASS
  - WEB: `npx playwright test e2e/app-entry.spec.ts e2e/paywall-cap.spec.ts e2e/billing-retry.spec.ts --project=chromium` -> 3 passed
  - `VERIFY_FAST=1 /Users/taeksoojung/Desktop/RutineIQ/scripts/release-verify.sh --fast` -> PASS

## 31) Autonomous Rewrite Update (2026-02-20 12:28:52 +0900)
- Trust badge upgraded from static notice to data-backed confidence panel:
  - Added metric tiles (`input quality`, `profile coverage`, `entries analyzed`, `model retries`) with good/neutral/warn tones.
  - Added context-sensitive guidance hint + quick remediation links (profile/log/report/billing).
  - Files:
    - `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/components/trust-badge.tsx`
    - `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/app/app/insights/page.tsx`
    - `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/app/app/reports/[date]/page.tsx`
- Quick settings modal layout corrected to remove dead whitespace:
  - Removed forced `aspect-square` container.
  - Switched content area to scroll-cap constrained height (`max-h-[calc(84vh-80px)]`) for shorter/longer tab content.
  - File:
    - `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/components/app-settings-panel.tsx`
- Verification executed:
  - WEB: `npm run lint` -> PASS
  - WEB: `npm run typecheck` -> PASS
  - WEB: `npm run build` -> PASS
  - WEB: `npx playwright test e2e/app-entry.spec.ts e2e/core-flows.spec.ts e2e/settings-entrypoints.spec.ts --project=chromium` -> 11 passed

## 32) Autonomous Rewrite Update (2026-02-20 12:30:35 +0900)
- Trust badge regression tests added and CI smoke coverage expanded:
  - New E2E scenarios validate:
    - sparse-data state on insights shows remediation links
    - reports view after analyze shows quality metrics (input quality / retry count)
  - Files:
    - `/Users/taeksoojung/Desktop/RutineIQ/apps/web/e2e/trust-badge.spec.ts`
    - `/Users/taeksoojung/Desktop/RutineIQ/.github/workflows/ci.yml`
- Verification executed:
  - WEB: `npm run lint` -> PASS
  - WEB: `npm run typecheck` -> PASS
  - WEB: `npx playwright test e2e/trust-badge.spec.ts --project=chromium` -> 2 passed
  - WEB: `npx playwright test e2e/app-entry.spec.ts e2e/settings-entrypoints.spec.ts e2e/settings-danger.spec.ts e2e/account-delete.spec.ts e2e/analyze-cancel.spec.ts e2e/profile-warning-dismiss.spec.ts e2e/trust-badge.spec.ts e2e/billing-retry.spec.ts e2e/paywall-cap.spec.ts --project=chromium` -> 14 passed

## 33) Autonomous Rewrite Update (2026-02-20 12:32:10 +0900)
- Quick settings modal a11y + regression hardening:
  - Added semantic dialog attributes (`role="dialog"`, `aria-modal`, `aria-labelledby`) to quick settings panel.
  - Added visual regression guard test ensuring modal is content-sized (prevents return to forced square layout).
  - Files:
    - `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/components/app-settings-panel.tsx`
    - `/Users/taeksoojung/Desktop/RutineIQ/apps/web/e2e/settings-modal-layout.spec.ts`
- CI smoke suite updated to include modal layout regression scenario.
  - File:
    - `/Users/taeksoojung/Desktop/RutineIQ/.github/workflows/ci.yml`
- Verification executed:
  - WEB: `npm run lint` -> PASS
  - WEB: `npm run typecheck` -> PASS
  - WEB: `npm run build` -> PASS
  - WEB: `npx playwright test e2e/settings-modal-layout.spec.ts --project=chromium` -> 1 passed
  - WEB: `npx playwright test e2e/app-entry.spec.ts e2e/settings-entrypoints.spec.ts e2e/settings-modal-layout.spec.ts e2e/settings-danger.spec.ts e2e/account-delete.spec.ts e2e/analyze-cancel.spec.ts e2e/profile-warning-dismiss.spec.ts e2e/trust-badge.spec.ts e2e/billing-retry.spec.ts e2e/paywall-cap.spec.ts --project=chromium` -> 15 passed

## 34) Autonomous Rewrite Update (2026-02-20 12:41:57 +0900)
- Billing funnel attribution instrumentation completed end-to-end:
  - Introduced `from` source normalization on billing page (`today/reports/plan/settings/report_limit/log/billing`).
  - Added `billing_page_viewed` analytics event.
  - Plumbed entry source through checkout/email-convert/support analytics in `BillingActions`.
  - Files:
    - `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/app/app/billing/page.tsx`
    - `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/components/billing-actions.tsx`
    - `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/lib/analytics.ts`
- Billing link hygiene across app surfaces:
  - Updated direct billing links to include source parameter.
  - Files:
    - `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/app/app/reports/[date]/page.tsx`
    - `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/app/app/daily-flow/page.tsx`
    - `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/app/app/settings/account/page.tsx`
    - `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/app/app/plan/page.tsx`
    - `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/components/app-settings-panel.tsx`
- Regression coverage expanded:
  - Added source-parameter e2e scenario.
  - Included scenario in CI smoke and release-verify smoke list.
  - Files:
    - `/Users/taeksoojung/Desktop/RutineIQ/apps/web/e2e/billing-entry-source.spec.ts`
    - `/Users/taeksoojung/Desktop/RutineIQ/.github/workflows/ci.yml`
    - `/Users/taeksoojung/Desktop/RutineIQ/scripts/release-verify.sh`
- Verification executed:
  - WEB: `npm run lint` -> PASS
  - WEB: `npm run typecheck` -> PASS
  - WEB: `npm run build` -> PASS
  - WEB: `npx playwright test e2e/billing-entry-source.spec.ts e2e/billing-retry.spec.ts e2e/settings-modal-layout.spec.ts --project=chromium` -> 3 passed
  - WEB: `npx playwright test e2e/app-entry.spec.ts e2e/settings-entrypoints.spec.ts e2e/settings-modal-layout.spec.ts e2e/settings-danger.spec.ts e2e/account-delete.spec.ts e2e/analyze-cancel.spec.ts e2e/profile-warning-dismiss.spec.ts e2e/trust-badge.spec.ts e2e/billing-entry-source.spec.ts e2e/billing-retry.spec.ts e2e/paywall-cap.spec.ts --project=chromium` -> 16 passed

## 35) Autonomous Rewrite Update (2026-02-20 12:43:12 +0900)
- Today-loop CTA simplification (activation friction reduction):
  - In `no-log` state, reduced Next Action card from 2 equal buttons to 1 primary CTA + 1 low-emphasis text link.
  - Aligns with single-primary onboarding principle and reduces decision overload at first activation step.
  - File:
    - `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/app/app/insights/page.tsx`
- Verification executed:
  - WEB: `npm run lint` -> PASS
  - WEB: `npm run typecheck` -> PASS
  - WEB: `npm run build` -> PASS
  - WEB: `npx playwright test e2e/core-flows.spec.ts e2e/billing-entry-source.spec.ts --project=chromium` -> 8 passed

## 36) Autonomous Rewrite Update (2026-02-20 12:46:48 +0900)
- Billing entry context UX added (source-aware conversion framing):
  - `from` source now renders a context card with reason-specific copy + one-click return path.
  - Supported sources: `today`, `reports`, `plan`, `settings`, `report_limit`, `log`.
  - Added analytics events:
    - `billing_context_banner_viewed`
    - `billing_context_banner_cta_clicked`
  - Files:
    - `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/app/app/billing/page.tsx`
    - `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/lib/analytics.ts`
- Regression coverage expanded for context banner:
  - New E2E: `/app/billing?from=report_limit` renders context card and returns to reports flow.
  - CI/release smoke lists updated accordingly.
  - Files:
    - `/Users/taeksoojung/Desktop/RutineIQ/apps/web/e2e/billing-context.spec.ts`
    - `/Users/taeksoojung/Desktop/RutineIQ/.github/workflows/ci.yml`
    - `/Users/taeksoojung/Desktop/RutineIQ/scripts/release-verify.sh`
- Verification executed:
  - WEB: `npm run lint` -> PASS
  - WEB: `npm run typecheck` -> PASS
  - WEB: `npm run build` -> PASS
  - WEB: `npx playwright test e2e/billing-context.spec.ts e2e/billing-entry-source.spec.ts e2e/billing-retry.spec.ts --project=chromium` -> 3 passed
  - WEB: `npx playwright test e2e/app-entry.spec.ts e2e/settings-entrypoints.spec.ts e2e/settings-modal-layout.spec.ts e2e/settings-danger.spec.ts e2e/account-delete.spec.ts e2e/analyze-cancel.spec.ts e2e/profile-warning-dismiss.spec.ts e2e/trust-badge.spec.ts e2e/billing-entry-source.spec.ts e2e/billing-context.spec.ts e2e/billing-retry.spec.ts e2e/paywall-cap.spec.ts --project=chromium` -> 17 passed

## 37) Autonomous Rewrite Update (2026-02-20 12:52:49 +0900)
- Supportability/Recovery UX hardened with correlation references:
  - `api-client` now attaches correlation IDs to timeout/network errors as well.
  - Added shared API error formatter to consistently include hint + error reference.
  - Files:
    - `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/lib/api-client.ts`
    - `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/lib/api-error.ts`
- Applied unified error formatting to primary loop pages:
  - Insights: report load/analyze/quickstart failures now include reference id.
  - Daily Flow: parse/save/analyze/load-warning paths now include reference id.
  - Reports: load/analyze failures now include reference id.
  - Files:
    - `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/app/app/insights/page.tsx`
    - `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/app/app/daily-flow/page.tsx`
    - `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/app/app/reports/[date]/page.tsx`
- Regression coverage expanded:
  - New E2E validates error-reference label visibility for report analyze failure and daily-flow parse failure.
  - CI/release smoke lists updated.
  - Files:
    - `/Users/taeksoojung/Desktop/RutineIQ/apps/web/e2e/error-reference.spec.ts`
    - `/Users/taeksoojung/Desktop/RutineIQ/.github/workflows/ci.yml`
    - `/Users/taeksoojung/Desktop/RutineIQ/scripts/release-verify.sh`
- Verification executed:
  - WEB: `npm run lint` -> PASS
  - WEB: `npm run typecheck` -> PASS
  - WEB: `npm run build` -> PASS
  - WEB: `npx playwright test e2e/error-reference.spec.ts --project=chromium` -> 2 passed
  - WEB: `npx playwright test e2e/app-entry.spec.ts e2e/settings-entrypoints.spec.ts e2e/settings-modal-layout.spec.ts e2e/settings-danger.spec.ts e2e/account-delete.spec.ts e2e/analyze-cancel.spec.ts e2e/profile-warning-dismiss.spec.ts e2e/trust-badge.spec.ts e2e/billing-entry-source.spec.ts e2e/billing-context.spec.ts e2e/error-reference.spec.ts e2e/billing-retry.spec.ts e2e/paywall-cap.spec.ts --project=chromium` -> 19 passed

## 38) Autonomous Rewrite Update (2026-02-20 12:55:05 +0900)
- Error observability and support recovery standardized:
  - Added shared helpers for API error formatting and reference extraction.
  - Added correlation-id propagation to timeout/network failures in `api-client`.
  - Files:
    - `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/lib/api-error.ts`
    - `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/lib/api-client.ts`
- Applied unified error reference UX across core loop pages:
  - Insights / Daily Flow / Reports now surface `Error reference` in failure banners where available.
  - Files:
    - `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/app/app/insights/page.tsx`
    - `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/app/app/daily-flow/page.tsx`
    - `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/app/app/reports/[date]/page.tsx`
- Added error banner observability event:
  - New analytics event: `ui_error_banner_shown` with extracted reference id.
  - File:
    - `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/lib/analytics.ts`
- Regression coverage added:
  - New E2E `error-reference.spec.ts` validates reference id rendering on report analyze failure and daily-flow parse failure.
  - CI/release smoke lists updated.
  - Files:
    - `/Users/taeksoojung/Desktop/RutineIQ/apps/web/e2e/error-reference.spec.ts`
    - `/Users/taeksoojung/Desktop/RutineIQ/.github/workflows/ci.yml`
    - `/Users/taeksoojung/Desktop/RutineIQ/scripts/release-verify.sh`
- Verification executed:
  - WEB: `npm run lint` -> PASS
  - WEB: `npm run typecheck` -> PASS
  - WEB: `npm run build` -> PASS
  - WEB: `npx playwright test e2e/error-reference.spec.ts --project=chromium` -> 2 passed
  - WEB: `npx playwright test e2e/app-entry.spec.ts e2e/settings-entrypoints.spec.ts e2e/settings-modal-layout.spec.ts e2e/settings-danger.spec.ts e2e/account-delete.spec.ts e2e/analyze-cancel.spec.ts e2e/profile-warning-dismiss.spec.ts e2e/trust-badge.spec.ts e2e/billing-entry-source.spec.ts e2e/billing-context.spec.ts e2e/error-reference.spec.ts e2e/billing-retry.spec.ts e2e/paywall-cap.spec.ts --project=chromium` -> 19 passed

## 39) Autonomous Rewrite Update (2026-02-20 13:10:36 +0900)
- Live smoke regression fix (activation gate alignment):
  - Updated live E2E sign-in landing expectation to allow `/app/onboarding` in addition to `/app/today` and `/app/insights`.
  - This matches current activation-gated product behavior and removes false-negative failures in release smoke.
  - File:
    - `/Users/taeksoojung/Desktop/RutineIQ/apps/web/e2e/core-flows.spec.ts`
- Settings account UX hardening:
  - Removed raw `-` placeholders for account name/email in quick settings.
  - Added explicit fallback labels (`Guest user`, `No email set`) and email-setup guidance block when `needs_email_setup` is true.
  - Added stable test ids for account value fields to prevent UI regressions.
  - Files:
    - `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/components/app-settings-panel.tsx`
    - `/Users/taeksoojung/Desktop/RutineIQ/apps/web/e2e/settings-account-ux.spec.ts`
    - `/Users/taeksoojung/Desktop/RutineIQ/.github/workflows/ci.yml`
    - `/Users/taeksoojung/Desktop/RutineIQ/scripts/release-verify.sh`
- Verification executed:
  - WEB: `npm run lint` -> PASS
  - WEB: `npm run typecheck` -> PASS
  - WEB: `npx playwright test e2e/settings-account-ux.spec.ts --project=chromium` -> 1 passed
  - WEB: `npx playwright test e2e/app-entry.spec.ts e2e/settings-entrypoints.spec.ts e2e/settings-modal-layout.spec.ts e2e/settings-modal-navigation.spec.ts e2e/settings-account-ux.spec.ts e2e/settings-danger.spec.ts e2e/account-delete.spec.ts e2e/analyze-cancel.spec.ts e2e/profile-warning-dismiss.spec.ts e2e/trust-badge.spec.ts e2e/billing-entry-source.spec.ts e2e/billing-context.spec.ts e2e/error-reference.spec.ts e2e/billing-retry.spec.ts e2e/paywall-cap.spec.ts --project=chromium` -> 21 passed
  - OPS: `./scripts/staging-smoke.sh` -> PASS
  - OPS: `./scripts/release-verify.sh` -> PASS

## 40) Autonomous Rewrite Update (2026-02-20 13:13:28 +0900)
- Supabase server auth hardening:
  - Replaced server-side `auth.getSession()` usage with `auth.getUser()` in app gate routes to remove insecure-session warnings and align with Supabase guidance.
  - Updated files:
    - `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/app/app/layout.tsx`
    - `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/app/app/page.tsx`
  - Result:
    - Live F2 smoke no longer logs the prior `getSession()` security warning during app entry.
- Verification executed:
  - WEB: `npm run lint && npm run typecheck` -> PASS
  - WEB: `npx playwright test e2e/app-entry.spec.ts e2e/settings-entrypoints.spec.ts --project=chromium` -> 4 passed
  - OPS: `./scripts/staging-smoke.sh` -> PASS
  - OPS: `./scripts/release-verify.sh --skip-live-smoke` -> PASS

## 41) Autonomous Rewrite Update (2026-02-20 13:19:09 +0900)
- Billing conversion friction reduction (email-login setup step):
  - Added client-side validity gating for email conversion CTA:
    - valid email format
    - password length >= 8
    - password confirmation match
  - Added inline rule checklist for immediate feedback (reduces failed submit loops).
  - Added explicit invalid-email message path.
  - Updated file:
    - `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/components/billing-actions.tsx`
- Regression coverage added:
  - New E2E verifies `Create account to continue` remains disabled until all conversion inputs are valid, then enables and proceeds.
  - Updated files:
    - `/Users/taeksoojung/Desktop/RutineIQ/apps/web/e2e/billing-email-validation.spec.ts`
    - `/Users/taeksoojung/Desktop/RutineIQ/.github/workflows/ci.yml`
    - `/Users/taeksoojung/Desktop/RutineIQ/scripts/release-verify.sh`
- Verification executed:
  - WEB: `npm run lint` -> PASS
  - WEB: `npm run typecheck` -> PASS
  - WEB: `npx playwright test e2e/billing-email-validation.spec.ts --project=chromium` -> 1 passed
  - WEB: `npx playwright test e2e/app-entry.spec.ts e2e/settings-entrypoints.spec.ts e2e/settings-modal-layout.spec.ts e2e/settings-modal-navigation.spec.ts e2e/settings-account-ux.spec.ts e2e/settings-danger.spec.ts e2e/account-delete.spec.ts e2e/analyze-cancel.spec.ts e2e/profile-warning-dismiss.spec.ts e2e/trust-badge.spec.ts e2e/billing-entry-source.spec.ts e2e/billing-context.spec.ts e2e/billing-email-validation.spec.ts e2e/error-reference.spec.ts e2e/billing-retry.spec.ts e2e/paywall-cap.spec.ts --project=chromium` -> 22 passed
  - OPS: `./scripts/staging-smoke.sh` -> PASS
  - OPS: `./scripts/release-verify.sh --skip-live-smoke` -> PASS

## 42) Autonomous Rewrite Update (2026-02-20 13:21:34 +0900)
- Pro account CTA clarity fix in quick settings:
  - Replaced ambiguous Pro-state button label (`Pro`) with explicit billing-management CTA (`Manage billing` / `결제 관리`).
  - Updated file:
    - `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/components/app-settings-panel.tsx`
- Regression coverage added:
  - New E2E validates that when entitlements indicate Pro, account tab shows `Manage billing` CTA with correct billing route.
  - Updated files:
    - `/Users/taeksoojung/Desktop/RutineIQ/apps/web/e2e/settings-account-pro-cta.spec.ts`
    - `/Users/taeksoojung/Desktop/RutineIQ/.github/workflows/ci.yml`
    - `/Users/taeksoojung/Desktop/RutineIQ/scripts/release-verify.sh`
- Verification executed:
  - WEB: `npm run lint` -> PASS
  - WEB: `npm run typecheck` -> PASS
  - WEB: `npx playwright test e2e/settings-account-pro-cta.spec.ts --project=chromium` -> 1 passed
  - WEB: `npx playwright test e2e/app-entry.spec.ts e2e/settings-entrypoints.spec.ts e2e/settings-modal-layout.spec.ts e2e/settings-modal-navigation.spec.ts e2e/settings-account-ux.spec.ts e2e/settings-account-pro-cta.spec.ts e2e/settings-danger.spec.ts e2e/account-delete.spec.ts e2e/analyze-cancel.spec.ts e2e/profile-warning-dismiss.spec.ts e2e/trust-badge.spec.ts e2e/billing-entry-source.spec.ts e2e/billing-context.spec.ts e2e/billing-email-validation.spec.ts e2e/error-reference.spec.ts e2e/billing-retry.spec.ts e2e/paywall-cap.spec.ts --project=chromium` -> 23 passed
  - OPS: `./scripts/release-verify.sh --skip-live-smoke` -> PASS

## 43) Autonomous Rewrite Update (2026-02-20 13:23:24 +0900)
- Billing conversion keyboard UX/a11y improvement:
  - Converted email-setup block to real `<form>` with submit handling.
  - Users can now press `Enter` in password-confirm field to trigger conversion (when validation passes).
  - Validation gate remains strict (`email format` + `password length` + `match`) and submit is blocked until valid.
  - Updated files:
    - `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/components/billing-actions.tsx`
    - `/Users/taeksoojung/Desktop/RutineIQ/apps/web/e2e/billing-email-validation.spec.ts`
- Verification executed:
  - WEB: `npm run lint` -> PASS
  - WEB: `npm run typecheck` -> PASS
  - WEB: `npx playwright test e2e/billing-email-validation.spec.ts --project=chromium` -> 1 passed
  - OPS: `./scripts/release-verify.sh --skip-live-smoke` -> PASS

## 44) Autonomous Rewrite Update (2026-02-20 13:24:47 +0900)
- CI/log observability quality improvement:
  - Removed noisy Node warnings caused by `NO_COLOR` + `FORCE_COLOR` conflict from verification scripts.
  - Applied `unset NO_COLOR` at script bootstrap for:
    - `/Users/taeksoojung/Desktop/RutineIQ/scripts/release-verify.sh`
    - `/Users/taeksoojung/Desktop/RutineIQ/scripts/staging-smoke.sh`
  - Outcome:
    - Web build/E2E logs now surface actual failures more clearly without color-mode warning spam.
- Verification executed:
  - OPS: `./scripts/release-verify.sh --skip-live-smoke` -> PASS (23 e2e smoke tests passed; warning spam removed)

## 45) Autonomous Rewrite Update (2026-02-20 13:25:54 +0900)
- Auth fallback risk containment in API client:
  - Changed server token fallback to explicit opt-in only.
  - `fetchServerToken()` path now runs only when `NEXT_PUBLIC_ENABLE_SERVER_TOKEN_FALLBACK=1`.
  - Default behavior remains client token resolution (`getSession/refresh` + E2E bridge) without server-token fallback.
  - Updated file:
    - `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/lib/api-client.ts`
- Verification executed:
  - WEB: `npm run lint` -> PASS
  - WEB: `npm run typecheck` -> PASS
  - OPS: `./scripts/release-verify.sh --skip-live-smoke` -> PASS

## 46) Autonomous Rewrite Update (2026-02-20 13:40:00 +0900)
- Revenue telemetry integrity hardening (conversion/source attribution):
  - Billing checkout API call now sends `x-routineiq-billing-source` header from UI entry context.
  - Live smoke script now marks Stripe checkout/webhook metadata with `source=live_smoke`.
  - Subscription schema updated to support durable source attribution:
    - `subscriptions.source text not null default 'unknown'`
    - migration patch added for existing DBs.
  - Updated files:
    - `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/components/billing-actions.tsx`
    - `/Users/taeksoojung/Desktop/RutineIQ/apps/web/scripts/live-smoke.mjs`
    - `/Users/taeksoojung/Desktop/RutineIQ/supabase/schema.sql`
    - `/Users/taeksoojung/Desktop/RutineIQ/supabase/patches/2026-02-20_subscriptions_source.sql`
    - `/Users/taeksoojung/Desktop/RutineIQ/apps/api/tests/test_stripe_integration.py`
- Verification status:
  - Static diff review complete.
  - Local Python test execution currently blocked by missing FastAPI test deps in this shell environment.
