## RoutineIQ

RoutineIQ analyzes your Daily Flow (behavior log) to find productivity peak hours, focus break triggers, and generates a **Tomorrow's Smart Schedule** plus **If-Then recovery rules**.

### MVP Success Criteria (Hackathon)
- Deployed URLs: Frontend (Vercel) + Backend (Render)
- Supabase Auth + Postgres + RLS (default deny)
- OpenAI schema-enforced JSON (Structured Outputs) + server validation before saving
- Stripe Subscription (Checkout + Webhook with signature verification). If Stripe env is not set, billing is disabled but core features still work.
- Demo-ready: seed data or demo account so judges can test end-to-end quickly

### Repo Layout
```
/apps/web        Next.js (App Router) - TBD
/apps/api        FastAPI backend (implemented)
/supabase        Supabase SQL schema + RLS
/docs           Architecture + IA + DB design
```

---

## Step 1: Architecture + IA + DB Design (Done)
- `/Users/taeksoojung/Desktop/RoutineIQ/docs/ARCHITECTURE.md`
- `/Users/taeksoojung/Desktop/RoutineIQ/docs/IA.md`
- `/Users/taeksoojung/Desktop/RoutineIQ/docs/DB_DESIGN.md`

## Step 2: Supabase SQL + RLS (Ready)
- Apply: `/Users/taeksoojung/Desktop/RoutineIQ/supabase/schema.sql`

Notes:
- RLS is enabled and default-deny.
- `profiles` is auto-created on signup (trigger on `auth.users`).

## Step 3: Backend API (In Progress, Core Done)
FastAPI endpoints (fixed):
- `POST /api/logs`
- `GET /api/logs?date=YYYY-MM-DD`
- `POST /api/analyze`
- `GET /api/reports?date=YYYY-MM-DD`
- `POST /api/stripe/create-checkout-session`
- `POST /api/stripe/webhook` (raw body + signature verify)
- `GET /api/admin/users` (admin only)
- `GET /api/admin/users/{id}` (admin only)
- `POST /api/admin/sync-subscription/{id}` (admin only)
- `GET /api/admin/errors` (admin only)

Backend code location:
- `/Users/taeksoojung/Desktop/RoutineIQ/apps/api/app/main.py`

### Backend Local Run (after you set env)
1. Copy env example:
   - `/Users/taeksoojung/Desktop/RoutineIQ/apps/api/.env.example` -> `/Users/taeksoojung/Desktop/RoutineIQ/apps/api/.env`
2. Install deps (local machine):
```bash
cd /Users/taeksoojung/Desktop/RoutineIQ/apps/api
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```
3. Health check:
   - `GET http://localhost:8000/health`

Stripe (optional):
- If Stripe env vars are missing, the API still runs; Billing/Checkout/Webhook endpoints return a friendly 503 and the UI shows "Payments Coming Soon".

## Step 4: Frontend (Next.js App Router) (In Progress, Core Screens Done)
Routes implemented:
- `/` Landing
- `/login` Login/Signup + Demo (Guest mode)
- `/app/insights` My Insights
- `/app/daily-flow` Daily Flow
- `/app/reports/[date]` AI Coach Report
- `/app/billing` Plans & Billing
- `/app/preferences` Preferences (CSV export + delete logs/reports)
- `/admin` Admin (requires `profiles.role='admin'`)

Frontend env:
- `/Users/taeksoojung/Desktop/RoutineIQ/apps/web/.env.example` -> `/Users/taeksoojung/Desktop/RoutineIQ/apps/web/.env.local`

Frontend local run (local machine):
```bash
cd /Users/taeksoojung/Desktop/RoutineIQ/apps/web
npm install
npm run dev
```

---

## Next Steps (We Will Implement Next)
1. Demo seed data button (7-day logs + reports for judges)
2. Admin: daily usage/cost aggregates endpoint + UI chart
3. QA checklist + P0/P1 fixes + changelog
4. Deploy guides (Vercel/Render/Supabase/Stripe) + demo video script
5. Public GitHub repo + final README (demo account + test mode Stripe steps)
