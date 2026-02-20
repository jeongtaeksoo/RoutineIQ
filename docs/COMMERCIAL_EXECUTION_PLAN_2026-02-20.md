# RutineIQ Commercial Completion Plan (2026-02-20)

## 1) 현재 상태 요약 (정량 기반)
기준 시각: 2026-02-20 13:33~13:40 (KST), Supabase 서비스키 read 쿼리 + 코드 베이스 확인.

| 항목 | 현재값 | 근거 |
|---|---:|---|
| 총 사용자(Profiles) | 425 | Supabase `profiles` 집계 |
| 30일 활성 사용자(Any activity) | 256 | `activity_logs` + `ai_reports` + `usage_events` user_id union |
| 7일 활성 사용자(Any activity) | 246 | 동일 방식 |
| 1일 활성 사용자(Any activity) | 58 | 동일 방식 |
| DAU/MAU (Any activity) | 22.7% | 58 / 256 |
| 로그 작성 사용자(30d) | 255 | `activity_logs` |
| 리포트 사용자(30d) | 160 | `ai_reports` |
| 로그→리포트 사용자 전환 | 62.75% | 160 / 255 |
| 프로필 완성 사용자 | 170 (40.0%) | age/gender/job/work_mode != unknown |
| Activation 완료 사용자 | 154 (36.24%) | profile complete + any log + any report |
| Pro 구독(active/trialing) | 64 | `subscriptions` |
| Pro 구독자 중 로그/리포트/이벤트 보유 | 0 / 0 / 0 | 구독 데이터 오염 신호 |

코드 기준 사실:
- 수익모델: Free/Pro 구독 모델만 구현. `/api/stripe/*` + `subscriptions` 테이블 기반. `/Users/taeksoojung/Desktop/RutineIQ/apps/api/app/routes/stripe_routes.py:37`, `/Users/taeksoojung/Desktop/RutineIQ/supabase/schema.sql:371`
- 제한 정책: Free 1회/일, Pro 10회/일, 리포트 보관 Free 3일/Pro 30일. `/Users/taeksoojung/Desktop/RutineIQ/apps/api/app/core/config.py:60`
- Paywall 노출 캡: 일 3회/주 12회/슬롯 일 2회. `/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/lib/paywall-policy.ts:15`
- 주요 화면 파일 비대: insights 1434줄, daily-flow 1589줄, reports 1068줄, settings panel 927줄.

현재 결론:
- CAC/LTV/가격민감도는 현재 데이터로 **미측정(Unknown)**.
- 결제 전환 지표는 구독 데이터 오염으로 **신뢰 불가(Invalid)**.

## 2) 치명적 공백 (Critical Gaps)
1. 결제/전환 데이터 신뢰성 붕괴 (Subscription contamination)
2. Activation 병목 (프로필 완성률 40%, Activation 36.24%)
3. 리텐션 루프 미형성 (사용자 반복 활동 데이터 부족)
4. CAC/LTV/가격민감도 계측 부재
5. 세그먼트 데이터 결손(unknown 비중 과다)로 타겟팅 불가
6. 대형 단일 파일 구조로 릴리즈 리스크 상시 노출
7. 경쟁 대안 대비 포지셔닝 검증 데이터(Win/Loss) 부재

