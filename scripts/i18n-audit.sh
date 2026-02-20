#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
I18N_FILE="$ROOT_DIR/apps/web/src/lib/i18n.ts"
SRC_DIR="$ROOT_DIR/apps/web/src"

STRICT_UNUSED="${STRICT_UNUSED:-0}"
REPORT_PATH="${REPORT_PATH:-}"

usage() {
  cat <<'USAGE'
Usage: scripts/i18n-audit.sh [options]

Options:
  --strict-unused     Fail when declared keys are unused
  --report <path>     Write markdown report to path
  -h, --help          Show this help

Environment:
  STRICT_UNUSED=0|1
  REPORT_PATH=/absolute/or/relative/path.md
USAGE
}

while (($# > 0)); do
  case "$1" in
    --strict-unused)
      STRICT_UNUSED=1
      shift
      ;;
    --report)
      REPORT_PATH="${2:-}"
      if [[ -z "$REPORT_PATH" ]]; then
        echo "[i18n-audit] --report requires a path"
        exit 2
      fi
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "[i18n-audit] Unknown option: $1"
      usage
      exit 2
      ;;
  esac
done

if [[ ! -f "$I18N_FILE" ]]; then
  echo "[i18n-audit] FAIL: missing file $I18N_FILE"
  exit 1
fi

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

extract_type_keys() {
  awk '
    /export type Strings = \{/ { in_type = 1; next }
    in_type && /^\};/ { in_type = 0 }
    in_type {
      if ($0 ~ /^[[:space:]]*[a-zA-Z0-9_]+:[[:space:]]*/) {
        line = $0
        sub(/^[[:space:]]*/, "", line)
        sub(/:.*/, "", line)
        print line
      }
    }
  ' "$I18N_FILE" | sort -u
}

extract_object_keys() {
  local object_name="$1"
  awk -v obj="$object_name" '
    $0 ~ "^const[[:space:]]+"obj":[[:space:]]*Strings[[:space:]]*=[[:space:]]*\\{" { in_obj = 1; next }
    in_obj && /^\};/ { in_obj = 0 }
    in_obj {
      if ($0 ~ /^[[:space:]]*[a-zA-Z0-9_]+:[[:space:]]*/) {
        line = $0
        sub(/^[[:space:]]*/, "", line)
        sub(/:.*/, "", line)
        print line
      }
    }
  ' "$I18N_FILE" | sort -u
}

extract_used_keys() {
  rg -o --no-filename "strings\\.([a-zA-Z0-9_]+)" "$SRC_DIR" \
    | sed -E 's/^strings\.//' \
    | sort -u
}

extract_type_keys > "$TMP_DIR/declared.txt"
extract_used_keys > "$TMP_DIR/used.txt"

comm -23 "$TMP_DIR/declared.txt" "$TMP_DIR/used.txt" > "$TMP_DIR/unused.txt"
comm -13 "$TMP_DIR/declared.txt" "$TMP_DIR/used.txt" > "$TMP_DIR/unknown.txt"

LOCALES=(EN KO JA ZH ES)
> "$TMP_DIR/locale_issues.txt"
for locale in "${LOCALES[@]}"; do
  extract_object_keys "$locale" > "$TMP_DIR/${locale}.txt"
  comm -23 "$TMP_DIR/declared.txt" "$TMP_DIR/${locale}.txt" > "$TMP_DIR/${locale}_missing.txt"
  comm -13 "$TMP_DIR/declared.txt" "$TMP_DIR/${locale}.txt" > "$TMP_DIR/${locale}_extra.txt"
  if [[ -s "$TMP_DIR/${locale}_missing.txt" || -s "$TMP_DIR/${locale}_extra.txt" ]]; then
    {
      echo "[$locale] missing:"
      cat "$TMP_DIR/${locale}_missing.txt"
      echo "[$locale] extra:"
      cat "$TMP_DIR/${locale}_extra.txt"
      echo
    } >> "$TMP_DIR/locale_issues.txt"
  fi
done

DECLARED_COUNT="$(wc -l < "$TMP_DIR/declared.txt" | tr -d ' ')"
USED_COUNT="$(wc -l < "$TMP_DIR/used.txt" | tr -d ' ')"
UNUSED_COUNT="$(wc -l < "$TMP_DIR/unused.txt" | tr -d ' ')"
UNKNOWN_COUNT="$(wc -l < "$TMP_DIR/unknown.txt" | tr -d ' ')"

echo "[i18n-audit] declared keys: $DECLARED_COUNT"
echo "[i18n-audit] used keys: $USED_COUNT"
echo "[i18n-audit] unused keys: $UNUSED_COUNT"
echo "[i18n-audit] unknown referenced keys: $UNKNOWN_COUNT"

if [[ "$UNUSED_COUNT" -gt 0 ]]; then
  echo "[i18n-audit] warning: unused keys"
  sed 's/^/  - /' "$TMP_DIR/unused.txt"
fi

if [[ -s "$TMP_DIR/locale_issues.txt" ]]; then
  echo "[i18n-audit] FAIL: locale object mismatch"
  cat "$TMP_DIR/locale_issues.txt"
  exit 1
fi

if [[ "$UNKNOWN_COUNT" -gt 0 ]]; then
  echo "[i18n-audit] FAIL: unknown referenced i18n keys"
  sed 's/^/  - /' "$TMP_DIR/unknown.txt"
  exit 1
fi

if [[ "$STRICT_UNUSED" == "1" && "$UNUSED_COUNT" -gt 0 ]]; then
  echo "[i18n-audit] FAIL: strict mode requires zero unused keys"
  exit 1
fi

if [[ -n "$REPORT_PATH" ]]; then
  mkdir -p "$(dirname "$REPORT_PATH")"
  {
    echo "# i18n Audit Report"
    echo
    echo "- file: \`$I18N_FILE\`"
    echo "- declared keys: $DECLARED_COUNT"
    echo "- used keys: $USED_COUNT"
    echo "- unused keys: $UNUSED_COUNT"
    echo "- unknown referenced keys: $UNKNOWN_COUNT"
    echo
    echo "## Unused Keys"
    if [[ -s "$TMP_DIR/unused.txt" ]]; then
      sed 's/^/- /' "$TMP_DIR/unused.txt"
    else
      echo "- none"
    fi
  } > "$REPORT_PATH"
  echo "[i18n-audit] report written: $REPORT_PATH"
fi

echo "[i18n-audit] PASS"
