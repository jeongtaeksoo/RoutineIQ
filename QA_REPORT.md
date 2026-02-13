# RoutineIQ — Full QA Report

## Update — 2026-02-13 Release Loop

### Gate Snapshot

- `G1 Web`: PASS
  - `npm run lint`
  - `npm run typecheck`
  - `npm run build`
  - `playwright` core flows (`F1/F2/F3`) pass in mock mode
- `G2 API`: PASS (runtime, compile, ruff, format checks on touched files)
  - Python runtime pinned to `3.12` via `apps/api/.python-version`
  - Clean venv setup enforced in verify scripts
- `G3 Live Integration`: PASS
  - `E2E_MODE=live` F2 (`Daily Flow -> Analyze -> Report`) pass
  - usage event row creation verified in live smoke
  - RLS checks verified (own read allowed, cross-user blocked, admin 403 for non-admin)
- `G4 Stripe`: BLOCKED (environment issue)
  - `GET /api/stripe/status` returns `{"enabled": true, "ready": false}` in local smoke
  - root cause: invalid Stripe server key in runtime env; checkout intentionally blocked (`503`) in patched API
  - production-like endpoint without patch still returns checkout `500` on invalid key
- `G5 Observability`: PASS
  - core exceptions logged to `system_errors` (best effort)
  - sensitive values redacted
- `G6 Security`: PASS (code-level)
  - no service role / OpenAI / Stripe secret exposure in `NEXT_PUBLIC_*`
  - billing endpoints now fail closed on invalid Stripe auth
- `G7 Release Docs`: PASS
  - `RELEASE_CHECKLIST.md` added
  - `scripts/release-verify.sh`, `scripts/staging-smoke.sh` added/updated

### New Regression Fixes in This Loop

1. Fixed Playwright/production crash on `/app/daily-flow` by removing `useSearchParams()` dependency that required Suspense wrapping.
2. Enforced Python 3.12 in verification scripts and prevented accidental 3.14 wheel build failures.
3. Added Stripe readiness guard + fail-closed checkout behavior:
   - invalid/missing Stripe server keys no longer trigger unhandled 500 in patched API.
4. Added live smoke diagnostics for clearer Stripe failure reasons.

**Date:** 2026-02-11  
**Build:** ✅ `next build` passed (20/20 pages, 0 errors)  
**Scope:** Frontend (Next.js 14), Backend (FastAPI), Supabase, OpenAI, Stripe

---

## A. System Map

