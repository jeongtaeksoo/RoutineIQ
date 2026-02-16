# Cohort Trend Config

RutineIQ 코호트 카드의 공개 기준과 신뢰도 레벨은 아래 환경변수로 제어합니다.

## Environment Variables

- `COHORT_PREVIEW_SAMPLE_SIZE` (default: `20`)
  - `n < preview` 구간에서는 코호트 트렌드를 노출하지 않습니다.
  - `preview <= n < min` 구간에서는 `preview_mode=true`로 참고용 미리보기만 노출합니다.
- `COHORT_MIN_SAMPLE_SIZE` (default: `50`)
  - `n >= min` 구간에서 정식 비교(랭크/실행팁 포함)를 노출합니다.
- `COHORT_HIGH_CONFIDENCE_SAMPLE_SIZE` (default: `100`)
  - `n >= high` 구간에서 confidence를 `high`로 노출합니다.
- `COHORT_WINDOW_DAYS` (default: `14`)
  - 코호트/개인 지표 계산 기준 기간입니다.

### Threshold Experiment (A/B)

- `COHORT_THRESHOLD_EXPERIMENT_ENABLED` (default: `true`)
  - `true`면 사용자 해시 기반으로 임계값 A/B를 배정합니다.
- `COHORT_THRESHOLD_EXPERIMENT_ROLLOUT_PCT` (default: `50`)
  - candidate 임계값을 적용할 사용자 비율(0~100)입니다.
- `COHORT_EXPERIMENT_PREVIEW_SAMPLE_SIZE` (default: `30`)
- `COHORT_EXPERIMENT_MIN_SAMPLE_SIZE` (default: `80`)
- `COHORT_EXPERIMENT_HIGH_CONFIDENCE_SAMPLE_SIZE` (default: `150`)
  - candidate 그룹의 confidence 경계값입니다.

## Confidence Level Boundaries

- `low`: `n < COHORT_MIN_SAMPLE_SIZE`
- `medium`: `COHORT_MIN_SAMPLE_SIZE <= n < COHORT_HIGH_CONFIDENCE_SAMPLE_SIZE`
- `high`: `n >= COHORT_HIGH_CONFIDENCE_SAMPLE_SIZE`

기본값 기준 예시:
- `49 -> low`, `50 -> medium`, `99 -> medium`, `100 -> high`

## Rollback

- 기존 정책으로 즉시 원복하려면 `COHORT_PREVIEW_SAMPLE_SIZE=COHORT_MIN_SAMPLE_SIZE`로 설정하면 됩니다(미리보기 구간 비활성화).
- 임계값 실험을 즉시 중단하려면 `COHORT_THRESHOLD_EXPERIMENT_ENABLED=false`로 설정하면 control(`20/50/100`)만 사용합니다.
