# Product Rewrite Story Backlog (40+)
기준 저장소: `/Users/taeksoojung/Desktop/RutineIQ`
기준일: 2026-02-19

우선순위 기준:
- P0: 수익/핵심 루프/데이터 안전성에 직접 영향
- P1: 유지율/전환 개선에 중요
- P2: 확장성/운영 효율 개선

## Epic E1 — IA/Navigation
| Story ID | Priority | 목적/설명 | 변경 파일 후보 | API 영향 | UI 영향 | Acceptance Criteria | 위험/완화 | 기간(일) | 의존성 | Tasks |
|---|---|---|---|---|---|---|---|---|---|---|
| E1-S01 | P0 | `/app` 기본 진입을 `/app/today`로 통일 | `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/app/app/page.tsx` | 없음 | 앱 진입 동선 | Given 로그인 사용자, When `/app` 진입, Then `/app/today`로 이동 | 기존 링크 잔존 -> 전역 검색 후 치환 | 0.5 | 없음 | redirect 변경; e2e 업데이트; 회귀 확인 |
| E1-S02 | P0 | `today/log/plan` 신규 루프 라우트 고정 | `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/app/app/{today,log,plan}/page.tsx` | 없음 | 루프 가시성 | Given nav 클릭, Then 각 라우트 정상 렌더 | alias 충돌 -> old path alias 유지 | 1 | E1-S01 | route 생성; nav 연결; smoke test |
| E1-S03 | P0 | nav 구조 개편(데스크톱/모바일) | `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/components/app-shell.tsx` | 없음 | 글로벌 내비 | nav active 상태가 alias 포함 정확히 동작 | active 계산 버그 -> helper 함수 단일화 | 1 | E1-S02 | item 정의; active helper; responsive 확인 |
| E1-S04 | P1 | legacy 링크 `/app/insights`,`/app/daily-flow` 정리 | `login-client.tsx`, `auth/callback/route.ts`, `reset-password-client.tsx`, `not-found.tsx`, `offline/page.tsx` | 없음 | 인증 후 이동 | 로그인/복구/404/오프라인 복귀 경로가 `/app/today` 기준 | 누락 경로 -> rg audit | 1 | E1-S03 | 경로 치환; 타입체크; e2e 로그인 확인 |
| E1-S05 | P1 | reminders 링크를 새 IA와 일치 | `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/components/reminder-scheduler.tsx` | 없음 | 알림 클릭 동선 | 알림 클릭 시 log/today 정확 이동 | deep-link 깨짐 -> 기존 alias fallback 유지 | 0.5 | E1-S03 | href 교체; 브라우저 노티 테스트 |
| E1-S06 | P2 | 라우트 문서화/머메이드 갱신 | `/Users/taeksoojung/Desktop/RutineIQ/docs/PRODUCT_REWRITE_MASTERPLAN_2026-02-19.md` | 없음 | 문서 | 문서 IA와 실제 라우트 일치 | 문서-코드 불일치 -> CI 체크리스트 추가 | 0.5 | E1-S02 | mermaid 갱신; 링크 검수 |

