# Release Readiness Checklist

릴리즈 판단 기준: 아래 항목 모두 충족 시에만 진행

## A. 자동 테스트 게이트
- [x] Web lint PASS  
  `cd /Users/taeksoojung/Desktop/RutineIQ/apps/web && npm run lint`
- [x] Web typecheck PASS  
  `cd /Users/taeksoojung/Desktop/RutineIQ/apps/web && npm run typecheck`
- [x] Web build PASS  
  `cd /Users/taeksoojung/Desktop/RutineIQ/apps/web && npm run build`
- [x] Web E2E PASS  
  `cd /Users/taeksoojung/Desktop/RutineIQ/apps/web && npm run test:e2e`
- [x] API pytest PASS  
  `cd /Users/taeksoojung/Desktop/RutineIQ/apps/api && .venv/bin/python -m pytest tests/ -v --tb=short`
- [x] 릴리즈 통합 검증 PASS  
  `cd /Users/taeksoojung/Desktop/RutineIQ && ./scripts/release-verify.sh`

## B. 수동 스모크
- [x] `/Users/taeksoojung/Desktop/RutineIQ/docs/SMOKE_TEST_CHECKLIST.md` 핵심 경로 PASS (자동화 스모크 + live F2)

## C. 플래그/회귀
- [x] `RECOVERY_V1_ENABLED=false`, `AUTO_LAPSE_ENABLED=false`, `RECOVERY_NUDGE_ENABLED=false` 기본 경로 회귀 0
- [x] 플래그 ON 기능은 OFF 경로를 오염시키지 않음

## D. 오류 처리 품질
- [x] 401/403 시 로그인/권한 안내가 명확함
- [x] 404(데이터 없음)는 empty state로 처리됨
- [x] 5xx/timeout 시 재시도 액션과 비차단 UI 제공
- [x] 무한 로딩/무한 재시도 없음

## E. 관측성/운영
- [x] 서버 에러가 `system_errors` 또는 모니터링(Sentry)로 수집됨
- [x] 핵심 장애 시 correlation id/hint 확인 가능
- [x] 민감정보(API key/token)가 로그에 노출되지 않음

## F. 보안 기본
- [x] 보호 엔드포인트 인증 경계 정상
- [x] 관리자 페이지 role 경계 정상
- [x] 계정 삭제/데이터 삭제는 본인 계정 범위만 처리

## G. 성능 기본
- [x] `/app/insights`, `/app/daily-flow`, `/app/reports/[date]` 초기 인터랙션 지연 과도하지 않음
- [x] 주요 API 호출 timeout 정책 적용됨(무한 대기 없음)

## H. 롤백 준비
- [x] 최근 배포 커밋 SHA 기록
- [x] 장애 시 즉시 revert 가능한 최소 단위 커밋 확인
- [x] 운영 문서(runbook/checklist) 최신 상태

---

검증 기준 시각: 2026-02-19 (local)
- API: `250 passed`
- Web E2E: `20 passed`
- 통합: `[release-verify] PASS`, `LIVE_SMOKE_OK`
