# RoutineIQ Release Checklist

Last updated: 2026-02-13

## 1) Required Environment Variables

### Web (`apps/web`)
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_API_BASE_URL`
- `NEXT_PUBLIC_E2E_TEST_MODE` (optional, test only)
- `NEXT_PUBLIC_ENABLE_TOKEN_BRIDGE` (optional, test only)

### API (`apps/api`)
- `APP_ENV`
- `FRONTEND_URL`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`
- `OPENAI_MODEL` (optional, default exists)
- `OPENAI_PRICE_INPUT_PER_1K` (optional)
- `OPENAI_PRICE_OUTPUT_PER_1K` (optional)
- `FREE_DAILY_ANALYZE_LIMIT` (optional)
- `PRO_DAILY_ANALYZE_LIMIT` (optional)
- `FREE_REPORT_RETENTION_DAYS` (optional)
- `PRO_REPORT_RETENTION_DAYS` (optional)
- `ANALYZE_PER_MINUTE_LIMIT` (optional)
- `COHORT_WINDOW_DAYS` (optional)
- `COHORT_MIN_SAMPLE_SIZE` (optional)

### Stripe (API only)
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_ID_PRO`
- `STRIPE_SUCCESS_URL`
- `STRIPE_CANCEL_URL`

## 2) Pre-Release Verify Commands

Run from repo root:

```bash
./scripts/release-verify.sh
```

Live staging smoke only:

```bash
./scripts/staging-smoke.sh
```

Notes:
- `apps/api/.python-version` must be `3.12`.
- `release-verify.sh` enforces 3.12 venv recreation when needed.
- Set `STRICT_MYPY=1` if you want mypy to block release.

## 3) Deployment Order

1. **DB (Supabase)**
   - Apply `supabase/schema.sql` and latest patches.
   - Confirm RLS policies and unique/index constraints.
2. **API (Render)**
   - Deploy new backend build.
   - Confirm `/health` returns `200`.
   - Confirm `/api/stripe/status` returns expected readiness.
3. **Web (Vercel)**
   - Deploy frontend with production env set.
   - Confirm `/login?demo=1` and `/app/insights` flow.
4. **Smoke**
   - Run `scripts/staging-smoke.sh` against target API base.
   - Verify F1/F2/F3 and Stripe checkout/webhook path.
5. **Billing validation**
   - Create checkout session with email account.
   - Trigger webhook (Stripe CLI or dashboard replay).
   - Verify `subscriptions` sync in Supabase.

## 4) Rollback Procedure

1. **Web rollback**
   - Promote previous Vercel deployment.
2. **API rollback**
   - Roll back Render service to previous successful deploy.
3. **DB rollback**
   - Revert only non-destructive patches first.
   - If schema migration introduced incompatible change, restore from latest backup/snapshot.
4. **Disable billing if needed**
   - Remove/blank Stripe envs on API to force billing-safe mode (`503` on checkout).
5. **Post-rollback smoke**
   - `/health` 200
   - F1 and F2 pass
   - Billing safely disabled or working fully

## 5) Operations and Logs

- API runtime logs: Render service logs (or local `/tmp/routineiq_staging_smoke_api.log` in smoke).
- DB/API errors: `system_errors` table (PII-redacted).
- Web deploy/build logs: Vercel build/runtime logs.
- Stripe webhook diagnostics: Stripe dashboard event logs + API `system_errors`.

## 6) Go/No-Go Criteria

Release only when:
- `G1` web checks pass.
- `G2` API checks pass.
- `G3` live F2 + RLS + usage events smoke pass.
- `G4` Stripe checkout + webhook + subscription sync pass.
- `G5` error logging verified.
- `G6` secret exposure checks verified.

If Stripe readiness is false or checkout fails, release as **core-only mode** (billing blocked) until Stripe keys/webhook are fixed.
