#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/.." && pwd)"

port="${PORT:-3100}"
host="${HOST:-0.0.0.0}"

usage() {
  cat <<'EOF'
Usage: scripts/ui-local-dev.sh [--port PORT]

Start apps/ui against the local Supabase stack, overriding any production
Supabase values from .env.local for this process only.

Environment:
  PORT            UI port. Default: 3100.
  HOST            Reserved for future use. apps/ui dev script already binds 0.0.0.0.
  TEST_USER_EMAIL Dev-login user email. Default: test@2000nl.local.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --port)
      port="${2:?Missing value for --port}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if ! command -v supabase >/dev/null 2>&1; then
  echo "Missing required command: supabase" >&2
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "Missing required command: npm" >&2
  exit 1
fi

status_env="$(cd "$repo_root" && supabase status -o env)"

get_env_value() {
  local key="$1"
  printf '%s\n' "$status_env" \
    | awk -F= -v key="$key" '$1 == key { value=$2; gsub(/^"|"$/, "", value); print value; exit }'
}

api_url="$(get_env_value API_URL)"
anon_key="$(get_env_value ANON_KEY)"
publishable_key="$(get_env_value PUBLISHABLE_KEY)"
secret_key="$(get_env_value SECRET_KEY)"
service_role_key="$(get_env_value SERVICE_ROLE_KEY)"

if [[ -z "$api_url" || -z "$anon_key" ]]; then
  echo "Local Supabase API_URL/ANON_KEY not found. Run scripts/db-local-supabase.sh start first." >&2
  exit 1
fi

export NEXT_PUBLIC_SUPABASE_URL="$api_url"
export NEXT_PUBLIC_SUPABASE_ANON_KEY="${publishable_key:-$anon_key}"
export NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY="${publishable_key:-$anon_key}"
export SUPABASE_URL="$api_url"
export SUPABASE_SECRET_KEY="${secret_key:-$service_role_key}"
export SUPABASE_SERVICE_ROLE_KEY="$service_role_key"
export TEST_USER_EMAIL="${TEST_USER_EMAIL:-test@2000nl.local}"
export NEXT_PUBLIC_SITE_URL="http://localhost:$port"

echo "Starting UI against local Supabase:"
echo "  UI:       http://localhost:$port"
echo "  Supabase: $NEXT_PUBLIC_SUPABASE_URL"
echo "  Dev auth: http://localhost:$port/dev/test-login?redirectTo=/"
echo "  Health:   http://localhost:$port/api/health?deep=1"

cd "$repo_root/apps/ui"
exec npm run dev -- --port "$port"
