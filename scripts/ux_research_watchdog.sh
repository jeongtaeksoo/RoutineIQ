#!/bin/bash

set -Euo pipefail

ROOT="/Users/taeksoojung/Desktop/RutineIQ"
RUNNER="$ROOT/scripts/ux_research_runner.sh"
STATE_FILE="$ROOT/docs/UX_RESEARCH_STATE.json"
PID_FILE="$ROOT/logs/ux_research.pid"
OUT_LOG="$ROOT/logs/ux_research.out"
WATCHDOG_PID_FILE="$ROOT/logs/ux_research_watchdog.pid"
STOP_FLAG="/tmp/rutineiq_ux_research.stop"
LOCK_FILE="/tmp/rutineiq_ux_research.lock"
WATCHDOG_LOCK_FILE="/tmp/rutineiq_ux_watchdog.lock"

mkdir -p "$ROOT/logs" "$ROOT/docs"
touch "$OUT_LOG"

ts() {
  date +"%Y-%m-%d %H:%M:%S %Z"
}

log() {
  printf "[%s] [watchdog:%s] %s\n" "$(ts)" "$$" "$*" >>"$OUT_LOG"
}

is_alive() {
  local pid="$1"
  [[ -n "${pid:-}" ]] || return 1
  kill -0 "$pid" 2>/dev/null
}

read_runner_pid() {
  if [[ -f "$PID_FILE" ]]; then
    tr -d '[:space:]' <"$PID_FILE"
  fi
}

read_lock_pid() {
  if [[ -f "$LOCK_FILE" ]]; then
    tr -d '[:space:]' <"$LOCK_FILE"
  fi
}

state_completed() {
  if [[ ! -f "$STATE_FILE" ]]; then
    echo "0"
    return 0
  fi
  python3 - "$STATE_FILE" <<'PY'
import json
import sys
from pathlib import Path
path = Path(sys.argv[1])
try:
    data = json.loads(path.read_text(encoding="utf-8"))
except Exception:
    print("0")
    raise SystemExit(0)
print("1" if data.get("status") == "completed" else "0")
PY
}

spawn_runner() {
  nohup "$RUNNER" >>"$OUT_LOG" 2>&1 &
  local pid="$!"
  echo "$pid" >"$PID_FILE"
  log "runner spawned pid=$pid"
}

cleanup() {
  exit_code="$?"
  log "watchdog exiting (code=${exit_code})"
  if [[ -f "$WATCHDOG_LOCK_FILE" ]]; then
    lock_pid="$(tr -d '[:space:]' <"$WATCHDOG_LOCK_FILE" 2>/dev/null || true)"
    if [[ "${lock_pid:-}" == "$$" ]]; then
      python3 - <<'PY'
import os
p='/tmp/rutineiq_ux_watchdog.lock'
try:
    os.unlink(p)
except FileNotFoundError:
    pass
PY
    fi
  fi
  rm -f "$WATCHDOG_PID_FILE" 2>/dev/null || true
}

trap cleanup EXIT

if [[ -f "$WATCHDOG_LOCK_FILE" ]]; then
  old_pid="$(tr -d '[:space:]' <"$WATCHDOG_LOCK_FILE" 2>/dev/null || true)"
  if is_alive "${old_pid:-}"; then
    log "another watchdog already active pid=$old_pid; exiting duplicate instance"
    exit 0
  fi
  python3 - <<'PY'
import os
p='/tmp/rutineiq_ux_watchdog.lock'
try:
    os.unlink(p)
except FileNotFoundError:
    pass
PY
fi

echo "$$" >"$WATCHDOG_LOCK_FILE"
echo "$$" >"$WATCHDOG_PID_FILE"
log "watchdog started"

while true; do
  if [[ -f "$STOP_FLAG" ]]; then
    rp="$(read_runner_pid || true)"
    if is_alive "${rp:-}"; then
      log "stop flag detected; terminating runner pid=${rp}"
      kill -TERM "$rp" 2>/dev/null || true
    fi
    rm -f "$PID_FILE"
    log "watchdog exiting due to stop flag"
    exit 0
  fi

  if [[ "$(state_completed)" == "1" ]]; then
    rm -f "$PID_FILE"
    log "state is completed; watchdog exiting"
    exit 0
  fi

  rp="$(read_runner_pid || true)"
  if is_alive "${rp:-}"; then
    sleep 10
    continue
  fi

  # If lock says another runner is alive, sync PID file and continue.
  lp="$(read_lock_pid || true)"
  if is_alive "${lp:-}"; then
    echo "$lp" >"$PID_FILE"
    log "synced pid from lock: $lp"
    sleep 10
    continue
  fi

  spawn_runner
  sleep 10
done
