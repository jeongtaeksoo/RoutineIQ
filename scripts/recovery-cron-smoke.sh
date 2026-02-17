#!/usr/bin/env bash
set -euo pipefail

API_BASE_URL="${API_BASE_URL:-${1:-http://127.0.0.1:8000}}"
API_BASE_URL="${API_BASE_URL%/}"
MODE="${MODE:-off}" # off|on
TOKEN="${RECOVERY_CRON_TOKEN:-}"

if [[ "$MODE" != "off" && "$MODE" != "on" ]]; then
  echo "[recovery-cron-smoke] FAIL: MODE must be 'off' or 'on'"
  exit 2
fi

echo "[recovery-cron-smoke] target=${API_BASE_URL} mode=${MODE}"

health_code="$(curl -sS -o /tmp/recovery_cron_health.json -w '%{http_code}' "${API_BASE_URL}/health")"
if [[ "$health_code" != "200" ]]; then
  echo "[recovery-cron-smoke] FAIL: /health status=${health_code}"
  exit 1
fi

call_cron() {
  local name="$1"
  local path="$2"
  local out="/tmp/recovery_cron_${name}.json"

  local status
  if [[ -n "$TOKEN" ]]; then
    status="$(
      curl -sS -X POST "${API_BASE_URL}${path}" \
        -H "X-Recovery-Cron-Token: ${TOKEN}" \
        -o "$out" \
        -w '%{http_code}'
    )"
  else
    status="$(
      curl -sS -X POST "${API_BASE_URL}${path}" \
        -o "$out" \
        -w '%{http_code}'
    )"
  fi
  local body
  body="$(cat "$out")"

  echo "[recovery-cron-smoke] ${name}: status=${status}"
  echo "[recovery-cron-smoke] ${name}: body=${body}"

  case "$status" in
    200)
      echo "[recovery-cron-smoke] ${name}: OK"
      return 0
      ;;
    401|403)
      echo "[recovery-cron-smoke] ${name}: AUTH ERROR (check X-Recovery-Cron-Token / RECOVERY_CRON_TOKEN)"
      return 21
      ;;
    404)
      echo "[recovery-cron-smoke] ${name}: NOT FOUND (flag disabled or route hidden)"
      return 24
      ;;
    503)
      echo "[recovery-cron-smoke] ${name}: PRECHECK FAILED (token missing, migration missing, or service unavailable)"
      return 23
      ;;
    5*)
      echo "[recovery-cron-smoke] ${name}: SERVER ERROR (inspect logs/Sentry with correlation ID)"
      return 25
      ;;
    *)
      echo "[recovery-cron-smoke] ${name}: UNEXPECTED STATUS"
      return 29
      ;;
  esac
}

auto_rc=0
nudge_rc=0
call_cron "auto_lapse" "/api/recovery/cron/auto-lapse" || auto_rc=$?
call_cron "nudge" "/api/recovery/cron/nudge" || nudge_rc=$?

if [[ "$MODE" == "off" ]]; then
  if [[ "$auto_rc" -eq 24 && "$nudge_rc" -eq 24 ]]; then
    echo "[recovery-cron-smoke] PASS: OFF mode verified (both 404)"
    exit 0
  fi
  echo "[recovery-cron-smoke] FAIL: OFF mode expected both endpoints to return 404"
  exit 1
fi

if [[ "$MODE" == "on" ]]; then
  if [[ -z "$TOKEN" ]]; then
    echo "[recovery-cron-smoke] WARN: MODE=on without RECOVERY_CRON_TOKEN will likely fail with 401/503"
  fi
  if [[ "$auto_rc" -eq 0 && "$nudge_rc" -eq 0 ]]; then
    echo "[recovery-cron-smoke] PASS: ON mode verified (both 200)"
    exit 0
  fi
  echo "[recovery-cron-smoke] FAIL: ON mode expected both endpoints to return 200"
  exit 1
fi
