## RutineIQ DB Design (Supabase Postgres + RLS)

### Principles
- **Default deny**: RLS enabled on all tables; no access unless a policy explicitly allows it.
- **Owner CRUD**: normal users can CRUD only their own rows (`user_id = auth.uid()`).
- **Admin read**: admin can read across users (`profiles.role='admin'`), but destructive operations remain server-only.
- **Server-only operations**: Stripe webhook updates, cross-user admin aggregates, retention cleanup.

### Core Tables (Required)

#### 1) `profiles`
Purpose: app profile + role (admin gate).

Key columns:
- `id uuid pk` references `auth.users(id)` on delete cascade
- `email text` (optional denormalization for admin listing; source of truth is auth)
- `role text` enum-like (`'user' | 'admin'`), default `'user'`
- `created_at timestamptz default now()`

Notes:
- Create a trigger on `auth.users` insert to auto-create `profiles` row.
- RLS:
  - user: can select/update own row (but not `role`)
  - admin: can select all

#### 2) `activity_logs`
Purpose: store Daily Flow per day.

Recommended shape:
- `id uuid pk default gen_random_uuid()`
- `user_id uuid not null` references `profiles(id)` on delete cascade
- `date date not null`
- `entries jsonb not null default '[]'::jsonb`
- `note text null` (optional free text; keep short)
- `created_at timestamptz default now()`
- `updated_at timestamptz default now()`

Constraints:
- unique `(user_id, date)` (one row per day)

Indexes:
- `(user_id, date desc)`

RLS:
- user: select/insert/update/delete where `user_id = auth.uid()`
- admin: select all (optional; admin views mostly via backend anyway)

#### 3) `ai_reports`
Purpose: store OpenAI report output for a specific date.

Columns:
- `id uuid pk default gen_random_uuid()`
- `user_id uuid not null` references `profiles(id)` on delete cascade
- `date date not null`
- `report jsonb not null` (must match fixed schema; validated server-side)
- `schema_version int not null default 1` (legacy default; API persists v2 reports)
- `model text null`
- `created_at timestamptz default now()`
- `updated_at timestamptz default now()`

Constraints:
- unique `(user_id, date)`

Indexes:
- `(user_id, date desc)`

RLS:
- user: select own rows
- insert/update: allowed only if `user_id = auth.uid()` (API writes using user JWT so RLS applies)
- admin: select all

#### 4) `subscriptions`
Purpose: persist Stripe subscription state.

Columns:
- `user_id uuid pk` references `profiles(id)` on delete cascade
- `stripe_customer_id text unique`
- `stripe_subscription_id text unique`
- `status text not null` (e.g. `active`, `trialing`, `past_due`, `canceled`, ...)
- `plan text not null` (`free` or `pro`)
- `current_period_end timestamptz null`
- `cancel_at_period_end boolean not null default false`
- `created_at timestamptz default now()`
- `updated_at timestamptz default now()`

RLS:
- user: can select own row (read-only from client perspective)
- insert/update: server-only (service role)
- admin: select all

#### 5) `usage_events`
Purpose: audit usage + enforce rate limits + cost estimation.

Columns:
- `id uuid pk default gen_random_uuid()`
- `user_id uuid not null` references `profiles(id)` on delete cascade
- `event_type text not null` (MVP: `'analyze'`)
- `event_date date not null` (date of the call, in server UTC by default)
- `model text null`
- `tokens_prompt int null`
- `tokens_completion int null`
- `tokens_total int null`
- `cost_usd numeric(10,6) null`
- `meta jsonb not null default '{}'::jsonb`
- `created_at timestamptz default now()`

Indexes:
- `(user_id, event_date, event_type)`
- `(created_at desc)`

RLS:
- user: select own rows (optional), insert own rows
- admin: select all

#### 6) `system_errors`
Purpose: server error log for admin debugging. Keep PII minimal.

Columns:
- `id uuid pk default gen_random_uuid()`
- `route text not null`
- `message text not null`
- `stack text null`
- `user_id uuid null` references `profiles(id)` on delete set null
- `meta jsonb not null default '{}'::jsonb`
- `created_at timestamptz default now()`

Indexes:
- `(created_at desc)`
- `(route)`

RLS:
- user: no access
- admin: select all
- inserts: server-only (service role)

### Fixed OpenAI Report Schema (Single Source of Truth)
Stored in `ai_reports.report` and returned to the frontend.

```json
{
  "schema_version": 2,
  "summary": "string",
  "productivity_peaks": [
    { "start": "HH:MM", "end": "HH:MM", "reason": "string" }
  ],
  "failure_patterns": [
    { "pattern": "string", "trigger": "string", "fix": "string" }
  ],
  "tomorrow_routine": [
    { "start": "HH:MM", "end": "HH:MM", "activity": "string", "goal": "string" }
  ],
  "if_then_rules": [
    { "if": "string", "then": "string" }
  ],
  "coach_one_liner": "string",
  "yesterday_plan_vs_actual": {
    "comparison_note": "string",
    "top_deviation": "string"
  },
  "wellbeing_insight": {
    "burnout_risk": "low|medium|high",
    "energy_curve_forecast": "string",
    "note": "string"
  },
  "micro_advice": [
    {
      "action": "string",
      "when": "string",
      "reason": "string",
      "duration_min": 1
    }
  ],
  "weekly_pattern_insight": "string",
  "analysis_meta": {
    "input_quality_score": 0,
    "profile_coverage_pct": 0,
    "wellbeing_signals_count": 0,
    "logged_entry_count": 0,
    "schema_retry_count": 0,
    "personalization_tier": "low|medium|high"
  }
}
```

Validation rules (server):
- Always present all keys, even if data is insufficient.
- If insufficient data, fill `reason/fix/...` with explicit "need more input" strings.
- `analysis_meta` is optional for backward compatibility with legacy reports.
