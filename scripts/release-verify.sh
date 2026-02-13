#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB_DIR="$ROOT_DIR/apps/web"
API_DIR="$ROOT_DIR/apps/api"
API_PYTHON_BIN="${API_PYTHON_BIN:-python3.12}"

echo "[release-verify] G1 web checks"
(
  cd "$WEB_DIR"
  npm run lint
  npm run typecheck
  npm run build
  npm run test:e2e
)

echo "[release-verify] G2 api checks"
if [[ ! -f "$API_DIR/.python-version" ]]; then
  echo "[release-verify] FAIL: missing apps/api/.python-version"
  exit 1
fi
if [[ "$(cat "$API_DIR/.python-version" | tr -d '[:space:]')" != "3.12" ]]; then
  echo "[release-verify] FAIL: apps/api/.python-version must be 3.12"
  exit 1
fi
if ! command -v "$API_PYTHON_BIN" >/dev/null 2>&1; then
  echo "[release-verify] FAIL: $API_PYTHON_BIN is required but not found"
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
  fi
  ./.venv/bin/python -m pip install -q --upgrade pip
  ./.venv/bin/python -m pip install -q -r requirements.txt
  ./.venv/bin/python -m pip install -q ruff black mypy
  ./.venv/bin/python -m compileall -q app
  ./.venv/bin/ruff check app
  CHANGED_PY="$(
    git -C "$ROOT_DIR" diff --name-only -- '*.py' \
      | awk '/^apps\/api\/app\// {sub(/^apps\/api\//, "", $0); print $0}'
  )"
  if [[ -n "$CHANGED_PY" ]]; then
    # Keep checks focused to touched API files to avoid legacy-style churn.
    # shellcheck disable=SC2086
    ./.venv/bin/black --check $CHANGED_PY
    # shellcheck disable=SC2086
    if [[ "${STRICT_MYPY:-0}" == "1" ]]; then
      ./.venv/bin/mypy $CHANGED_PY --ignore-missing-imports
    else
      ./.venv/bin/mypy $CHANGED_PY --ignore-missing-imports || true
    fi
  else
    ./.venv/bin/black --check app
    if [[ "${STRICT_MYPY:-0}" == "1" ]]; then
      ./.venv/bin/mypy app --ignore-missing-imports
    else
      ./.venv/bin/mypy app --ignore-missing-imports || true
    fi
  fi
  ./.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8010 >/tmp/routineiq_release_verify_api.log 2>&1 &
  API_PID=$!
  sleep 2
  curl -sf http://127.0.0.1:8010/health >/dev/null
  kill "$API_PID" >/dev/null 2>&1 || true
)

if [[ "${RUN_LIVE_SMOKE:-1}" == "1" ]]; then
  echo "[release-verify] G3/G4 live smoke"
  "$ROOT_DIR/scripts/staging-smoke.sh"
fi

echo "[release-verify] PASS"
