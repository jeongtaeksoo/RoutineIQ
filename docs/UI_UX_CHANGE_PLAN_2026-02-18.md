# RutineIQ UI/UX Improvement Plan

SoT: `docs/UI_STRUCTURE_AUDIT_CODE_FACT_2026-02-18.md`
Scope: ① Structure / Component boundaries ② Layout metrics ③ UX Writing (copy simplification)
Scope lock: No new features, no backend changes, no routing redesign.

---

## User Review Required

> [!IMPORTANT]
> **Korean copy changes**: All UX writing simplifications in PR1 are Korean-first (most users are Korean-speaking). English equivalents are updated to match the tone. Please review the [Copy Change Map](#pr1-copy-change-map-summary) below — native-speaker review is the single highest-value check for this PR.

> [!WARNING]
> **Insights page (1575 lines) and Daily Flow page (1181 lines)** are high-risk single-file monoliths (per SoT §8). PR4's component extraction is intentionally minimal to avoid large-blast-radius refactor, but please confirm this minimal-scope approach is acceptable vs. a deeper split.

---

## PR Strategy (4 PRs, smallest risk first)

| PR | Scope | Files touched (est.) | Risk | Revertable |
|---|---|---|---|---|
| **PR1** | Strings consolidation + copy simplification | `i18n.ts`, `insights/page.tsx`, `daily-flow/page.tsx`, `reports/[date]/page.tsx`, `app-shell.tsx`, `login-client.tsx` | Low | ✅ Standalone |
| **PR2** | Layout tokens + dead CSS removal | `globals.css`, `tailwind.config.ts` | Low | ✅ Standalone |
| **PR3** | Screen-level layout metric fixes | `insights/page.tsx`, `daily-flow/page.tsx`, `reports/[date]/page.tsx`, `app-shell.tsx` | Medium | ✅ per-file revert |
| **PR4** | Shared utility extraction (component boundaries) | New `lib/report-utils.ts`, `lib/date-utils.ts`; updates to the 3 page files | Medium | ✅ Standalone |

---

## PR1: Strings Consolidation + Copy Simplification

### Proposed Changes

#### [MODIFY] [i18n.ts](file:///Users/taeksoojung/Desktop/RutineIQ/apps/web/src/lib/i18n.ts)

Extend the `Strings` type and all locale objects (EN, KO, JA, ZH, ES) with **page-level keys**. Currently `i18n.ts` only has ~30 nav/reminder keys. We will add keys for:

- Insights page: ~80 keys (currently inline in `insights/page.tsx` L250–478)
- Daily Flow page: ~50 keys (currently inline in `daily-flow/page.tsx` L290–414)
- Reports page: ~70 keys (currently inline in `reports/[date]/page.tsx` L233–381)
- Login/Landing: ~10 keys for remaining scattered `isKo ?` strings

**Approach**: Move the existing `t = React.useMemo(...)` string objects from each page into `i18n.ts`, keeping the same key names. Pages will consume them via `getStrings(locale).insights_title` etc. (function calls in existing `t` strings will become standalone helper functions accepting locale.)

> [!NOTE]
> This does NOT change any i18n architecture (no new library). It consolidates what already exists into the single `i18n.ts` file. JA/ZH/ES translations will initially duplicate EN values — only KO strings are simplified.

#### [MODIFY] [insights/page.tsx](file:///Users/taeksoojung/Desktop/RutineIQ/apps/web/src/app/app/insights/page.tsx)

- Remove the large `t = React.useMemo(...)` block (L250–478) and replace with `const t = getStrings(locale)`
- Fix 3 remaining loose `isKo ?` strings at L207, L211, L224 (move to `normalizeReport` fallback keys in i18n)

#### [MODIFY] [daily-flow/page.tsx](file:///Users/taeksoojung/Desktop/RutineIQ/apps/web/src/app/app/daily-flow/page.tsx)

- Remove the large `t = React.useMemo(...)` block (L290–414) and replace with `const t = getStrings(locale)`
- Fix 2 remaining loose `isKo ?` strings at L281 (moodLabel), L648 (displayEvidence)

#### [MODIFY] [reports/[date]/page.tsx](file:///Users/taeksoojung/Desktop/RutineIQ/apps/web/src/app/app/reports/%5Bdate%5D/page.tsx)

- Remove the large `t = React.useMemo(...)` block (L233–381) and replace with `const t = getStrings(locale)`
- Fix loose `isKo ?` strings at L394–404 (burnoutRiskLabel) — move to `t.burnoutHigh / t.burnoutLow / t.burnoutMedium`

### PR1 Copy Change Map Summary

Key Korean copy simplifications (full map in separate `COPY_CHANGE_MAP_2026-02-18.md`):

| Screen | Key | Before (KO) | After (KO) | Reason |
|---|---|---|---|---|
| Insights | `subtitle` | 기록하고, 돌아보고, 내일을 준비합니다. 오늘 챙겨야 할 하나만 확인하세요. | 하루를 기록하고 내일을 준비해요. | 30자 초과 → 15자 |
| Insights | `coachEmptyBody_noLog` | 먼저 Daily Flow를 기록하면, 오늘의 한 마디가 생성됩니다. | 오늘 기록을 남기면 코칭이 생성돼요. | "Daily Flow" 외래어→일반 용어 |
| Insights | `coachEmptyBody_hasLog` | 기록은 완료됐어요. AI로 정리하면 오늘의 한 마디가 바로 생성됩니다. | 기록 완료! '정리하기'를 누르면 코칭이 나와요. | 행동 유도 명확화 |
| Insights | `nextDesc_noLog` | 아직 기록이 없네요. 일기를 3줄만 적어도 첫 분석을 시작할 수 있어요. | 기록이 없어요. 3줄만 적으면 분석을 시작할 수 있어요. | 비난 톤 제거 |
| Insights | `lowSignalHint` | 신호가 부족해 제안 확신도가 낮습니다. 내일 첫 2개 블록은 에너지/집중(1-5)을 꼭 남겨주세요. | 데이터가 부족해 정확도가 낮아요. 내일 활동 2개에 에너지·집중 점수를 남겨주세요. | "신호"→"데이터", "확신도"→"정확도" |
| Insights | `trustBadgeBody` | 이 분석은 기록된 데이터 기반의 추정이며, 전문 진단이 아닙니다. 기록이 쌓일수록 정확도가 높아집니다. | 기록 기반 추정이에요. 전문 진단은 아니며, 기록이 쌓일수록 더 정확해져요. | 30자 규칙+격식→대화체 |
| Daily Flow | `subtitle` | 자유 일기를 쓰면 AI가 활동 블록으로 정리해줘요 | 하루를 자유롭게 적으면 AI가 정리해요 | 간결화 |
| Daily Flow | `writeHint` | 시간, 활동, 기분을 포함하면 더 정확한 분석이 가능해요 | 시간·활동·기분을 적으면 분석이 정확해져요 | 간결화 |
| Daily Flow | `issueBannerTitle` | 확인하면 더 정확해져요. | 한번 확인하면 정확도가 올라가요 | 자연스러운 톤 |
| Report | `subtitle` | 오늘 하루를 돌아보고, 내일은 조금 더 편안하게 흘러가도록 돕습니다. | 오늘을 돌아보고 내일을 준비해요. | 30자 초과→15자 |
| Report | `noReportDesc` | 기록을 바탕으로 오늘의 흐름을 요약하고, 내일 챙겨야 할 것들을 정리해드립니다. | 오늘 기록으로 내일 계획을 만들어 드려요. | 30자 규칙 |
| Report | `lowSignalWarning` | 신호가 부족해 분석 확신도가 낮습니다. 다음 기록에서 에너지/집중(1-5)을 최소 2개 블록에 입력해 주세요. | 데이터가 부족해 정확도가 낮아요. 다음에 활동 2개에 에너지·집중 점수를 남겨주세요. | 전문용어 제거 |

> [!TIP]
> 전체 치환표는 `COPY_CHANGE_MAP_2026-02-18.md`로 별도 생성합니다. 위는 대표 항목입니다.

### PR1 Risks

- **Regression**: String key mismatch → e2e heading regex (`/나의 하루|My Insights/i`) may break if title changes
  - Mitigation: Keep heading text unchanged or update e2e selectors in same PR
- **Layout shift**: Korean string length changes → potential overflow
  - Mitigation: All new strings are ≤30 chars (shorter than originals)

---

## PR2: Layout Tokens + Dead CSS Cleanup

### Proposed Changes

#### [MODIFY] [globals.css](file:///Users/taeksoojung/Desktop/RutineIQ/apps/web/src/app/globals.css)

```diff
 :root {
   /* ─── Warm palette (existing) ─── */
   ...
+  /* ─── Spacing tokens ─── */
+  --space-xs: 4px;
+  --space-sm: 8px;
+  --space-md: 16px;
+  --space-lg: 24px;
+  --space-xl: 32px;
+  --space-2xl: 48px;
+  --space-3xl: 64px;
+  --space-bottom-nav: 68px;
+  --space-bottom-safe: 96px;   /* pb-24 = 96px for mobile */
+
+  /* ─── Layout tokens ─── */
+  --sidebar-width: 288px;       /* w-72 */
+  --content-max-narrow: 768px;  /* max-w-3xl */
+  --content-max-wide: 1152px;   /* max-w-6xl */
+  --header-nav-height: 56px;
+  --bottom-nav-height: 68px;
+
+  /* ─── Typography sizes ─── */
+  --text-card-label: 11px;
+  --text-caption: 12px;
+  --text-body: 14px;
 }
```

- Remove `.sticky-actions` class (confirmed unused per SoT §8: "정의만, 사용처 없음")
- Remove corresponding `@media (min-width: 768px) { .sticky-actions { ... } }`

#### [MODIFY] [tailwind.config.ts](file:///Users/taeksoojung/Desktop/RutineIQ/apps/web/tailwind.config.ts)

```diff
 theme: {
   extend: {
+    spacing: {
+      'bottom-nav': 'var(--bottom-nav-height)',
+      'bottom-safe': 'var(--space-bottom-safe)',
+    },
     ...
   }
 }
```

### PR2 Layout Metrics (Before/After)

Since this PR only introduces tokens (no value changes), all current metrics remain identical:

| Token | Value | Source |
|---|---|---|
| `--sidebar-width` | 288px | `app-shell.tsx` w-72 |
| `--content-max-narrow` | 768px | `daily-flow/page.tsx` max-w-3xl |
| `--content-max-wide` | 1152px | `insights/page.tsx`, `reports/page.tsx` max-w-6xl |
| `--bottom-nav-height` | 68px | `app-shell.tsx` min-height:68px |
| `--space-bottom-safe` | 96px | `app-shell.tsx`, `daily-flow/page.tsx` pb-24 |

### PR2 Risks

- **Regression**: Token introduction only — no values change. Dead CSS removal confirmed safe per SoT.
- **Rollback**: Revert entire PR; tokens are CSS-only with no JS dependency.

---

## PR3: Screen-Level Layout Metric Fixes

### Measurement Viewports

| Device | Width | Height | Source |
|---|---|---|---|
| Mobile Web | 390px | 844px | iPhone 14 Pro equivalent |
| Tablet | 768px | 1024px | iPad mini equivalent |
| Desktop | 1440px | 900px | Standard laptop |

### Proposed Changes

#### [MODIFY] [app-shell.tsx](file:///Users/taeksoojung/Desktop/RutineIQ/apps/web/src/components/app-shell.tsx)

| Property | Before | After | Reason |
|---|---|---|---|
| Mobile bottom padding | `pb-24` (96px) | `pb-[calc(var(--bottom-nav-height)+env(safe-area-inset-bottom)+16px)]` | Safe-area aware, consistent token reference |
| Desktop bottom padding | `md:pb-6` (24px) | `md:pb-6` (no change) | Already appropriate |
| Main content padding | `px-5 py-6` (20/24) | `px-5 py-6` (no change) | Already appropriate |

#### [MODIFY] [insights/page.tsx](file:///Users/taeksoojung/Desktop/RutineIQ/apps/web/src/app/app/insights/page.tsx)

| Property | Before | After | Reason |
|---|---|---|---|
| Container max-width | `max-w-6xl` (1152px) | `max-w-6xl` (no change) | Optimal reading width |
| Grid gap | `gap-4` (16px) | `gap-4` (no change) | Standard card gap |
| Mobile: 12-col grid | `lg:grid-cols-12` | `lg:grid-cols-12` (no change) | Correct breakpoint |

> [!NOTE]
> Current Insights layout metrics are well-structured per SoT. No metric changes needed — only PR1 (copy) and PR4 (structure) changes apply here.

#### [MODIFY] [daily-flow/page.tsx](file:///Users/taeksoojung/Desktop/RutineIQ/apps/web/src/app/app/daily-flow/page.tsx)

| Property | Before | After | Reason |
|---|---|---|---|
| Textarea min-height | `min-h-[200px]` | `min-h-[180px]` | Reduce scroll need on 390px mobile; textarea auto-resizes via JS |
| Date nav padding | `px-2 py-2` (8px) | `px-3 py-2` (12px/8px) | Touch target padding improvement |
| Mobile bottom padding | `pb-24` (96px) | Use token `pb-bottom-safe` | Consistency with AppShell |

#### [MODIFY] [reports/[date]/page.tsx](file:///Users/taeksoojung/Desktop/RutineIQ/apps/web/src/app/app/reports/%5Bdate%5D/page.tsx)

| Property | Before | After | Reason |
|---|---|---|---|
| Date input width | `w-[160px]` | `w-[160px]` (no change) | Adequate for date picker |
| Grid gap | `gap-4` (16px) | `gap-4` (no change) | Consistent with Insights |
| Timeline bar height | `h-10` (40px) | `h-10` (no change) | Adequate |

### PR3 Risks

- **Regression**: Textarea height change (200→180px) on Daily Flow — may cause JS auto-resize flicker
  - Mitigation: Test at 390px viewport, verify auto-resize still works
- **CLS**: No fixed-element position changes, so no CLS risk

---

## PR4: Structure / Component Boundary Improvements

### Current Component Tree (Before)

```text
daily-flow/page.tsx:
  └─ DailyFlowPage (1181 lines)
     ├─ localYYYYMMDD()          ← duplicated in insights, reports
     ├─ addDays()                ← duplicated in reports
     ├─ toMinutes()              ← duplicated in reports
     ├─ moodLabel()              ← inline
     ├─ normalizeParsedEntries() ← inline
     ├─ normalizeParsedMeta()    ← inline
     └─ <JSX>                    ← 700+ lines
```

```text
insights/page.tsx:
  └─ InsightsPage (1329 lines)
     ├─ localYYYYMMDD()          ← duplicated
     ├─ normalizeReport()        ← duplicated in reports
     ├─ cache helpers            ← inline
     └─ <JSX>                    ← 700+ lines
```

```text
reports/[date]/page.tsx:
  └─ ReportPage (720 lines)
     ├─ localYYYYMMDD (missing)
     ├─ addDays()                ← duplicated
     ├─ toMinutes()              ← duplicated
     ├─ normalizeReport()        ← duplicated from insights
     ├─ cache helpers            ← inline
     └─ <JSX>                    ← 500+ lines
```

### Proposed Changes

#### [NEW] [date-utils.ts](file:///Users/taeksoojung/Desktop/RutineIQ/apps/web/src/lib/date-utils.ts)

Extract shared date utilities:

- `localYYYYMMDD()` — from `daily-flow/page.tsx` L81–86 and `insights/page.tsx` L139–144
- `addDays()` — from `daily-flow/page.tsx` L88–93 and `reports/page.tsx` L108–116
- `toMinutes()` — from `daily-flow/page.tsx` L111–120 and `reports/page.tsx` L159–167

#### [NEW] [report-utils.ts](file:///Users/taeksoojung/Desktop/RutineIQ/apps/web/src/lib/report-utils.ts)

Extract shared report normalization:

- `normalizeReport()` — from `insights/page.tsx` L190–244 and `reports/page.tsx` L169–223 (near-identical logic)
- `AIReport` type — currently duplicated

#### [MODIFY] insights/page.tsx, daily-flow/page.tsx, reports/[date]/page.tsx

- Replace local utility functions with imports from `date-utils.ts` and `report-utils.ts`
- Remove duplicated type definitions

### After Component Tree

```text
lib/date-utils.ts:         localYYYYMMDD, addDays, toMinutes
lib/report-utils.ts:       AIReport (type), normalizeReport

daily-flow/page.tsx:
  └─ DailyFlowPage
     ├─ import { localYYYYMMDD, addDays, toMinutes } from '@/lib/date-utils'
     ├─ moodLabel()              ← keep inline (page-specific)
     └─ <JSX>

insights/page.tsx:
  └─ InsightsPage
     ├─ import { localYYYYMMDD } from '@/lib/date-utils'
     ├─ import { normalizeReport } from '@/lib/report-utils'
     └─ <JSX>

reports/[date]/page.tsx:
  └─ ReportPage
     ├─ import { addDays, toMinutes } from '@/lib/date-utils'
     ├─ import { normalizeReport } from '@/lib/report-utils'
     └─ <JSX>
```

### State Ownership (No Changes)

Per SoT §5: State ownership stays identical. This PR only extracts pure utility functions — no state or hook changes.

| Component | State Type | Owner | Change |
|---|---|---|---|
| DailyFlowPage | SWR + local | DailyFlowPage | None |
| InsightsPage | sessionStorage cache + local | InsightsPage | None |
| ReportPage | sessionStorage cache + local | ReportPage | None |
| AppShell | locale + auth | AppShell | None |

### PR4 Risks

- **Import path changes**: All changes are additive (new files + changing `function` to `import`)
  - Mitigation: TypeScript compiler catches missing imports immediately
- **Behavior**: `normalizeReport()` logic is identical in both files — unit test (if added) can verify parity
- **Rollback**: Revert PR4 independently; pages still work with inline functions

---

## Verification Plan

### Automated Tests

All commands run from `/Users/taeksoojung/Desktop/RutineIQ/apps/web`:

```bash
# 1. TypeScript type checking (catches import errors, type mismatches)
npm run typecheck

# 2. ESLint (catches unused variables, import order issues)
npm run lint

# 3. Production build (catches SSR/CSR boundary issues)
npm run build

# 4. E2E responsive layout tests (tests headings at 375/768/1280 viewports)
npx playwright test e2e/responsive-layouts.spec.ts
```

> [!IMPORTANT]
> E2E tests require a running dev server and Playwright browser binaries. If the e2e environment is not configured, we'll rely on typecheck + build + manual verification.

### Manual Verification

1. **Build verification**: `npm run build` must pass (zero errors)
2. **Viewport check for copy overflow**: After PR1, run `npm run dev`, open browser at:
   - 390px width → Check all Korean strings fit without horizontal overflow
   - 768px width → Check grid layout transitions
   - 1440px width → Check full desktop layout
3. **String completeness**: Grep for any remaining `isKo ?` patterns outside `i18n.ts` to confirm consolidation is complete:

   ```bash
   grep -rn 'isKo ?' apps/web/src/ --include="*.tsx" | grep -v 'node_modules'
   ```

---

## Rollback Plan

| PR | Rollback Method | Impact |
|---|---|---|
| PR1 (strings) | `git revert <PR1-commit>` | Strings revert to inline; no functional impact |
| PR2 (tokens) | `git revert <PR2-commit>` | CSS tokens removed; Tailwind classes were not changed so no breakage |
| PR3 (layout) | `git revert <PR3-commit>` or per-file cherry-pick revert | Layout returns to original values |
| PR4 (structure) | `git revert <PR4-commit>` | Utility functions return to inline in each page |

Each PR is independently revertable. No cross-PR dependencies exist.
