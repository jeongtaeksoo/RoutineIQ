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