```text
┌─────────────────────── FRONTEND (Next.js 14 App Router) ───────────────────────┐
│                                                                                 │
│  / (Landing)  →  /login (Supabase Auth: email+pw / guest anon)                 │
│                     ↓ session cookie                                            │
│  /app/layout.tsx  →  guard: if !user → redirect("/login")                      │
│     ├── /app/insights      (Dashboard: coach tip, 3-step progress, 7d chart)   │
│     ├── /app/daily-flow    (Log entries, AI Suggest ✨, AI Reflect 🪞)          │
│     ├── /app/reports       (→ redirect /app/reports/{localToday})              │
│     │   └── /app/reports/[date]   (AI Report: peaks, triggers, tomorrow plan)  │
│     ├── /app/billing       (Free/Pro comparison, Stripe checkout)              │
│     └── /app/preferences   (Language, notifications, data privacy)             │
│  /admin                    (Admin dashboard — role="admin" only)               │
│                                                                                 │
│  lib/api-client.ts  →  apiFetch(path)                                          │
│    URL = NEXT_PUBLIC_API_URL + path                                             │
│    Authorization: Bearer {supabase.access_token}                               │
└─────────────────────────────────┬───────────────────────────────────────────────┘
                                  │ HTTPS/JSON
┌─────────────────────── BACKEND (FastAPI :8000) ────────────────────────────────┐
│  security.py → get_auth_context(request)                                       │
│    1. Extract Bearer token                                                     │
│    2. IP rate-limit: 240 req / 60s (in-memory fixed-window)                    │
│    3. Validate via Supabase Auth API (/auth/v1/user) + 30s cache              │
│    4. User rate-limit: 240 req / 60s                                           │
│    5. Return AuthContext {user_id, email, is_anonymous, access_token}          │
│                                                                                │
│  ROUTES:                                                                       │
│  ├─ GET  /logs?date=       → activity_logs (RLS: user_id)                     │
│  ├─ POST /logs             → upsert activity_logs                              │
│  ├─ POST /analyze          → daily cap check → OpenAI → ai_reports            │
│  │                           → usage_events → cleanup_expired_reports          │
│  ├─ GET  /reports?date=    → ai_reports (RLS: user_id)                        │
│  ├─ POST /suggest          → daily cap (30) → OpenAI → usage_events ✅ FIXED  │
│  ├─ POST /reflect          → daily cap (30) → OpenAI → usage_events ✅ FIXED  │
│  ├─ GET  /stripe/status    → {enabled: bool}                                  │
│  ├─ POST /stripe/create-checkout-session → Stripe Checkout                    │
│  └─ POST /stripe/webhook   → subscription upsert/cancel                       │
│                                                                                │
│  SERVICES:                                                                     │
│  openai_service  → POST api.openai.com/v1/responses (json_schema strict)      │
│  plan            → get_subscription_info(), limits, retention days             │
│  usage           → count_daily_calls(), insert_usage_event(), cost calc        │
│  retention       → cleanup stale ai_reports by plan tier                       │
│  stripe_service  → create checkout, upsert/cancel subscription row             │
│  supabase_rest   → Raw REST wrapper (select/upsert/insert/delete)             │
│  supabase_auth   → Validate token via /auth/v1/user + 30s in-memory cache     │
│  error_log       → Best-effort insert into system_errors table                │
└─────────────────────────────────┬───────────────────────────────────────────────┘
                                  │
┌─────────────────────── DATABASE (Supabase/PostgreSQL + RLS) ───────────────────┐
│  activity_logs     (user_id, date, entries JSONB, note)                        │
│  ai_reports        (user_id, date, report JSONB, model)                        │
│  subscriptions     (user_id, plan, status, stripe_*, period_end, cancel_at)   │
│  usage_events      (user_id, event_type, event_date, model, tokens, cost)     │
│  system_errors     (route, message, stack, user_id, meta)                     │
│  profiles          (id=user_id, role, email)                                   │
│  RLS: all tables use user_id = auth.uid() policy                              │
│  Service-role key: used for usage/retention/error tables with fallback        │
└─────────────────────────────────┬───────────────────────────────────────────────┘
                                  │
┌─── EXTERNAL ──────────────────────────────────────────────────────────────────┐
│  OpenAI API  (gpt-4o-mini via Responses API, json_schema strict mode)         │
│  Stripe      (Checkout Sessions, Webhooks: checkout.session.completed,        │
│               customer.subscription.updated/deleted)                          │
└───────────────────────────────────────────────────────────────────────────────┘
```

---

## B. Happy Path (8 Steps)

| Step | User Action | Expected Result | Key Files |
| --- | --- | --- | --- |
| 1 | Visit `localhost:3000` | Landing page renders → "Start" CTA visible | `page.tsx`, `landing-content.tsx` |
| 2 | Login (email+pw or guest) | Redirect to `/app/insights` | `login-client.tsx`, `app/layout.tsx` |
| 3 | Insights loads | Empty state: "No report yet" + "Start in 3 min" CTA | `insights/page.tsx` |
| 4 | Navigate to Daily Flow → pick template | Template entries fill the form (3-6 blocks) | `daily-flow/page.tsx` |
| 5 | Edit entries, set energy/focus → **Save** | Green banner: "Saved! Analyze?" | `POST /logs` |
| 6 | Click **Save & Analyze** | Redirect to `/app/reports/{date}`, AI report displayed | `POST /analyze` → `ai_reports` |
| 7 | Report page → view tomorrow plan, export ICS | `.ics` file downloads | `reports/[date]/page.tsx` |
| 8 | Preferences → change language → save | Full UI language switch (KO↔EN) | `preferences/page.tsx` |

---

## C. QA Findings Backlog

### 🔴 P0 — Critical

#### P0-1: `/suggest` and `/reflect` have no daily cap or cost tracking → unbounded OpenAI costs

