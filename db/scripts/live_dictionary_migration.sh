#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/../.." && pwd)"
env_file="$repo_root/.env.local"

phase1_stop="051"
phase2_start="052"

usage() {
  cat <<'EOF'
Usage: db/scripts/live_dictionary_migration.sh <command>

Commands:
  preflight   Run live preflight checks.
  phase1      Apply migrations 001 through 051.
  parity      Run user_card_status parity gate before destructive migration 052.
  phase2      Apply migrations 052 through the latest migration.
  postflight  Run postflight contract, grant, and read-only checks.
  plan        Print the migration files that phase1/phase2 would apply.

Environment:
  SUPABASE_DB_URL or DATABASE_URL       Target database URL.
  LIVE_MIGRATION_ALLOW_DESTRUCTIVE=1    Required for phase2.

Recommended live order:
  1. Take backup and freeze writes.
  2. preflight
  3. phase1
  4. parity
  5. Take second backup.
  6. phase2
  7. postflight
EOF
}

need_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

database_url() {
  local url="${SUPABASE_DB_URL:-${DATABASE_URL:-}}"

  if [[ -z "$url" && -f "$env_file" ]]; then
    url="$(grep -E '^SUPABASE_DB_URL=' "$env_file" | head -n1 | cut -d= -f2- || true)"
    if [[ -z "$url" ]]; then
      url="$(grep -E '^DATABASE_URL=' "$env_file" | head -n1 | cut -d= -f2- || true)"
    fi
  fi

  if [[ -z "$url" ]]; then
    echo "Missing SUPABASE_DB_URL or DATABASE_URL (env or $env_file)" >&2
    exit 1
  fi

  case "$url" in
    *localhost*|*127.0.0.1*|*::1*) ;;
    *)
      if [[ "$url" != *"sslmode="* ]]; then
        local sep='?'
        [[ "$url" == *"?"* ]] && sep='&'
        url="${url}${sep}sslmode=require"
      fi
      ;;
  esac

  printf '%s\n' "$url"
}

psql_target() {
  local url="$1"
  shift
  (cd "$repo_root" && psql "$url" -v ON_ERROR_STOP=1 "$@")
}

print_target() {
  local url="$1"
  local redacted
  redacted="$(printf '%s' "$url" | sed -E 's#(postgres(ql)?://)[^:@/]+(:[^@/]*)?@#\1***:***@#')"
  echo "Target: $redacted"
}

migration_files() {
  find "$repo_root/db/migrations" -maxdepth 1 -type f -name '[0-9][0-9][0-9]_*.sql' | sort
}

print_plan() {
  echo "Phase1 migrations:"
  migration_files | while IFS= read -r file; do
    local base="${file##*/}"
    local number="${base:0:3}"
    if [[ "$number" < "$phase2_start" ]]; then
      echo "  $base"
    fi
  done

  echo
  echo "Phase2 migrations:"
  migration_files | while IFS= read -r file; do
    local base="${file##*/}"
    local number="${base:0:3}"
    if [[ "$number" > "$phase1_stop" || "$number" == "$phase2_start" ]]; then
      echo "  $base"
    fi
  done
}

apply_range() {
  local url="$1"
  local start="$2"
  local stop="$3"
  local file base number

  migration_files | while IFS= read -r file; do
    base="${file##*/}"
    number="${base:0:3}"
    if [[ "$number" < "$start" || "$number" > "$stop" ]]; then
      continue
    fi

    echo "Applying $base"
    psql_target "$url" -f "db/migrations/$base"
  done
}

latest_migration_number() {
  local latest
  latest="$(migration_files | tail -n1)"
  if [[ -z "$latest" ]]; then
    echo "No migration files found" >&2
    exit 1
  fi
  latest="${latest##*/}"
  printf '%s\n' "${latest:0:3}"
}

cmd="${1:-}"
shift || true

case "$cmd" in
  plan)
    print_plan
    ;;
  preflight)
    need_cmd psql
    url="$(database_url)"
    print_target "$url"
    psql_target "$url" -f db/scripts/live_dictionary_migration_preflight.sql
    ;;
  phase1)
    need_cmd psql
    url="$(database_url)"
    print_target "$url"
    apply_range "$url" "001" "$phase1_stop"
    ;;
  parity)
    need_cmd psql
    url="$(database_url)"
    print_target "$url"
    psql_target "$url" -f db/scripts/check_user_card_status_parity_before_drop.sql
    ;;
  phase2)
    if [[ "${LIVE_MIGRATION_ALLOW_DESTRUCTIVE:-}" != "1" ]]; then
      echo "Refusing phase2: set LIVE_MIGRATION_ALLOW_DESTRUCTIVE=1 after backup and parity pass." >&2
      exit 1
    fi
    need_cmd psql
    url="$(database_url)"
    print_target "$url"
    apply_range "$url" "$phase2_start" "$(latest_migration_number)"
    ;;
  postflight)
    need_cmd psql
    url="$(database_url)"
    print_target "$url"
    psql_target "$url" -f db/scripts/live_dictionary_migration_postflight.sql
    ;;
  ""|-h|--help|help)
    usage
    ;;
  *)
    echo "Unknown command: $cmd" >&2
    usage >&2
    exit 1
    ;;
esac
