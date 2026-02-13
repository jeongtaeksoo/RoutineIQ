# OSS Research - Loop 1 (2026-02-13)

Scope: RoutineIQ commercial hardening with minimal regression risk for F1/F2/F3.

Selection rules applied:
- Excluded candidates with unclear license (`NOASSERTION`) from adoption.
- Excluded dormant candidates (no meaningful maintenance signal in last 6 months).
- Excluded alpha/experimental-only dependencies for core flow.

Scoring model (0-100): license clarity, maintenance velocity (90d commits), release recency, maintainer activity proxy (issue/PR updated days), security signals, stack fit (TS/Python), RoutineIQ product fit.

| GitHub URL | License (SPDX) | Stars | Commits (90d) | Latest Release | Open Issues | Maintainer Responsiveness (days; issue/pr) | TS/Py Support | Security Signal | Fit Score |
|---|---|---:|---:|---|---:|---|---|---|---:|
| https://github.com/getsentry/sentry-python | MIT | 2138 | 235 | 2026-02-04 | 276 | 0 / 0 | Python | SECURITY.md=N, Dependabot=Y | 92 |
| https://github.com/react-hook-form/react-hook-form | MIT | 44518 | 49 | 2026-01-13 | 119 | 1 / 1 | TypeScript | SECURITY.md=Y, Dependabot=N | 89 |
| https://github.com/getsentry/sentry-javascript | MIT | 8581 | 532 | 2026-01-29 | 489 | 0 / 0 | TypeScript | SECURITY.md=N, Dependabot=Y | 89 |
| https://github.com/alisaifee/limits | MIT | 603 | 21 | 2026-02-05 | 3 | 2 / 2 | Python | SECURITY.md=N, Dependabot=Y | 87 |
| https://github.com/pydantic/pydantic | MIT | 26789 | 100 | 2025-11-26 | 547 | 0 / 0 | Python | SECURITY.md=N, Dependabot=Y | 87 |
| https://github.com/colinhacks/zod | MIT | 41834 | 124 | 2026-01-22 | 242 | 0 / 0 | TypeScript | SECURITY.md=N, Dependabot=N | 86 |
| https://github.com/TanStack/query | MIT | 48492 | 109 | 2026-02-11 | 139 | 0 / 0 | TypeScript | SECURITY.md=N, Dependabot=N | 85 |
| https://github.com/jd/tenacity | Apache-2.0 | 8341 | 8 | 2026-02-07 | 129 | 1 / 6 | Python | SECURITY.md=N, Dependabot=Y | 84 |
| https://github.com/open-telemetry/opentelemetry-python | Apache-2.0 | 2318 | 36 | 2025-12-11 | 440 | 0 / 0 | Python | SECURITY.md=N, Dependabot=Y | 80 |
| https://github.com/encode/httpx | BSD-3-Clause | 14988 | 2 | 2024-12-06 | 134 | 0 / 1 | Python | SECURITY.md=N, Dependabot=Y | 63 |
| https://github.com/i18next/next-i18next | MIT | 6124 | 13 | 2025-12-02 | 0 | 57 / 41 | TypeScript | SECURITY.md=N, Dependabot=N | 59 |
| https://github.com/formatjs/formatjs | NOASSERTION | 14679 | 440 | 2026-02-06 | 22 | 0 / 0 | TypeScript | SECURITY.md=N, Dependabot=N | 65 (excluded: license unclear) |

## Shortlist (Top 3, adoptability + risk)
1. `getsentry/sentry-python` - production error visibility with low integration risk.
2. `jd/tenacity` - robust retry for transient OpenAI/API failures in Analyze path.
3. `react-hook-form/react-hook-form` - improve Daily Flow input reliability and completion UX.

## Loop 1 Adoption Decision
- Adopt now: `jd/tenacity`, `getsentry/sentry-python`
- Defer: `react-hook-form/react-hook-form` (requires larger UI refactor; scheduled for next loop)

## Rollback Plan
- `jd/tenacity`: remove dependency + revert retry wrapper in `openai_service.py`.
- `getsentry/sentry-python`: keep package installed but disable via empty `SENTRY_DSN`; full rollback by reverting `main.py` init block.