## Epic E2 — Onboarding/Activation
| Story ID | Priority | 목적/설명 | 변경 파일 후보 | API 영향 | UI 영향 | Acceptance Criteria | 위험/완화 | 기간(일) | 의존성 | Tasks |
|---|---|---|---|---|---|---|---|---|---|---|
| E2-S01 | P0 | 첫 진입 CTA를 `기록 시작` 단일화 | `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/app/app/today/page.tsx` | 없음 | Today CTA | Today에서 1차 CTA는 `/app/log`만 우선 노출 | CTA 과다 -> secondary 숨김 | 1 | E1-S02 | CTA hierarchy 적용; copy 수정; mobile 확인 |
| E2-S02 | P0 | 프로필 필수 설정 진입 강화 | `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/app/app/insights/page.tsx` | `GET/PUT /preferences/profile` (existing) | 경고 카드 | 필수값 누락 시 `/app/settings/profile` CTA 노출 | 경고 과다 -> once-per-day dismiss | 1 | E1-S03 | profile flag 계산; CTA 연결; dismiss 저장 |
| E2-S03 | P1 | 로그인 후 안전 next 경로 검증 | `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/components/login-client.tsx` | 없음 | auth redirect | 외부 URL/`//` 경로 차단, 내부 경로만 허용 | open redirect -> sanitize 유지 | 0.5 | E1-S04 | sanitize 테스트; callback 연동 |
| E2-S04 | P1 | onboarding progress 배지 도입 | `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/app/app/today/page.tsx` | `GET /logs`,`GET /reports` | 진행 상태 카드 | `log/analyze/plan` 3단계 progress가 정확 | 상태 계산 오류 -> 단일 selector 함수 | 1 | E2-S01 | progress model; UI badge; unit test |
| E2-S05 | P1 | 첫 7일 루프 리마인드 카피 정비 | `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/lib/i18n.ts`, `today/page.tsx` | 없음 | 카피/신뢰 | 과장 문구 없이 행동 중심 문구 적용 | 번역 누락 -> fallback en | 0.5 | E2-S01 | string key 추가; locale 검수 |
| E2-S06 | P2 | 인앱브라우저 안내 UX 정돈 | `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/components/login-client.tsx` | 없음 | OAuth 에러 처리 | disallowed_useragent 시 안내 + 외부 브라우저 버튼 동작 | UA 오탐 -> 수동 옵션 제공 | 1 | E2-S03 | message 개선; action button; QA |

## Epic E3 — Log/Analyze UX
| Story ID | Priority | 목적/설명 | 변경 파일 후보 | API 영향 | UI 영향 | Acceptance Criteria | 위험/완화 | 기간(일) | 의존성 | Tasks |
|---|---|---|---|---|---|---|---|---|---|---|
| E3-S01 | P0 | 분석 요청 취소(Abort) 지원 | `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/app/app/daily-flow/page.tsx` | `/analyze` 호출 방식 변경(동일 endpoint) | done 단계 버튼 | analyzing 중 취소 클릭 시 요청 abort, 에러 문구 정상 | abort 레이스 -> finally cleanup | 1 | E1-S02 | controller ref; cancel btn; cleanup |
| E3-S02 | P0 | 분석 진행 힌트/타임아웃 힌트 추가 | `daily-flow/page.tsx` | 없음 | 오류/상태 UX | timeout code에서 전용 힌트 노출 | generic error 우선 -> code 분기 | 0.5 | E3-S01 | timeout branch; localized string |
| E3-S03 | P0 | report 화면 분석 취소 지원 | `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/app/app/reports/[date]/page.tsx` | `/analyze` 호출 방식 변경 | report header | analyzing 중 cancel 가능 | 버튼 위치 혼잡 -> outline secondary | 1 | E3-S01 | abort wiring; header+empty state 버튼 |
| E3-S04 | P1 | parse 실패 재시도 UX 강화 | `daily-flow/page.tsx` | `/parse-diary` | 에러 배너 | retry 가능한 오류에서 `다시 시도` 버튼 노출 | 오탐 -> code whitelist | 0.5 | 없음 | code map; retry button |
| E3-S05 | P1 | confirm 단계 issue 포커스 개선 | `daily-flow/page.tsx` | 없음 | issue banner | unresolved issue 1개씩 안내되고 review 이동 | 과도한 스크롤 -> scrollIntoView 기준 수정 | 1 | E3-S04 | issue selector; focus handler; telemetry |
| E3-S06 | P1 | analyze 실행 이벤트 트래킹 표준화 | `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/lib/analytics.ts`(new), `daily-flow/page.tsx`, `reports/[date]/page.tsx` | `/trends/cohort/event` 또는 analytics vendor | 이벤트 | `analyze_start/success/fail/cancel` 이벤트 수집 | vendor 미설정 -> no-op adapter | 1.5 | E3-S01 | analytics wrapper; emit points; QA |