| Field | Detail |
| --- | --- |
| **Reproduce** | Click ✨ Suggest Activity 100 times in succession |
| **Root Cause** | `suggest.py` and `reflect.py` called OpenAI without `count_daily_analyze_calls()` or `insert_usage_event()` |
| **Impact** | Free users can trigger unlimited OpenAI API calls; no cost visibility in `usage_events` |
| **Fix** | Added daily cap (30 calls/day) + `insert_usage_event()` + `estimate_cost_usd()` to both endpoints |
| **Status** | ✅ **PATCHED** — `suggest.py`, `reflect.py` rewritten |
| **Verify** | Call `/suggest` 31 times → 31st returns 429 "limit reached"; check `usage_events` table has rows with `meta.endpoint = "suggest"` |

---

### 🟡 P1 — High

#### P1-1: Reports index uses UTC date → wrong day for KST users near midnight

| Field | Detail |
| --- | --- |
| **Reproduce** | Visit `/app/reports` between KST 00:00–08:59 |
| **Root Cause** | `reports/page.tsx:4`: `new Date().toISOString().slice(0,10)` returns UTC date |
| **Impact** | Redirects to yesterday's report; user sees "No report" even though they analyzed today |
| **Fix** | Replaced with `localYYYYMMDD()` (same helper as daily-flow/insights) |
| **Status** | ✅ **PATCHED** — `reports/page.tsx` rewritten |
| **Verify** | At KST 00:30, visit `/app/reports` → verify URL shows today's local date |

#### P1-2: AI error handling uses `alert()` → poor mobile UX

| Field | Detail |
| --- | --- |
| **Reproduce** | Disconnect network → click Suggest Activity → native browser popup appears |
| **Root Cause** | `daily-flow/page.tsx:432,450`: `alert(t.error_try_again)` instead of `setError()` |
| **Impact** | Inconsistent with the rest of the page (red banner); `alert()` blocks the UI thread on mobile |
| **Fix** | Changed both to `setError(t.error_try_again)` — uses the existing red error banner |
| **Status** | ✅ **PATCHED** |
| **Verify** | Block API → click Suggest → red banner appears (not browser popup) |

#### P1-3: `useYesterday()` contains no-op `setDate(date)` call

| Field | Detail |
| --- | --- |
| **Reproduce** | Code inspection at `daily-flow/page.tsx:317` |
| **Root Cause** | `setDate(date)` sets state to its current value — React skips re-render |
| **Impact** | No user-visible bug, but misleading code suggesting date should change |
| **Fix** | Removed the line + added comment explaining intent |
| **Status** | ✅ **PATCHED** |

---

### 🔵 P2 — Low

#### P2-1: Login Suspense fallback hardcoded Korean ("로딩 중…")

| Field | Detail |
| --- | --- |
| **Root Cause** | `login/page.tsx:10` — Korean-only fallback text |
| **Fix** | Changed to language-neutral `···` |
| **Status** | ✅ **PATCHED** |

#### P2-2: Default locale inconsistency between `normalizeLocale()` and app-shell

| Field | Detail |
| --- | --- |
| **Detail** | `normalizeLocale()` defaults to `"en"`, but `app-shell.tsx:76` and layout default to `"ko"` |
| **Impact** | Cosmetic: in practice the shell overrides work, but the function contract is misleading |
| **Status** | 📋 Documented — no patch needed (functional behavior is correct for Korean-primary product) |

#### P2-3: Preview reports have no "preview" watermark  

| Field | Detail |
| --- | --- |
| **Detail** | `reports/[date]/page.tsx` shows `PREVIEW_REPORT_EN/KO` data without visual distinction |
| **Impact** | New users may confuse preview data with their actual report |
| **Status** | 📋 Documented — recommend adding a subtle "Preview" badge in a future iteration |

---

### Negative Test Cases

| # | Scenario | Expected | Verified |
| --- | --- | --- | --- |
| N1 | Token expired → any API call | 401 from `security.py` → frontend redirects to `/login` | ✅ Code path confirmed |
| N2 | Network failure → Save button | `setError()` shows red banner with error message + hint | ✅ Code path confirmed |
| N3 | Empty data (0 entries, no note) → Save | Validation: "Add at least one entry or a note" → save blocked | ✅ `daily-flow/page.tsx:375` |
| N4 | Overlapping time entries → Save | Validation error shown in red banner | ✅ `validateEntries()` function |
| N5 | Free user exceeds analyze limit | 429 from `/analyze` with "daily limit reached" message | ✅ `analyze.py` checks `count_daily_analyze_calls()` |

---

## D. Patch Set Summary

