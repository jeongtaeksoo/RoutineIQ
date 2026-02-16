# Cohort Trend Config

RutineIQ 코호트 카드의 공개 기준과 신뢰도 레벨은 아래 환경변수로 제어합니다.

## Environment Variables

- `COHORT_PREVIEW_SAMPLE_SIZE` (default: `20`)
  - `n < preview` 구간에서는 코호트 트렌드를 노출하지 않습니다.
  - `preview <= n < min` 구간에서는 `preview_mode=true`로 참고용 미리보기만 노출합니다.
- `COHORT_MIN_SAMPLE_SIZE` (default: `50`)
  - `n >= min` 구간에서 정식 비교(랭크/실행팁 포함)를 노출합니다.
- `COHORT_WINDOW_DAYS` (default: `14`)
  - 코호트/개인 지표 계산 기준 기간입니다.

## Confidence Level Boundaries

- `low`: `n < COHORT_MIN_SAMPLE_SIZE`
- `medium`: `COHORT_MIN_SAMPLE_SIZE <= n < 2 * COHORT_MIN_SAMPLE_SIZE`
- `high`: `n >= 2 * COHORT_MIN_SAMPLE_SIZE`

기본값 기준 예시:
- `49 -> low`, `50 -> medium`, `99 -> medium`, `100 -> high`

## Rollback

- 기존 정책으로 즉시 원복하려면 `COHORT_PREVIEW_SAMPLE_SIZE=COHORT_MIN_SAMPLE_SIZE`로 설정하면 됩니다(미리보기 구간 비활성화).
