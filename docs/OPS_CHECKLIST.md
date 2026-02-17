# OPS CHECKLIST: Recovery Rollout

1. 배포 대상 SHA가 예상값과 일치하는지 확인한다.
2. 시작 시점에 플래그 3개(`RECOVERY_V1_ENABLED`, `AUTO_LAPSE_ENABLED`, `RECOVERY_NUDGE_ENABLED`)가 모두 `false`인지 확인한다.
3. `RECOVERY_CRON_TOKEN`이 설정되어 있는지 확인한다.
4. 마이그레이션을 순서대로 적용한다.
5. `scripts/recovery-db-preflight.sql`로 테이블/인덱스/정책 존재를 검증한다.
6. `/health`가 200인지 확인한다.
7. `scripts/recovery-openapi-check.sh`로 Recovery 경로 12개를 검증한다.
8. Phase 0에서 기존 핵심 플로우 회귀가 없는지 확인한다.
9. Phase 1로 전환: `RECOVERY_V1_ENABLED=true`만 활성화한다.
10. 수동 Recovery E2E를 1회 완주하고 RT/에러 지표를 점검한다.
11. Phase 2로 전환: `AUTO_LAPSE_ENABLED=true`를 추가 활성화한다.
12. auto-lapse cron을 2회 호출해 open session 중복(>1)이 0인지 확인한다.
13. `auto_lapse_created/suppressed(reason)` 지표를 점검한다.
14. Phase 3로 전환: `RECOVERY_NUDGE_ENABLED=true`를 활성화한다.
15. pending nudge 조회 + ack 2회 멱등 동작을 확인한다.
16. quiet hours / 24h rate limit / reengaged 억제 규칙이 적용되는지 확인한다.
17. 문제 발생 시 해당 단계 플래그만 즉시 OFF 한다.
18. 장애 티켓에는 응답 코드, 재현 명령, correlation ID를 함께 남긴다.
