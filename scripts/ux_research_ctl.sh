#!/bin/bash

set -Eeuo pipefail

ROOT="/Users/taeksoojung/Desktop/RutineIQ"
WATCHDOG="$ROOT/scripts/ux_research_watchdog.sh"
RUNNER="$ROOT/scripts/ux_research_runner.sh"
STATE_FILE="$ROOT/docs/UX_RESEARCH_STATE.json"
PID_FILE="$ROOT/logs/ux_research.pid"
WATCHDOG_PID_FILE="$ROOT/logs/ux_research_watchdog.pid"
OUT_LOG="$ROOT/logs/ux_research.out"
STOP_FLAG="/tmp/rutineiq_ux_research.stop"
LAUNCH_LABEL="com.rutineiq.uxresearch.watchdog"

mkdir -p "$ROOT/logs" "$ROOT/docs"

ts() {
  date +"%Y-%m-%d %H:%M:%S %Z"
}

is_alive() {
  local pid="$1"
  [[ -n "${pid:-}" ]] || return 1
  kill -0 "$pid" 2>/dev/null
}

read_pid_file() {
  local path="$1"
  if [[ -f "$path" ]]; then
    tr -d '[:space:]' <"$path"
  fi
}

start_cmd() {
  rm -f "$STOP_FLAG"
  local wpid
  wpid="$(read_pid_file "$WATCHDOG_PID_FILE" || true)"
  if is_alive "${wpid:-}"; then
    echo "watchdog already running (pid=$wpid)"
  else
    local new_wpid
    new_wpid="$(
      /usr/bin/python3 - "$WATCHDOG" "$OUT_LOG" <<'PY'
import os
import subprocess
import sys

watchdog = sys.argv[1]
out_log = sys.argv[2]

with open("/dev/null", "rb") as devnull, open(out_log, "ab", buffering=0) as out:
    proc = subprocess.Popen(
        [watchdog],
        stdin=devnull,
        stdout=out,
        stderr=out,
        start_new_session=True,
        close_fds=True,
    )

print(proc.pid)
PY
    )"
    echo "$new_wpid" >"$WATCHDOG_PID_FILE"
    echo "watchdog started (pid=$new_wpid)"
  fi
}

status_cmd() {
  local wpid rpid
  wpid="$(read_pid_file "$WATCHDOG_PID_FILE" || true)"
  rpid="$(read_pid_file "$PID_FILE" || true)"
  echo "timestamp: $(ts)"
  echo "watchdog: ${wpid:-none} ($(is_alive "${wpid:-}" && echo running || echo stopped))"
  echo "runner: ${rpid:-none} ($(is_alive "${rpid:-}" && echo running || echo stopped))"
  if [[ -f "$STATE_FILE" ]]; then
    python3 - "$STATE_FILE" <<'PY'
import json
import sys
from pathlib import Path
path = Path(sys.argv[1])
try:
    state = json.loads(path.read_text(encoding="utf-8"))
except Exception as exc:
    print(f"state: unreadable ({exc})")
    raise SystemExit(0)
print(f"state.status: {state.get('status','unknown')}")
print(f"state.started_at: {state.get('started_at','-')}")
print(f"state.last_update: {state.get('last_update','-')}")
print(f"state.elapsed_seconds: {state.get('elapsed_seconds',0)}")
print(f"state.effective_cycles: {state.get('effective_cycles',0)}")
print(f"state.confirmed_claims: {state.get('confirmed_claims',0)}")
print(f"state.hypothesis_claims: {state.get('hypothesis_claims',0)}")
print(f"state.current_cycle: {state.get('current_cycle',0)}")
print(f"state.last_note: {state.get('last_note','-')}")
PY
  else
    echo "state: not found ($STATE_FILE)"
  fi
}

tail_cmd() {
  if [[ -f "$OUT_LOG" ]]; then
    tail -n 120 "$OUT_LOG"
  else
    echo "log file not found: $OUT_LOG"
  fi
}

stop_cmd() {
  touch "$STOP_FLAG"
  local rpid wpid
  rpid="$(read_pid_file "$PID_FILE" || true)"
  wpid="$(read_pid_file "$WATCHDOG_PID_FILE" || true)"
  if is_alive "${rpid:-}"; then
    kill -TERM "$rpid" 2>/dev/null || true
    echo "runner stop signal sent (pid=$rpid)"
  fi
  if is_alive "${wpid:-}"; then
    kill -TERM "$wpid" 2>/dev/null || true
    echo "watchdog stop signal sent (pid=$wpid)"
  fi
  local uid
  uid="$(id -u)"
  launchctl bootout "gui/${uid}/${LAUNCH_LABEL}" >/dev/null 2>&1 || true
  sleep 1
  rm -f "$PID_FILE" "$WATCHDOG_PID_FILE"
  echo "stop completed"
}

usage() {
  cat <<'EOF'
usage: ux_research_ctl.sh {start|status|tail|stop}
EOF
}

case "${1:-}" in
  start) start_cmd ;;
  status) status_cmd ;;
  tail) tail_cmd ;;
  stop) stop_cmd ;;
  *) usage; exit 1 ;;
esac
