# Critical E2E Journeys (Phase 1)

기준 저장소: `/Users/taeksoojung/Desktop/RutineIQ`  
목적: P0 사용자 여정을 재현 가능한 형태로 고정

## J1. 이메일 로그인 → 인사이트 진입 → 로그아웃

- Priority: P0
- Preconditions:
  - Supabase env 유효
  - 테스트 계정(이메일/비밀번호) 존재
- Steps:
  1. `/login` 접속
  2. 이메일/비밀번호 입력 후 로그인
  3. `/app/insights` 렌더 확인
  4. 로그아웃 버튼 클릭
- Expected results:
  - 로그인 성공 시 앱 셸 표시
  - 로그아웃 후 `/login`으로 복귀
- Expected API/SDK calls:
  - Supabase Auth `signInWithPassword`, `getSession/getUser`, `signOut`
- Data persistence expectation:
  - 세션 쿠키 생성/삭제만 발생, 도메인 데이터 변경 없음
- Screenshots required:
  - 로그인 성공 직후 인사이트
  - 로그아웃 후 로그인 화면

## J2. Google 로그인 (모바일 인앱 브라우저 방어 포함)

- Priority: P0
- Preconditions:
  - Supabase Google provider 활성화
  - redirect URL 설정 완료
- Steps:
  1. 모바일 인앱브라우저 환경에서 `/login` 접속
  2. Google 로그인 버튼 클릭
  3. 외부 브라우저 안내 문구 확인
  4. 외부 브라우저 열기 버튼 클릭
- Expected results:
  - 인앱브라우저 차단 시 명확한 대체 경로 노출
  - 정상 브라우저에서는 OAuth 완료 후 `/app/insights` 복귀
- Expected API/SDK calls:
  - Supabase Auth `signInWithOAuth(provider=google)`
  - `/auth/callback` route 처리
- Data persistence expectation:
  - 신규 사용자면 auth user/profile 생성, 기존 사용자면 세션만 갱신
- Screenshots required:
  - 인앱브라우저 경고 상태
  - OAuth 완료 후 인사이트 화면

## J3. Daily Flow: 일기 입력 → 파싱 → 1탭 보정(window chip) → 저장

- Priority: P0
- Preconditions:
  - 로그인 완료
  - `/app/daily-flow` 접근 가능
- Steps:
  1. 일기 10자 이상 입력
  2. `AI 분석하기` 클릭(파싱)
  3. confirm 화면에서 `시간 정보 없음` 항목에 시간대 칩 1개 선택
  4. `확인 & 저장` 클릭
- Expected results:
  - 파싱 결과 카드 표시
  - window 칩 선택 반영
  - 저장 성공 시 `저장 완료` 단계로 이동
- Expected API calls:
  - `POST /api/parse-diary`
  - `POST /api/logs`
  - `GET /api/logs?date=...` (재조회/동기화)
  - telemetry: `POST /api/trends/cohort/event` (비차단)
- Data persistence expectation:
  - `activity_logs`에 entries/meta/note 저장
  - 저장 후 재진입 시 동일 데이터 표시
- Screenshots required:
  - confirm 화면(칩 선택 전/후)
  - 저장 완료 상태

## J4. Daily Flow: 저장 후 AI 분석 → Report 화면 이동

- Priority: P0
- Preconditions:
  - J3 저장 완료 상태
- Steps:
  1. Daily Flow 완료 단계에서 `AI 분석` 클릭
  2. `/app/reports/[date]` 이동 확인
  3. 요약 카드/추천 루틴 카드 렌더 확인
- Expected results:
  - analyze 성공 시 보고서 생성
  - 보고서 페이지 렌더 완료
- Expected API calls:
  - `POST /api/analyze`
  - (이후 리포트 화면에서) `GET /api/reports?date=...`
- Data persistence expectation:
  - `ai_reports` upsert/조회 가능
- Screenshots required:
  - analyze 완료 직후 report 화면

## J5. Report 조회: 404는 오류가 아니라 빈 상태로 처리

- Priority: P0
- Preconditions:
  - 리포트가 없는 날짜 존재
- Steps:
  1. `/app/reports/{no-report-date}` 접속
  2. 빈 상태 카드 확인
  3. `리포트 만들기` 또는 `Analyze` 클릭 후 생성 재시도
- Expected results:
  - 404 시 치명적 에러 배너 대신 empty state
  - 재분석 시 정상 생성 가능
- Expected API calls:
  - `GET /api/reports?date=...` (404 허용)
  - `POST /api/analyze`
- Data persistence expectation:
  - analyze 후 해당 날짜 리포트가 캐시/서버 모두 반영
