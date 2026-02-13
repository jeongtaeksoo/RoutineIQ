#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB_DIR="$ROOT_DIR/apps/web"
API_DIR="$ROOT_DIR/apps/api"
API_PYTHON_BIN="${API_PYTHON_BIN:-python3.12}"

read_env_value() {
  local file="$1"
  local key="$2"
  python3 - "$file" "$key" <<'PY'
import sys
from pathlib import Path
f=Path(sys.argv[1])
k=sys.argv[2]
if not f.exists():
    print("")
    raise SystemExit(0)
for raw in f.read_text(encoding="utf-8").splitlines():
    line=raw.strip()
    if (not line) or line.startswith("#") or "=" not in line:
        continue
    kk,v=line.split("=",1)
    if kk.strip()==k:
        print(v.strip().strip("'\""))
        break
else:
    print("")
PY
}

if [[ ! -f "$API_DIR/.env" ]]; then
  echo "[staging-smoke] missing $API_DIR/.env"
  exit 1
fi

if [[ ! -f "$WEB_DIR/.env.local" ]]; then
  echo "[staging-smoke] missing $WEB_DIR/.env.local"
  exit 1
fi

API_BASE_URL="$(grep -E '^NEXT_PUBLIC_API_BASE_URL=' "$WEB_DIR/.env.local" | tail -n 1 | cut -d'=' -f2- | tr -d '\"' | tr -d "'" || true)"
if [[ -z "${API_BASE_URL:-}" ]]; then
  API_BASE_URL="http://127.0.0.1:8000"
fi
API_BASE_URL="${API_BASE_URL%/}"

FILE_SUPABASE_URL="$(read_env_value "$WEB_DIR/.env.local" "NEXT_PUBLIC_SUPABASE_URL")"
FILE_SUPABASE_ANON_KEY="$(read_env_value "$WEB_DIR/.env.local" "NEXT_PUBLIC_SUPABASE_ANON_KEY")"
FILE_SUPABASE_SERVICE_ROLE_KEY="$(read_env_value "$API_DIR/.env" "SUPABASE_SERVICE_ROLE_KEY")"
FILE_STRIPE_SECRET_KEY="$(read_env_value "$API_DIR/.env" "STRIPE_SECRET_KEY")"
FILE_STRIPE_PRICE_ID_PRO="$(read_env_value "$API_DIR/.env" "STRIPE_PRICE_ID_PRO")"
export NEXT_PUBLIC_SUPABASE_URL="${NEXT_PUBLIC_SUPABASE_URL:-$FILE_SUPABASE_URL}"
export NEXT_PUBLIC_SUPABASE_ANON_KEY="${NEXT_PUBLIC_SUPABASE_ANON_KEY:-$FILE_SUPABASE_ANON_KEY}"
export SUPABASE_SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-$FILE_SUPABASE_SERVICE_ROLE_KEY}"
if [[ -z "${NEXT_PUBLIC_SUPABASE_URL:-}" || -z "${NEXT_PUBLIC_SUPABASE_ANON_KEY:-}" || -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]]; then
  echo "[staging-smoke] missing required Supabase env for live smoke"
  exit 1
fi

if [[ "${FORCE_STRIPE_SMOKE_FAKE:-0}" == "1" ]]; then
  export STRIPE_SMOKE_FAKE=1
fi
if [[ -z "${STRIPE_SMOKE_FAKE:-}" ]]; then
  # Auto-enable fake Stripe mode for staging smoke when placeholder keys are detected.
  if [[ "$FILE_STRIPE_SECRET_KEY" == *"..."* || "$FILE_STRIPE_PRICE_ID_PRO" == *"..."* ]]; then
    export STRIPE_SMOKE_FAKE=1
  fi
fi
if [[ "${STRIPE_SMOKE_FAKE:-0}" == "1" ]]; then
  echo "[staging-smoke] stripe smoke fake mode enabled"
fi

API_PID=""
cleanup() {
  if [[ -n "${API_PID}" ]] && kill -0 "${API_PID}" 2>/dev/null; then
    kill "${API_PID}" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

if [[ "$API_BASE_URL" =~ ^https?://(127\.0\.0\.1|localhost)(:([0-9]+))?$ ]]; then
  PORT="${SMOKE_API_PORT:-8012}"
  API_BASE_URL="http://127.0.0.1:${PORT}"
  if ! command -v "$API_PYTHON_BIN" >/dev/null 2>&1; then
    echo "[staging-smoke] missing required interpreter: $API_PYTHON_BIN"
    exit 1
  fi
  (
    cd "$API_DIR"
    if [[ -x ".venv/bin/python" ]]; then
      VENV_VER="$(./.venv/bin/python -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')"
      if [[ "$VENV_VER" != "3.12" ]]; then
        rm -rf .venv
      fi
    fi
    if [[ ! -d ".venv" ]]; then
      "$API_PYTHON_BIN" -m venv .venv
      ./.venv/bin/python -m pip install -q --upgrade pip
      ./.venv/bin/python -m pip install -q -r requirements.txt
    fi
  )
  if command -v lsof >/dev/null 2>&1; then
    OLD_PIDS="$(lsof -ti tcp:"$PORT" || true)"
    if [[ -n "$OLD_PIDS" ]]; then
      echo "[staging-smoke] clearing existing listeners on ${PORT}"
      # shellcheck disable=SC2086
      kill $OLD_PIDS >/dev/null 2>&1 || true
      sleep 1
    fi
  fi
  echo "[staging-smoke] starting local api on 127.0.0.1:${PORT}"
  (
    cd "$API_DIR"
    ./.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port "$PORT"
  ) >/tmp/routineiq_staging_smoke_api.log 2>&1 &
  API_PID=$!
  sleep 2
  curl -sf "${API_BASE_URL}/health" >/dev/null
fi

echo "[staging-smoke] live F2 e2e"
(
  cd "$WEB_DIR"
  NEXT_PUBLIC_API_BASE_URL="$API_BASE_URL" E2E_MODE=live npm run test:e2e:live
)

echo "[staging-smoke] api+db+stripe live smoke"
(
  cd "$WEB_DIR"
  NEXT_PUBLIC_API_BASE_URL="$API_BASE_URL" node scripts/live-smoke.mjs
)

echo "[staging-smoke] PASS"