## 3) 각 공백별 왜/리스크/수치 개선 효과
| Gap | 왜 반드시 해결해야 하는가 | 미해결 리스크 | 기대 수치 개선 효과(목표) |
|---|---|---|---|
| 1. 전환 데이터 신뢰성 | 전환율/LTV 계산의 전제 데이터가 무효 | PMF/가격/마케팅 의사결정 왜곡 | 2주 내 신규 subscription의 source 태깅 커버리지 95%+; "실사용 기반 유료전환율" 산출 가능 |
| 2. Activation 병목 | 유저가 핵심 가치(리포트/내일계획) 도달 전 이탈 | MAU 대비 리포트 생성 정체 | Activation 36.2% → 50%+, profile complete 40% → 65% |
| 3. 리텐션 루프 미형성 | 리텐션 없으면 LTV가 성립 불가 | 재방문 저하, CAC 회수 불가 | log→report 전환 62.8% → 75%, D7 재방문 측정 가능 상태 확보 |
| 4. CAC/LTV/가격민감도 부재 | 수익화 실험 ROI 판단 불가 | 저ROI 실험 반복 | CAC/LTV/Payback dashboard 주간 산출 체계 구축(Unknown→Measured) |
| 5. 세그먼트 결손 | 누구에게 팔지 결정 불가 | 카피/플랜/온보딩 개인화 실패 | unknown 세그먼트 35%+ → 20% 미만, 세그먼트별 전환 비교 가능 |
| 6. 구조적 기술부채 | 릴리즈당 회귀 위험 과다 | 배포 속도/품질 악화 | 대형 4파일 분리로 변경영향 축소, 회귀 테스트 통과율 안정화 |
| 7. 경쟁 검증 부재 | 포지셔닝/가격이 시장 대안 대비 약할 수 있음 | 메시지/과금 미스매치 | KR/JP/US Win/Loss 30건 확보, 대안별 전환 방해요인 계량화 |

## 4) 남은 작업 목록 (우선순위)

### A. 비즈니스 작업
| 우선순위 | 작업 | KPI 연결 | 상태 |
|---|---|---|---|
| P0 | North Star + KPI 사전 고정(Activation, D7, Paid Conv, LTV/CAC) | 리텐션/전환/LTV | Pending |
| P0 | CAC/LTV 데이터 파이프라인 정의(채널/비용/결제/활동 연결) | LTV/CAC | Pending |
| P1 | KR/JP/US 세그먼트별 Win/Loss 인터뷰 30건 | 전환/리텐션 | Pending |
| P2 | 경쟁 대안 가격/포지셔닝 월간 트래커 | 전환/LTV | Pending |

### B. 제품 기능 작업
| 우선순위 | 작업 | KPI 연결 | 상태 |
|---|---|---|---|
| P0 | 온보딩 필수항목 최소화 + 단계별 저장(막힘 제거) | Activation/Retention | Pending |
| P0 | 기록→분석 비동기 UX(대기/취소/재시도/완료 알림) | Activation/Retention | Pending |
| P1 | 리포트 가치 강화(대표 인사이트 1개 + 행동계획 CTA) | Retention | Pending |
| P1 | 코호트 카드 신뢰 UX 고도화(표본/신뢰도/비교축) | Retention | Pending |
| P2 | 공유카드 목적 재정의(회고/코칭 중심) | Retention | Pending |

### C. 수익화 작업
| 우선순위 | 작업 | KPI 연결 | 상태 |
|---|---|---|---|
| P0 | 결제 source 추적 체인 완성(DB migration 포함) | 전환/LTV | In Progress |
| P0 | 실사용 기반 전환 퍼널 대시보드(방문→체크아웃→성공) | 전환 | Pending |
| P1 | 플랜 실험(월 구독 단일 vs 연 구독 번들) | 전환/LTV | Pending |
| P1 | 결제 실패 복구(dunning + 인앱 재시도) | 전환/LTV | Pending |

### D. 기술 작업
| 우선순위 | 작업 | KPI 연결 | 상태 |
|---|---|---|---|
| P0 | `subscriptions.source` DB 패치 적용 및 배포 검증 | 전환/LTV | In Progress |
| P0 | API/Web 이벤트 스키마 정합화(correlation/source/request_id) | 전환/리텐션 측정 | Pending |
| P1 | 대형 파일 분해(feature 단위) | 배포 안정성→리텐션 간접 | Pending |
| P1 | API 테스트 실행 표준화(PYTHONPATH/.venv bootstrap) | 품질/출시속도 | Pending |
| P1 | 오류/성능 관측 대시보드(Sentry + Web Vitals + product events) | Retention | Pending |