- Screenshots required:
  - 404 empty state
  - 재생성 성공 후 report 상태

## J6. 설정 패널: 개인설정 저장 → 코호트 비교 기준 진입

- Priority: P0
- Preconditions:
  - 로그인 완료
- Steps:
  1. 인사이트에서 `비교 기준 조정` 또는 설정(FAB) 진입
  2. `개인설정` 탭에서 4개 필수 항목 선택
  3. 저장 클릭
  4. 인사이트 코호트 카드로 복귀
- Expected results:
  - 저장 성공 메시지
  - 코호트 카드의 상태/문구가 설정 기반으로 유지
- Expected API calls:
  - `GET /api/preferences/profile`
  - `PUT /api/preferences/profile`
  - `GET /api/trends/cohort`
- Data persistence expectation:
  - `profiles`에 preference 필드 반영
- Screenshots required:
  - 저장 전/후 profile 탭
  - 인사이트 코호트 카드

## J7. 설정 패널: 회원탈퇴

- Priority: P0
- Preconditions:
  - 로그인 사용자
  - API의 `SUPABASE_SERVICE_ROLE_KEY` 유효
- Steps:
  1. 설정 패널 `계정` 탭 진입
  2. `회원탈퇴` 클릭 후 확인
  3. `/login?deleted=1` 리다이렉트 확인
  4. 동일 계정으로 재로그인 불가 확인
- Expected results:
  - 계정 삭제 API 성공
  - 세션 종료 및 로그인 화면 이동
- Expected API calls:
  - `DELETE /api/preferences/account`
  - Supabase Auth Admin delete user
- Data persistence expectation:
  - auth user 제거
  - 관련 사용자 데이터 접근 불가
- Screenshots required:
  - 계정 탭에서 탈퇴 버튼
  - 탈퇴 후 로그인 화면

## J8. 설정 패널: 데이터 전체 초기화

- Priority: P0
- Preconditions:
  - 사용자 로그/리포트 데이터 존재
- Steps:
  1. 설정 패널 `데이터 제어` 탭 진입
  2. `데이터 전체 초기화` 클릭 및 확인
  3. Daily Flow/Report 재진입
- Expected results:
  - 초기화 완료 메시지
  - 로그/리포트가 비어 있는 상태로 표시
- Expected API calls:
  - `DELETE /api/preferences/data`
  - 이후 `GET /api/logs`, `GET /api/reports` 빈 상태
- Data persistence expectation:
  - `activity_logs`, `ai_reports`의 해당 user 데이터 제거
- Screenshots required:
  - 초기화 확인 다이얼로그
  - 초기화 후 빈 상태 화면

## J9. Free → Pro 결제 시작 (설정 패널 내)

- Priority: P0
- Preconditions:
  - free 플랜 사용자
  - Stripe 설정 상태(활성/비활성) 확인 가능
- Steps:
  1. 설정 패널 `계정` 탭 진입
  2. `Start Pro` 클릭
  3. Stripe 활성 시 checkout URL 리다이렉트, 비활성 시 안내 문구 확인
- Expected results:
  - 결제 활성 환경: checkout 세션 생성 성공
  - 비활성 환경: 핵심 기능 사용 가능 안내 + graceful fallback
- Expected API calls:
  - `GET /api/stripe/status`
  - `POST /api/stripe/create-checkout-session`
- Data persistence expectation:
  - Stripe webhook 후 `subscriptions` 반영(통합 플로우)
- Screenshots required:
  - 계정 탭의 billing 섹션
  - checkout 리다이렉트 직전 상태

## J10. Recovery 재시작 엔트리(플래그 ON 시)

- Priority: P0 (flagged flow)
- Preconditions:
  - `RECOVERY_V1_ENABLED=true`
  - 필요 시 `RECOVERY_NUDGE_ENABLED=true`
  - open recovery session 또는 pending nudge 데이터 존재
- Steps:
  1. `/app/insights` 진입
  2. recovery card/nudge 표시 확인
  3. nudge `확인` 클릭(ack)
  4. Daily Flow 재시작 링크 이동
- Expected results:
  - 플래그 ON 환경에서만 카드/알림 표시
  - ack는 멱등 처리(재요청 안전)
- Expected API calls:
  - `GET /api/recovery/active`
  - `GET /api/recovery/nudge`
  - `POST /api/recovery/nudge/ack`
- Data persistence expectation:
  - `recovery_nudges` ack 상태 업데이트
  - `recovery_sessions` 상태 조회 가능
- Screenshots required:
  - 인사이트 recovery 카드
  - nudge ack 후 상태

