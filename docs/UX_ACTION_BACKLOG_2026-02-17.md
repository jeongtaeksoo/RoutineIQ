# UX Action Backlog (2026-02-17)

- Scope: RutineIQ UI/UX improvements for KR/JP/US
- Ordering: RICE descending

| Type | Item | Problem | KPI | Evidence Claim | Claim Status | RICE |
|---|---|---|---|---|---|---:|
| Add | 3-minute progressive onboarding (step-wise profile collection) | Early friction from long first-session forms | Onboarding completion, D1 activation | UX-C01 | Confirmed (6/5) | 9.2 |
| Modify | Cohort card confidence line (n/window/compare basis) fixed placement | Sample context is missed and rank is over-interpreted | Misread rate, trust, return rate | UX-C04 | Confirmed (6/5) | 9.0 |
| Modify | Report first fold: 3 key metrics + next 1 action | Information density overwhelms users | Report dwell quality, next-day action rate | UX-C03 | Confirmed (6/5) | 8.9 |
| Modify | Diary->structured output with inline edit + one-tap retry | Users need immediate correction path when AI parse is off | Diary completion, correction success rate | UX-C02 | Confirmed (6/5) | 8.8 |
| Add | AI trust badge with conservative language policy | Users over-trust or under-trust without reliability framing | Trust score, advice-follow rate | UX-C06 | Confirmed (9/5) | 8.7 |
| Add | Re-engagement loop (missed-day recovery card + one-tap restart) | Behavior gains decay without guided re-entry | D7/D30 retention, streak recovery | UX-C08 | Confirmed (10/5) | 8.6 |
| Modify | Mobile quick-entry chips + one-thumb nav priority | Typing burden slows daily logging | Daily log completion, time-to-log | UX-C05 | Confirmed (6/5) | 8.5 |
| Add | "Why this insight" expandable rationale on each insight card | Opaque insight origin lowers trust and actionability | Insight click-through, trust score | UX-C02 | Confirmed (6/5) | 8.2 |
| Modify | Locale-specific copy templates for KR/JP/US (tone + detail depth) | Uniform wording underperforms across markets | Card CTR, completion, conversion | UX-C07 | Confirmed (11/5) | 8.1 |
| Delete | Preview-state absolute rank exposure | Low-sample rank causes overconfidence and churn | Complaint rate, card bounce | UX-C04 | Confirmed (6/5) | 7.4 |

## Immediate Top 10

1. 3-minute progressive onboarding (step-wise profile collection) (Add, UX-C01)
2. Cohort card confidence line (n/window/compare basis) fixed placement (Modify, UX-C04)
3. Report first fold: 3 key metrics + next 1 action (Modify, UX-C03)
4. Diary->structured output with inline edit + one-tap retry (Modify, UX-C02)
5. AI trust badge with conservative language policy (Add, UX-C06)
6. Re-engagement loop (missed-day recovery card + one-tap restart) (Add, UX-C08)
7. Mobile quick-entry chips + one-thumb nav priority (Modify, UX-C05)
8. "Why this insight" expandable rationale on each insight card (Add, UX-C02)
9. Locale-specific copy templates for KR/JP/US (tone + detail depth) (Modify, UX-C07)
10. Preview-state absolute rank exposure (Delete, UX-C04)

## Rollback Triggers

- Onboarding completion drops >=10%: rollback to previous first-session flow.
- Insight click-through drops >=8% after density changes: restore prior card density.
- Cohort-card misread complaints increase >=15%: hide rank in medium confidence too.
- Locale branch maintenance delay >7 days: temporary fallback to neutral global copy.