### ROI 낮아 제거할 작업
- PWA 비주얼 리스킨 단독 진행 (전환/리텐션 직결 근거 부족)
- 공유 카드 그래픽 고도화 우선 개발 (핵심 루프 전)
- 네이티브 앱 분리 착수 (웹 상업화 지표 성립 전)

## 5) 작업별 실행안 (목표/단계/리소스/난이도)
| 작업 | 목표 | 실행 단계 | 필요한 리소스 | 난이도 |
|---|---|---|---|---|
| 결제 source 추적 완성 (P0) | 전환 데이터 신뢰 회복 | 1) UI 헤더 전송 2) Stripe metadata 전달 3) DB source 컬럼 4) 리포트 분리(실사용/스모크) | FE 0.5d, BE 0.5d, DB 0.5d, QA 0.5d | Medium |
| Activation UX 개편 (P0) | Activation 36.2%→50% | 1) 온보딩 필수 2) unknown 차단 3) next-step CTA 고정 4) 분석 완료 유도 | FE 2d, BE 1d, QA 1d | High |
| 분석 비동기 UX (P0) | 분석 단계 이탈 감소 | 1) 작업 상태 API 2) cancel/retry 3) 완료 토스트/리다이렉트 4) 장애 복구 경로 | FE 2d, BE 2d, QA 1.5d | High |
| 퍼널 대시보드 (P0) | 방문→결제 전환률 측정 | 1) 이벤트 정의 2) ETL view 3) 대시보드 4) 주간 리포트 | Data/BE 2d, PM 0.5d | Medium |
| CAC/LTV 파이프라인 (P0) | payback 계산 가능화 | 1) 채널 source/비용 테이블 2) 구독/환불 연결 3) 코호트 LTV 계산 | Data 3d, BE 1d | High |
| 리포트 가치 강화 (P1) | D7 재방문 상승 | 1) 대표 인사이트 2) 내일 행동 1개 CTA 3) 실행 체크백 | FE 2d, BE 1d, UX 1d | Medium |
| 세그먼트 데이터 완성 (P1) | unknown 비중 축소 | 1) 프로필 업데이트 강제 2) 저장 실패 복구 3) 리마인더 | FE 1.5d, BE 0.5d, QA 1d | Medium |
| 대형 파일 분해 (P1) | 릴리즈 회귀 감소 | 1) 페이지 컴포지션화 2) hooks/services 분리 3) 테스트 보강 | FE 4d, QA 2d | High |
| 결제 실패 복구(dunning) (P1) | 유료 유지율 개선 | 1) 실패 이벤트 2) 재시도 알림 3) 계정 페이지 재결제 CTA | BE 1.5d, FE 1d | Medium |
| KR/JP/US Win-Loss 인터뷰 (P1) | 포지셔닝 정합화 | 1) 설문 스크립트 2) 인터뷰 30건 3) 카피/가격 반영 | PM/Research 5d | Medium |

## 이번 턴 즉시 실행된 항목
- 구현 완료: 결제 source 헤더 전송 (`/Users/taeksoojung/Desktop/RutineIQ/apps/web/src/components/billing-actions.tsx:403`)
- 구현 완료: 라이브 스모크 source 메타데이터 (`/Users/taeksoojung/Desktop/RutineIQ/apps/web/scripts/live-smoke.mjs:323`)
- 구현 완료: `subscriptions.source` 스키마/패치 (`/Users/taeksoojung/Desktop/RutineIQ/supabase/schema.sql:377`, `/Users/taeksoojung/Desktop/RutineIQ/supabase/patches/2026-02-20_subscriptions_source.sql:1`)
- 테스트 추가/통과: stripe source 전달 검증 (`/Users/taeksoojung/Desktop/RutineIQ/apps/api/tests/test_stripe_integration.py:46`)
- 검증: `cd apps/web && npm run lint` PASS, `cd apps/web && npm run typecheck` PASS, `cd apps/api && PYTHONPATH=. .venv/bin/pytest -q tests/test_stripe_integration.py` PASS (9 passed)