| # | Priority | Files Changed | Description |
| --- | --- | --- | --- |
| 1 | P0-1 | `suggest.py` (rewrite) | Added daily cap (30/day), usage tracking, cost calculation |
| 2 | P0-1 | `reflect.py` (rewrite) | Added daily cap (30/day), usage tracking, cost calculation |
| 3 | P1-1 | `reports/page.tsx` (rewrite) | UTC→local date fix |
| 4 | P1-2 | `daily-flow/page.tsx` (2 lines) | `alert()` → `setError()` |
| 5 | P1-3 | `daily-flow/page.tsx` (1 line) | Removed no-op `setDate(date)` |
| 6 | P2-1 | `login/page.tsx` (1 line) | Korean→neutral loading fallback |

---

## E. UX/UI Audit

### E1. Information Architecture (IA)

```text
AppShell nav (sidebar desktop / bottom-tab mobile):
  [Insights] → [Daily Flow] → [Reports] → [Billing] → [Preferences]
```

**Assessment:** ✅ Good — 5 items, clear hierarchy. The Happy Path naturally flows left→right.

**One issue:** "Insights" is the landing page but its name is vague. Users might not know it's the "home" page. Consider renaming to "Home" / "홈" or adding a home icon.

### E2. CTA Priority

| Page | Primary CTA | Secondary CTA | Notes |
| --- | --- | --- | --- |
| Insights (no log) | "Start in 3 min" ✨ | "Open today log" | ✅ Clear hierarchy |
| Insights (has log, no report) | "Analyze my day" ✨ | "Open today log" | ✅ Good |
| Insights (has report) | "View tomorrow plan" | "Open report" | ✅ Good |
| Daily Flow | "Save & Analyze" | "Save" | ✅ Good — primary is larger/branded |
| Reports | "Export Calendar (.ics)" | Date nav arrows | ✅ Good |
| Billing (free) | "Start Pro" | — | ✅ Clear |

### E3. 3-State Coverage (Loading / Empty / Error)

| Page | Loading | Empty | Error |
| --- | --- | --- | --- |
| Daily Flow | ✅ `if (loading)` skeleton | ✅ Template picker | ✅ Red banner |
| Insights | ✅ "Loading…" text | ✅ Empty state cards | ✅ Red banner (whitespace-pre-line) |
| Reports/[date] | ✅ "잠시만요…" text | ✅ Preview report | ✅ Red banner |
| Billing | ✅ "Checking billing setup…" button | ✅ "Payments coming soon" | ✅ Red text |
| Preferences | ⚠️ No loading state for user meta fetch | ✅ Default values | ⚠️ Generic `catch` |

### E4. Copy & Labels

**Bilingual consistency:**

- ✅ All pages use locale-aware `t` objects
- ✅ `isKo` conditional used consistently
- ⚠️ `"AI Thought:"` prefix in suggest result is English-only (line 429 daily-flow)  
  → Should be `isKo ? "AI 생각:" : "AI Thought:"`
- ⚠️ `"AI Reflection Question:"` prefix is English-only (line 447)
  → Should be `isKo ? "AI 성찰 질문:" : "AI Reflection Question:"`

### E5. Accessibility

- ✅ All interactive buttons have `title` attributes
- ✅ Form inputs have `<Label>` associations
- ✅ Color contrast: warm palette (hsl 30-35) on light background — passes WCAG AA
- ⚠️ Bottom nav icons on mobile lack `aria-label` (screen readers see just the short text)
- ⚠️ No `aria-live` region for error banners — screen readers may miss dynamic errors

### E6. Design Tokens & Color Rules

**Current palette (from `globals.css :root`):**

| Token | HSL | Usage |
| --- | --- | --- |
| `--bg` | `35 30% 96%` | Page background |
| `--fg` | `30 25% 18%` | Primary text |
| `--card` | `35 25% 99%` | Card surfaces |
| `--muted` | `33 18% 91%` | Muted backgrounds |
| `--muted-fg` | `30 12% 42%` | Secondary text |
| `--border` | `33 18% 82%` | All borders |
| `--ring` | `30 45% 50%` | Focus rings |
| `--brand` | `30 40% 38%` | Primary action color |
| `--brand-fg` | `40 30% 98%` | Text on brand bg |

**Typography:**

- Sans: `Space Grotesk` (--font-sans)
- Serif: `Fraunces` (--font-serif, used for titles via `.title-serif`)
- Body: 14px (text-sm default), headings: 1.875rem-2rem