## Epic E4 — Report Value & Trust
| Story ID | Priority | 목적/설명 | 변경 파일 후보 | API 영향 | UI 영향 | Acceptance Criteria | 위험/완화 | 기간(일) | 의존성 | Tasks |
|---|---|---|---|---|---|---|---|---|---|---|
| E4-S01 | P0 | Report hero를 실행 중심으로 재배치 | `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/app/app/reports/[date]/page.tsx` | 없음 | 카드 우선순위 | 첫 화면에서 코치 한줄+핵심행동+지표 확인 가능 | 레이아웃 회귀 -> screenshot diff | 1 | E3-S03 | section reorder; copy trim; QA |
| E4-S02 | P0 | 신뢰 배지 고정 위치/문구 표준화 | `reports/[date]/page.tsx`, `insights/page.tsx` | 없음 | trust badge | 신뢰 문구가 매 화면 동일 규칙으로 노출 | 문구 중복 -> i18n key 통합 | 1 | E4-S01 | key 정의; components reuse |
| E4-S03 | P1 | micro-advice primary/secondary 분리 | `reports/[date]/page.tsx` | 없음 | actionable UI | 대표 1개 강조 + 나머지 접기 | 정보 누락 우려 -> expand control | 0.5 | E4-S01 | slice logic; toggle control |
| E4-S04 | P1 | cohort 카드 설정 CTA 명확화 | `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/app/app/insights/page.tsx` | 없음 | cohort empty/preview | insufficient/disabled에서 `/app/settings/profile` CTA 노출 | click tracking 누락 -> event emit | 0.5 | E1-S03 | CTA route update; telemetry |
| E4-S05 | P1 | rank 노출 정책 방어적 적용 | `insights/page.tsx` | `/trends/cohort` 응답 필드 사용 | cohort detail | preview 모드에서는 rank 숨김 보장 | 서버 불일치 -> UI guard if preview | 0.5 | E4-S04 | conditional guard |
| E4-S06 | P2 | 공유카드 목적 재정의(회고/바이럴 분리) | `insights/share-card.tsx`, `insights/page.tsx` | 없음 | share modal | 공유 타입 선택(회고/성과) 가능 | scope creep -> v1는 카피+레이아웃만 | 2 | E4-S01 | template 2종; metadata text |

## Epic E5 — Settings/Billing/Safety
| Story ID | Priority | 목적/설명 | 변경 파일 후보 | API 영향 | UI 영향 | Acceptance Criteria | 위험/완화 | 기간(일) | 의존성 | Tasks |
|---|---|---|---|---|---|---|---|---|---|---|
| E5-S01 | P0 | settings 전용 layout/tab 활성 상태 | `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/app/app/settings/layout.tsx` | 없음 | settings nav | 활성 탭이 pathname 기준 정확히 하이라이트 | hydration mismatch -> client layout 유지 | 0.5 | E1-S02 | pathname match; ko/en label |
| E5-S02 | P0 | privacy 페이지에서 데이터 삭제 2단계 확인 | `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/app/app/settings/privacy/page.tsx` | `DELETE /preferences/data` | danger zone | `DELETE` 입력 전 삭제 버튼 비활성 | 사용자 혼란 -> helper text 추가 | 1 | E5-S01 | confirm input; delete call; message |
| E5-S03 | P0 | account 페이지에서 회원탈퇴 2단계 확인 | `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/app/app/settings/account/page.tsx` | `DELETE /preferences/account` | account danger zone | `DELETE` 입력 + 탈퇴 성공 시 `/login?deleted=1` | delete timeout -> retryOnTimeout 유지 | 1 | E5-S01 | confirm flow; signout race safe |
| E5-S04 | P0 | billing 페이지를 실사용 페이지로 전환 | `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/app/app/billing/page.tsx` | `subscriptions` 조회 + stripe status | plans view | FREE/PRO 상태+운영 링크 노출 | 데이터 null -> fallback FREE | 1 | E1-S02 | plan loader; action cards |
| E5-S05 | P1 | 설정 모달 기능 축소(민감 작업 라우트 링크) | `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/components/app-settings-panel.tsx` | 기존 민감 API 호출 제거 | modal tabs | data/account 탭에서 링크만 제공 | 사용자 클릭 증가 -> quick link card 보강 | 1 | E5-S02 | delete fn 제거; link 교체 |
| E5-S06 | P1 | preferences redirect 정리 | `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/app/app/preferences/page.tsx` | 없음 | legacy route | `/app/preferences` 진입 시 `/app/settings/profile` 이동 | legacy deep-link 깨짐 -> alias 유지 | 0.5 | E5-S01 | redirect update |

