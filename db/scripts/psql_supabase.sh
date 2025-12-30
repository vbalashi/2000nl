#!/usr/bin/env bash
set -euo pipefail

# Run psql against Supabase using SUPABASE_DB_URL or DATABASE_URL.
# Examples:
#   db/scripts/psql_supabase.sh -c "select now();"
#   db/scripts/psql_supabase.sh -f db/migrations/0008_enable_rls.sql

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/../.." && pwd)"
env_file="$repo_root/.env.local"

url="${SUPABASE_DB_URL:-${DATABASE_URL:-}}"

# Fallback to .env.local if not provided in environment.
if [[ -z "$url" && -f "$env_file" ]]; then
  # Prefer SUPABASE_DB_URL, then DATABASE_URL
  url="$(grep -E '^SUPABASE_DB_URL=' "$env_file" | head -n1 | cut -d= -f2- || true)"
  if [[ -z "$url" ]]; then
    url="$(grep -E '^DATABASE_URL=' "$env_file" | head -n1 | cut -d= -f2- || true)"
  fi
fi

if [[ -z "$url" ]]; then
  echo "Missing SUPABASE_DB_URL or DATABASE_URL (env or $env_file)" >&2
  exit 1
fi

# Ensure sslmode=require is set (Supabase requires SSL).
if [[ "$url" != *"sslmode="* ]]; then
  sep='?'
  [[ "$url" == *"?"* ]] && sep='&'
  url="${url}${sep}sslmode=require"
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "psql not found; install the PostgreSQL client." >&2
  exit 1
fi

exec psql "$url" -v ON_ERROR_STOP=1 "$@"
