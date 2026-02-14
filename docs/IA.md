## RutineIQ IA (Information Architecture) + UX Constraints

### App Navigation (Must Match Labels)
- **My Insights** (Dashboard)
- **Daily Flow** (Input)
- **AI Coach Report** (Date-based report)
- **Plans & Billing** (Subscription)
- **Preferences** (Settings)

### Routes (Proposed)
- Public:
  - `/` Landing + Login/Signup + "Try Demo" (anonymous)
- App (authenticated):
  - `/app` -> redirect to `/app/insights`
  - `/app/insights` My Insights
  - `/app/daily-flow` Daily Flow
  - `/app/reports` AI Coach Report (date picker -> `/app/reports/YYYY-MM-DD`)
  - `/app/reports/[date]` AI Coach Report (fixed sections)
  - `/app/billing` Plans & Billing
  - `/app/preferences` Preferences
- Admin:
  - `/admin` Admin dashboard (requires `profiles.role='admin'` AND backend verification)

### Responsive Layout Rules
- Desktop:
  - Left sidebar navigation + main content
- Mobile:
  - Bottom tab navigation:
    - Insights / Daily Flow / Reports / Billing / Settings

### Time-to-Value (First Screen)
On first arrival to `/app/insights`, show immediate AI value:
- Tomorrow's Smart Schedule (card)
- Coach Tip of the Day (card)
- Consistency Score (card)

If no report exists for today:
- Show an obvious CTA: `Analyze Today` (calls `/api/analyze` for selected date)
- Show lightweight placeholder copy explaining what will appear after analyze

### My Insights Cards (Fixed)
Cards shown on `/app/insights`:
- Peak Performance Hours
- Focus Break Triggers
- Tomorrow's Smart Schedule
- Consistency Score
- Coach Tip of the Day

### AI Coach Report Sections (Fixed)
Sections shown on `/app/reports/[date]`:
- Your Day in Review
- Your Power Hours
- What Broke Your Focus
- Your Optimized Day Plan
- Smart Recovery Rules

### Daily Flow Input UX (1-minute entry)
Requirements:
- Templates / Duplicate / Autofill recent values
- Designed for fast, low-friction entry (mobile-first)

Proposed input model (MVP-friendly):
- Date selector (defaults to today)
- Timeline blocks (add/edit):
  - Start time, End time
  - Activity label
  - Energy (1-5) optional
  - Focus (1-5) optional
  - Note (short)
- Quick actions:
  - `Use Yesterday` (copy yesterday's blocks)
  - `Apply Template` (Morning routine, Deep work day, etc.)
  - `Autofill Recent` (suggest last-used activity labels)

### Demo Mode (Judging)
We will implement **Guest/Demo** option to minimize friction:
- "Try Demo" -> Supabase anonymous sign-in (if enabled)
- Inside app:
  - `Generate 7-Day Seed Data` button:
    - Creates 7 days of `activity_logs`
    - Generates 7 days of `ai_reports` (either via AI or precomputed reports matching schema)

### Privacy UX (Must Surface in UI)
- On onboarding or Preferences:
  - "Data use" disclosure:
    - "Used only to optimize your personal routine. Not sold or used for ads."
- Preferences:
  - Export (CSV) and/or Delete data (MVP: delete all user data)

### Admin Page (Must Exist)
Route: `/admin`

Features:
- User list (email, signup date, plan, last analyze date)
- User detail:
  - Last 7 days log count
  - Analyze call count
  - Latest report
- Force sync Stripe subscription status (re-fetch from Stripe)
- Daily AI calls + approx cost (from `usage_events`)
- System errors (last 50 rows)