## Epic E6 — Platform Reliability/Observability
| Story ID | Priority | 목적/설명 | 변경 파일 후보 | API 영향 | UI 영향 | Acceptance Criteria | 위험/완화 | 기간(일) | 의존성 | Tasks |
|---|---|---|---|---|---|---|---|---|---|---|
| E6-S01 | P0 | 프론트 요청 correlation id 생성 | `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/lib/api-client.ts` | 헤더 `x-correlation-id` 추가 | 사용자 직접 영향 없음 | 모든 apiFetch 요청 헤더에 correlation id 포함 | 중복 생성 -> 기존 헤더 우선 | 0.5 | 없음 | id helper; header set |
| E6-S02 | P0 | 서버 correlation id 반환/로그 기록 | `/Users/taeksoojung/Desktop/RutineIQ/apps/api/app/main.py` | 응답 헤더 + log meta | 오류 추적 | 모든 API 응답에 correlation id 헤더 존재 | middleware order -> first middleware 고정 | 1 | E6-S01 | middleware add; exception handler header |
| E6-S03 | P1 | app 세그먼트 error boundary 도입 | `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/app/app/error.tsx`(new) | 없음 | 오류 화면 | `/app/*` 렌더 오류 시 app전용 fallback 표시 | 중복 boundary -> global fallback 유지 | 0.5 | 없음 | error component 생성 |
| E6-S04 | P1 | app 세그먼트 loading fallback 도입 | `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/app/app/loading.tsx`(new) | 없음 | 로딩 skeleton | route transition 시 공통 skeleton 표시 | skeleton 과다 -> 최소 구조 유지 | 0.5 | 없음 | loading component 생성 |
| E6-S05 | P1 | Web 보안 헤더/CSP 기본 적용 | `/Users/taeksoojung/Desktop/RutineIQ/apps/web/next.config.mjs` | HTTP headers | 보안 | 응답에 CSP, X-Frame-Options 등 포함 | CSP 차단 -> permissive baseline 후 tighten | 1 | 없음 | headers() 구성; dev/prod 검증 |
| E6-S06 | P2 | API schema validation(zod) 시작 | `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/lib/api/schemas.ts`(new), `reports/[date]/page.tsx` | 클라이언트 파싱 | 오류 내성 | 주요 endpoint 3개 response parse 성공/실패 분기 | runtime overhead -> 핵심 endpoint부터 | 1.5 | E6-S01 | zod schema; parse wrapper |