**Button hierarchy:**

- **Primary:** `<Button>` — branded fill, white text
- **Secondary:** `<Button variant="secondary">` — muted fill
- **Outline:** `<Button variant="outline">` — border only
- **Destructive:** `<Button variant="destructive">` — red tones

**Recommended design rules (for consistency):**

1. **Headlines** → always `.title-serif` (Fraunces)
2. **Body text** → Space Grotesk 14px (text-sm)
3. **Muted labels** → `text-mutedFg text-xs`
4. **Cards** → `rounded-2xl border bg-white/60 p-4 shadow-soft`
5. **Error text** → `text-red-700 text-sm` (not red-500 — warm palette needs depth)
6. **Success text** → `text-emerald-700`
7. **Transitions** → `cubic-bezier(0.16, 1, 0.3, 1)` (spring ease — used throughout)
8. **Spacing** → multiples of 4px (gap-1=4px, gap-2=8px, gap-4=16px)

---

## F. Verification Checklist

### Manual Test Checklist (Post-Patch)

| # | Test | Steps | Expected | Pass? |
| --- | --- | --- | --- | --- |
| 1 | Fresh login flow | Open `/` → click Start → login with email | Redirect to `/app/insights` | ☐ |
| 2 | Guest login | Login page → "Try as Guest" | Redirect to `/app/insights`, anonymous session | ☐ |
| 3 | Daily Flow save | Pick template → edit → Save | Green banner "Saved!" | ☐ |
| 4 | Save & Analyze | Save → Analyze → redirect | `/app/reports/{today}` shows report | ☐ |
| 5 | AI Suggest (happy) | Click ✨ icon → wait | Activity field fills, note gets "AI Thought" | ☐ |
| 6 | AI Suggest (error) | Disconnect API → click ✨ | Red banner (NOT alert popup) | ☐ |
| 7 | AI Suggest (limit) | Call 31 times in one day | 31st shows 429 error in banner | ☐ |
| 8 | AI Reflect (happy) | Click "Reflect on Day" → wait | Note gets reflection question | ☐ |
| 9 | AI Reflect (error) | Disconnect API → click Reflect | Red banner (NOT alert popup) | ☐ |
| 10 | Reports redirect | Visit `/app/reports` at KST midnight | URL shows today's local date | ☐ |
| 11 | Language switch | Preferences → change KO→EN → save | All UI switches to English | ☐ |
| 12 | ICS export | Report page → Export Calendar | `.ics` file downloads, opens in calendar | ☐ |
| 13 | Copy yesterday | Daily Flow → "Copy yesterday" | Yesterday entries load, date stays today | ☐ |
| 14 | Billing (free) | Billing page → "Start Pro" | Stripe checkout redirects (or "coming soon") | ☐ |
| 15 | Token expiry | Wait for token expiry → any action | 401 → redirect to login | ☐ |

### Automated Test Suggestions

```text
Backend (pytest + httpx):
  test_suggest_daily_limit        → Call /suggest 31x → assert 429 on 31st
  test_suggest_usage_tracking     → Call /suggest → assert usage_events row exists
  test_reflect_daily_limit        → Call /reflect 31x → assert 429 on 31st
  test_reports_date_format        → Verify local date format in redirect

Frontend (Playwright e2e):
  test_suggest_error_shows_banner → Mock API failure → assert no alert(), banner visible
  test_reflect_error_shows_banner → Mock API failure → assert no alert(), banner visible
  test_language_switch            → Change lang → assert all CTA text matches locale
```

---

## Summary of Changes Made

| File | Change |
| --- | --- |
| `apps/api/app/routes/suggest.py` | 🔴 P0: Rewritten — daily cap (30), usage tracking, cost calc, error logging |
| `apps/api/app/routes/reflect.py` | 🔴 P0: Rewritten — daily cap (30), usage tracking, cost calc, error logging |
| `apps/web/src/app/app/reports/page.tsx` | 🟡 P1: UTC→local date redirect fix |
| `apps/web/src/app/app/daily-flow/page.tsx` | 🟡 P1: `alert()`→`setError()` (2 locations), removed no-op `setDate(date)` |
| `apps/web/src/app/login/page.tsx` | 🔵 P2: Korean→neutral loading fallback |

**Build status:** ✅ Passed (20/20 pages, 0 errors, exit code 0)
