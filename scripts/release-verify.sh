#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB_DIR="$ROOT_DIR/apps/web"
API_DIR="$ROOT_DIR/apps/api"
API_PYTHON_BIN="${API_PYTHON_BIN:-python3.12}"

# Avoid Node warning noise: NO_COLOR and FORCE_COLOR should not be set together.
unset NO_COLOR || true

RUN_WEB_E2E="${RUN_WEB_E2E:-1}"
RUN_LIVE_SMOKE="${RUN_LIVE_SMOKE:-1}"
RUN_I18N_AUDIT="${RUN_I18N_AUDIT:-1}"
I18N_STRICT_UNUSED="${I18N_STRICT_UNUSED:-1}"
STRICT_MYPY="${STRICT_MYPY:-0}"
VERIFY_FAST="${VERIFY_FAST:-0}"

WEB_E2E_SMOKE_CMD=(
  npx playwright test
  e2e/app-entry.spec.ts
  e2e/settings-entrypoints.spec.ts
  e2e/settings-modal-layout.spec.ts
  e2e/settings-modal-navigation.spec.ts
  e2e/settings-account-ux.spec.ts
  e2e/settings-account-pro-cta.spec.ts
  e2e/settings-danger.spec.ts
  e2e/account-delete.spec.ts
  e2e/analyze-cancel.spec.ts
  e2e/profile-warning-dismiss.spec.ts
  e2e/trust-badge.spec.ts
  e2e/billing-entry-source.spec.ts
  e2e/billing-context.spec.ts
  e2e/billing-email-validation.spec.ts
  e2e/error-reference.spec.ts
  e2e/billing-retry.spec.ts
  e2e/paywall-cap.spec.ts
  --project=chromium
)

usage() {
  cat <<'USAGE'
Usage: scripts/release-verify.sh [options]

Options:
  --fast              Skip Web E2E and live smoke (lint/typecheck/build + API checks only)
  --skip-web-e2e      Skip Playwright smoke during web checks
  --skip-live-smoke   Skip scripts/staging-smoke.sh
  --skip-i18n-audit   Skip scripts/i18n-audit.sh
  --relaxed-i18n      Allow unused i18n keys (disable strict-unused mode)
  --strict-mypy       Fail on mypy errors (default: warn only)
  -h, --help          Show this help

Environment overrides:
  RUN_WEB_E2E=0|1
  RUN_LIVE_SMOKE=0|1
  RUN_I18N_AUDIT=0|1
  I18N_STRICT_UNUSED=0|1
  STRICT_MYPY=0|1
  VERIFY_FAST=0|1
  API_PYTHON_BIN=python3.12
USAGE
}

while (($# > 0)); do
  case "$1" in
    --fast)
      VERIFY_FAST=1
      shift
      ;;
    --skip-web-e2e)
      RUN_WEB_E2E=0
      shift
      ;;
    --skip-live-smoke)
      RUN_LIVE_SMOKE=0
      shift
      ;;
    --skip-i18n-audit)
      RUN_I18N_AUDIT=0
      shift
      ;;
    --relaxed-i18n)
      I18N_STRICT_UNUSED=0
      shift
      ;;
    --strict-mypy)
      STRICT_MYPY=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "[release-verify] Unknown option: $1"
      usage
      exit 2
      ;;
  esac
done

if [[ "$VERIFY_FAST" == "1" ]]; then
  RUN_WEB_E2E=0
  RUN_LIVE_SMOKE=0
fi

echo "[release-verify] config: RUN_WEB_E2E=$RUN_WEB_E2E RUN_LIVE_SMOKE=$RUN_LIVE_SMOKE RUN_I18N_AUDIT=$RUN_I18N_AUDIT I18N_STRICT_UNUSED=$I18N_STRICT_UNUSED STRICT_MYPY=$STRICT_MYPY VERIFY_FAST=$VERIFY_FAST"

echo "[release-verify] G1 web checks"
(
  cd "$WEB_DIR"
  npm run lint
  npm run typecheck
  if [[ "$RUN_I18N_AUDIT" == "1" ]]; then
    if [[ "$I18N_STRICT_UNUSED" == "1" ]]; then
      "$ROOT_DIR/scripts/i18n-audit.sh" --strict-unused
    else
      "$ROOT_DIR/scripts/i18n-audit.sh"
    fi
  else
    echo "[release-verify] i18n audit skipped"
  fi
  npm run build
  if [[ "$RUN_WEB_E2E" == "1" ]]; then
    "${WEB_E2E_SMOKE_CMD[@]}"
  else
    echo "[release-verify] web e2e skipped"
  fi
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
  ./.venv/bin/python -m ruff check app
  CHANGED_PY="$(
    git -C "$ROOT_DIR" diff --name-only -- '*.py' \
      | awk '/^apps\/api\/app\// {sub(/^apps\/api\//, "", $0); print $0}'
  )"
  if [[ -n "$CHANGED_PY" ]]; then
    # shellcheck disable=SC2086
    ./.venv/bin/python -m black --check $CHANGED_PY
    # shellcheck disable=SC2086
    if [[ "$STRICT_MYPY" == "1" ]]; then
      ./.venv/bin/python -m mypy $CHANGED_PY --ignore-missing-imports
    else
      ./.venv/bin/python -m mypy $CHANGED_PY --ignore-missing-imports || true
    fi
  else
    ./.venv/bin/python -m black --check app
    if [[ "$STRICT_MYPY" == "1" ]]; then
      ./.venv/bin/python -m mypy app --ignore-missing-imports
    else
      ./.venv/bin/python -m mypy app --ignore-missing-imports || true
    fi
  fi
  ./.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8010 >/tmp/routineiq_release_verify_api.log 2>&1 &
  API_PID=$!
  sleep 2
  curl -sf http://127.0.0.1:8010/health >/dev/null
  kill "$API_PID" >/dev/null 2>&1 || true
)

if [[ "$RUN_LIVE_SMOKE" == "1" ]]; then
  echo "[release-verify] G3/G4 live smoke"
  "$ROOT_DIR/scripts/staging-smoke.sh"
else
  echo "[release-verify] live smoke skipped"
fi

echo "[release-verify] PASS"