## Epic E7 — QA/Release Automation
| Story ID | Priority | 목적/설명 | 변경 파일 후보 | API 영향 | UI 영향 | Acceptance Criteria | 위험/완화 | 기간(일) | 의존성 | Tasks |
|---|---|---|---|---|---|---|---|---|---|---|
| E7-S01 | P0 | IA 전환 smoke e2e 추가 | `/Users/taeksoojung/Desktop/RutineIQ/apps/web/e2e/core-flows.spec.ts` | 없음 | 회귀 테스트 | today->log->report->plan 루프 e2e 통과 | flaky -> wait strategy 통일 | 1 | E1-S03 | scenario 추가; selectors 안정화 |
| E7-S02 | P0 | 설정 민감작업 UX e2e | `apps/web/e2e/settings-danger.spec.ts`(new) | `/preferences/*` | 안전성 | DELETE 입력 없이는 버튼 비활성 검증 | env dependency -> mocked user seed | 1 | E5-S02 | test add; seed flow |
| E7-S03 | P1 | analyze cancel path e2e | `apps/web/e2e/analyze-cancel.spec.ts`(new) | `/analyze` | 분석 UX | cancel 후 화면 오류 없이 복귀 | timing race -> mock delay endpoint | 1 | E3-S03 | delayed analyze mock; assert cancel |
| E7-S04 | P1 | correlation id 로그 검증 테스트 | `apps/api/tests/test_correlation_id.py`(new) | API middleware | 없음 | 요청/응답/예외에서 동일 correlation id 확인 | test env header capture -> client fixture | 1 | E6-S02 | api test 작성 |
| E7-S05 | P1 | lint/typecheck/test 파이프라인 고정 | `.github/workflows/ci.yml`(new or update) | 없음 | 배포 안정성 | PR마다 lint+typecheck+e2e smoke 실행 | CI 시간 증가 -> smoke subset | 1 | E7-S01 | workflow 작성 |
| E7-S06 | P2 | 릴리즈 체크리스트 자동화 스크립트 | `/Users/taeksoojung/Desktop/RutineIQ/scripts/release-verify.sh` | 없음 | 운영 | 실패 시 배포 차단 조건 출력 | false positive -> skip flags 제공 | 1 | E7-S05 | script update; docs sync |

## Epic E8 — Design System & Performance
| Story ID | Priority | 목적/설명 | 변경 파일 후보 | API 영향 | UI 영향 | Acceptance Criteria | 위험/완화 | 기간(일) | 의존성 | Tasks |
|---|---|---|---|---|---|---|---|---|---|---|
| E8-S01 | P1 | radius scale 통일(32->20 중심) | `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/components/ui/card.tsx`, `globals.css` | 없음 | 일관성 | 주요 카드 radius 규격 통일 | 시각 변화 반발 -> 점진적 적용 | 1 | 없음 | token 정의; card update |
| E8-S02 | P1 | spacing token 정리 | `globals.css`, `tailwind.config.ts` | 없음 | 간격 일관성 | `pb-bottom-safe` 등 토큰 기반 사용 | 클래스 혼용 -> codemod/rg 점검 | 1 | 없음 | token 추가; 사용처 치환 |
| E8-S03 | P1 | AppShell 렌더 최적화 | `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/components/app-shell.tsx` | 없음 | 성능 | nav 계산 memo화/불필요 re-render 감소 | 과도 memo -> 복잡도 증가 | 0.5 | E1-S03 | memo deps 정리 |
| E8-S04 | P2 | 번들 분할 점검(dynamic import) | `insights/page.tsx`, `reports/[date]/page.tsx` | 없음 | 초기 로딩 | heavy widget 분할로 첫 페인트 개선 | hydration mismatch -> client-only 경계 | 1.5 | E8-S03 | dynamic import 적용 |
| E8-S05 | P2 | long page content-visibility 실험 | `insights/page.tsx` | 없음 | 스크롤 성능 | 하단 섹션 render cost 감소 | 브라우저 호환 -> progressive enhancement | 1 | E8-S04 | CSS 적용; perf 비교 |
| E8-S06 | P2 | web vitals 수집 파이프 | `app/layout.tsx`, `lib/analytics.ts` | telemetry endpoint | 관측 | LCP/INP/CLS 이벤트 수집 | noise -> sampling 적용 | 1 | E3-S06 | web-vitals hook; emit |

