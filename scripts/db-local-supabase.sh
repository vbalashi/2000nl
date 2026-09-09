#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/.." && pwd)"

local_db_url="${LOCAL_SUPABASE_DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
default_data_dir="$repo_root/db/data/words_content"

usage() {
  cat <<'EOF'
Usage: scripts/db-local-supabase.sh <command> [args]

Commands:
  start                 Start the local Supabase Docker stack.
  stop                  Stop the local Supabase Docker stack.
  status                Show Supabase local service status.
  env                   Print shell exports for local DB/UI/test usage.
  apply                 Apply db/migrations/bootstrap.sql to local Supabase.
  reset --confirm-reset Erase local Supabase DB, then apply bootstrap.sql.
  probe                 Run SQL contract probes against local Supabase.
  check                 Read-only content, migration receipts and contract checks.
  import [data-dir]     Import dictionary JSON files (default: db/data/words_content).
  test-fsrs             Run apps/ui FSRS tests against local Supabase.
  all --confirm-reset [data-dir]
                        Erase DB, bootstrap, test, import if present, then probe.

Environment:
  LOCAL_SUPABASE_DB_URL Override the local Postgres URL.
  The env command maps LOCAL_SUPABASE_DB_URL to SUPABASE_DB_URL,
  DATABASE_URL, and FSRS_TEST_DB_URL for local DB/RPC checks.
EOF
}

need_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

ensure_supabase() {
  need_cmd supabase
  need_cmd docker
}

ensure_psql() {
  need_cmd psql
}

start_stack() {
  ensure_supabase
  (cd "$repo_root" && supabase start)
}

apply_bootstrap() {
  ensure_psql
  (cd "$repo_root" && psql "$local_db_url" -v ON_ERROR_STOP=1 -f db/migrations/bootstrap.sql)
}

run_probe() {
  ensure_psql
  (cd "$repo_root" && psql "$local_db_url" -v ON_ERROR_STOP=1 -f db/scripts/local_supabase_probe.sql)
}

print_env() {
  cat <<EOF
export LOCAL_SUPABASE_DB_URL="$local_db_url"
export SUPABASE_DB_URL="$local_db_url"
export DATABASE_URL="$local_db_url"
export FSRS_TEST_DB_URL="$local_db_url"
export NEXT_PUBLIC_SUPABASE_URL="http://127.0.0.1:54321"
EOF

  if command -v supabase >/dev/null 2>&1; then
    echo
    echo "# Supabase local keys, if the stack is running:"
    (cd "$repo_root" && supabase status -o env 2>/dev/null || true) \
      | grep -E '^(ANON_KEY|SERVICE_ROLE_KEY|SUPABASE_ANON_KEY|SUPABASE_SERVICE_ROLE_KEY)=' \
      | sed -E 's/^ANON_KEY=/NEXT_PUBLIC_SUPABASE_ANON_KEY=/' \
      | sed -E 's/^SUPABASE_ANON_KEY=/NEXT_PUBLIC_SUPABASE_ANON_KEY=/' \
      | sed -E 's/^SERVICE_ROLE_KEY=/SUPABASE_SERVICE_ROLE_KEY=/' \
      | sed -E 's/^/export /'
  fi
}

import_dictionary() {
  local data_dir="${1:-$default_data_dir}"
  if [[ ! -d "$data_dir" ]]; then
    echo "Dictionary data dir not found: $data_dir" >&2
    exit 1
  fi

  local python_bin="${PYTHON:-python3}"
  if [[ -x "$repo_root/.venv/bin/python" ]]; then
    python_bin="$repo_root/.venv/bin/python"
  else
    need_cmd "$python_bin"
  fi

  (cd "$repo_root" && PYTHONPATH="$repo_root/packages/ingestion/src${PYTHONPATH:+:$PYTHONPATH}" \
    "$python_bin" packages/ingestion/scripts/import_words_db.py \
    --database-url "$local_db_url" \
    --data-dir "$data_dir")
}

run_fsrs_tests() {
  need_cmd npm
  (cd "$repo_root/apps/ui" && FSRS_TEST_DB_URL="$local_db_url" npm test -- tests/fsrs/*.test.ts)
}

cmd="${1:-}"
shift || true

# Validate the entire invocation before starting services or touching a database.
case "$cmd" in
  reset|all)
    if [[ "${1:-}" != "--confirm-reset" ]]; then
      echo "$cmd erases the local database. Reuse it with 'check'; rebuilding requires --confirm-reset." >&2
      exit 1
    fi
    shift
    if [[ ( "$cmd" == reset && $# -ne 0 ) || $# -gt 1 || "${1:-}" == -* ]]; then
      echo "Unexpected rebuild arguments. See --help." >&2
      exit 1
    fi
    ;;
  import)
    if [[ $# -gt 1 || "${1:-}" == -* ]]; then
      echo "Expected at most one dictionary directory." >&2
      exit 1
    fi
    ;;
  *)
    if [[ $# -ne 0 ]]; then
      echo "Unexpected arguments. See --help." >&2
      exit 1
    fi
    ;;
esac

case "$cmd" in
  start|stop|status|env|apply|probe|check|import|test-fsrs|reset|all)
    need_cmd node
    target_check="target"
    if [[ "$cmd" == reset || "$cmd" == all ]]; then target_check="reset-target"; fi
    export LOCAL_SUPABASE_DB_URL="$local_db_url"
    node "$script_dir/lib/local-db-check.mjs" "$target_check"
    # A hostaddr/service inherited from another project must not redirect libpq.
    unset PGHOSTADDR PGSERVICE PGSERVICEFILE
    ;;
esac

case "$cmd" in
  start)
    start_stack
    ;;
  stop)
    ensure_supabase
    (cd "$repo_root" && supabase stop)
    ;;
  status)
    ensure_supabase
    (cd "$repo_root" && supabase status)
    ;;
  env)
    print_env
    ;;
  apply)
    apply_bootstrap
    ;;
  reset)
    ensure_supabase
    (cd "$repo_root" && supabase db reset)
    apply_bootstrap
    ;;
  probe)
    run_probe
    ;;
  check)
    ensure_psql
    (cd "$repo_root" &&
      node db/scripts/deploy_db_contract.mjs validate &&
      node scripts/lib/local-db-check.mjs sql |
        PGOPTIONS='-c default_transaction_read_only=on -c statement_timeout=30000' \
        psql "$local_db_url" -X -v ON_ERROR_STOP=1)
    ;;
  import)
    import_dictionary "${1:-$default_data_dir}"
    ;;
  test-fsrs)
    run_fsrs_tests
    ;;
  all)
    start_stack
    (cd "$repo_root" && supabase db reset)
    apply_bootstrap
    run_probe
    run_fsrs_tests
    data_dir="${1:-$default_data_dir}"
    if [[ -d "$data_dir" ]]; then
      import_dictionary "$data_dir"
      run_probe
    else
      echo "Skipping dictionary import; data dir not found: $data_dir"
    fi
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
