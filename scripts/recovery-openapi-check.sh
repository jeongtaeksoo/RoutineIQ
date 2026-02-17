#!/usr/bin/env bash
set -euo pipefail

API_BASE_URL="${1:-${API_BASE_URL:-http://127.0.0.1:8000}}"
API_BASE_URL="${API_BASE_URL%/}"
OPENAPI_URL="${API_BASE_URL}/openapi.json"

required_paths=(
  "/api/recovery/lapse"
  "/api/recovery/active"
  "/api/recovery/mode-opened"
  "/api/recovery/checkin"
  "/api/recovery/protocol/start"
  "/api/recovery/action/complete"
  "/api/recovery/complete"
  "/api/recovery/summary"
  "/api/recovery/cron/auto-lapse"
  "/api/recovery/cron/nudge"
  "/api/recovery/nudge"
  "/api/recovery/nudge/ack"
)

echo "[recovery-openapi-check] target=${API_BASE_URL}"

tmp_json="$(mktemp)"
trap 'rm -f "$tmp_json"' EXIT

http_code="$(curl -sS -o "$tmp_json" -w '%{http_code}' "$OPENAPI_URL")"
if [[ "$http_code" != "200" ]]; then
  echo "[recovery-openapi-check] FAIL: openapi fetch status=${http_code} url=${OPENAPI_URL}"
  exit 1
fi

extract_paths() {
  if command -v jq >/dev/null 2>&1; then
    jq -r '.paths | keys[]' "$tmp_json"
    return 0
  fi
  echo "[recovery-openapi-check] INFO: jq is not installed; falling back to python3 parser" >&2
  if ! command -v python3 >/dev/null 2>&1; then
    echo "[recovery-openapi-check] FAIL: jq and python3 are both unavailable" >&2
    return 1
  fi
  python3 - "$tmp_json" <<'PY'
import json, sys
paths = json.load(open(sys.argv[1], encoding='utf-8')).get('paths', {})
for key in sorted(paths):
    print(key)
PY
}

actual_paths=()
while IFS= read -r line; do
  actual_paths+=("$line")
done < <(extract_paths)

echo "[recovery-openapi-check] discovered recovery paths:"
printf '%s\n' "${actual_paths[@]}" | grep '^/api/recovery' || true

missing=0
for path in "${required_paths[@]}"; do
  if ! printf '%s\n' "${actual_paths[@]}" | grep -Fx "$path" >/dev/null 2>&1; then
    echo "[recovery-openapi-check] MISSING: ${path}"
    missing=$((missing + 1))
  fi
done

if [[ $missing -gt 0 ]]; then
  echo "[recovery-openapi-check] FAIL: missing ${missing} required path(s)"
  exit 1
fi

echo "[recovery-openapi-check] PASS: all required recovery paths are present"