## Epic E9 — Monetization
| Story ID | Priority | 목적/설명 | 변경 파일 후보 | API 영향 | UI 영향 | Acceptance Criteria | 위험/완화 | 기간(일) | 의존성 | Tasks |
|---|---|---|---|---|---|---|---|---|---|---|
| E9-S01 | P0 | billing 진입 CTA를 주요 화면에 노출 | `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/app/app/{plan,today,reports/[date]}/page.tsx` | 없음 | 전환 | 유료 가치 지점에서 billing CTA 노출 | 과다 노출 -> free 사용자 조건 분기 | 1 | E5-S04 | CTA placement; plan 조건 |
| E9-S02 | P0 | free/pro plan value block 명확화 | `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/app/app/billing/page.tsx` | `/stripe/status` | 비교표 | plan 기능 비교가 한 화면에서 확인 | 기능 과장 리스크 -> 실제 기능만 표기 | 1 | E5-S04 | matrix card; copy 검수 |
| E9-S03 | P1 | checkout 실패 복구 동선 강화 | `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/components/billing-actions.tsx` | `/stripe/create-checkout-session` | 에러 UX | 실패시 원인+재시도+지원 링크 제공 | stripe env 불일치 -> explicit hints | 1 | E9-S02 | error map; retry cta |
| E9-S04 | P1 | plan 페이지에서 ROI 카피 실험 | `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/app/app/plan/page.tsx` | 이벤트 로깅 | 카피 실험 | variant별 CTR 수집 | 실험 오염 -> sticky assignment | 1 | E3-S06 | variant assign; event emit |
| E9-S05 | P2 | subscription 상태 동기화 배치 | `/Users/taeksoojung/Desktop/RutineIQ/apps/api/app/routes/stripe_routes.py` | stripe webhook flow | 없음 | stale subscription 자동 정합성 확보 | 외부 장애 -> retry 큐 | 2 | E9-S03 | sync endpoint 강화; admin tool |
| E9-S06 | P2 | paywall exposure frequency 제어 | `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/lib/paywall-policy.ts`(new), `today/page.tsx` | 이벤트 로깅 | UX 피로도 | 과도 노출 방지(일/주 cap) | 노출 부족 -> cap 조정 flag | 1 | E9-S01 | policy util; gating 적용 |

## Epic E10 — i18n & Content Quality
| Story ID | Priority | 목적/설명 | 변경 파일 후보 | API 영향 | UI 영향 | Acceptance Criteria | 위험/완화 | 기간(일) | 의존성 | Tasks |
|---|---|---|---|---|---|---|---|---|---|---|
| E10-S01 | P1 | nav/plan/billing 문구 i18n 통합 | `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/lib/i18n.ts`, `app-shell.tsx` | 없음 | 카피 일관성 | 하드코딩 분기 제거 | 번역 누락 -> default en | 0.5 | E1-S03 | string key 추가; 치환 |
| E10-S02 | P1 | trust 문구 공통 컴포넌트화 | `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/components/trust-badge.tsx`(new), `insights/page.tsx`, `reports/[date]/page.tsx` | 없음 | 신뢰 UX | 2 화면에서 동일 컴포넌트 사용 | 디자인 불일치 -> token 적용 | 1 | E4-S02 | component 작성; 사용처 교체 |
| E10-S03 | P2 | 에러 문구 표준 맵 구축 | `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/lib/error-copy.ts`(new), `api-client.ts` | 없음 | 오류 UX | code/status별 사용자 친화 문구 | 과도 단순화 -> detail 토글 제공 | 1 | E6-S01 | map 정의; 에러 화면 연결 |
| E10-S04 | P2 | next-intl 도입 사전 준비 | `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/lib/i18n.ts`, `middleware.ts` | 없음 | 국제화 | key namespace 구조 정리 완료 | 대규모 변경 리스크 -> 브리지 단계 | 2 | E10-S01 | key refactor; migration note |
| E10-S05 | P2 | 복수 언어 QA 시트 자동화 | `/Users/taeksoojung/Desktop/RutineIQ/scripts/i18n-audit.sh`(new) | 없음 | QA 효율 | 누락 key/unused key 보고서 생성 | false positives -> ignore list | 1 | E10-S04 | script 구현; docs 추가 |
| E10-S06 | P2 | 코호트 카피 강도 국가별 분기 | `insights/page.tsx`, `i18n.ts` | 없음 | KR/JP/US 카피 톤 | locale별 설명 강도 정책 반영 | 문화 오해 -> 전문가 리뷰 라벨 | 1.5 | E4-S04 | locale copy set; A/B flag |
