#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/.." && pwd)"
common_git_dir="$(git -C "$repo_root" rev-parse --path-format=absolute --git-common-dir)"
project_root="$(dirname "$common_git_dir")"

local_db_url="${LOCAL_SUPABASE_DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
temporary_test_databases=()
active_test_pid=""
if [[ -d "$repo_root/db/data/words_content" ]]; then
  default_data_dir="$repo_root/db/data/words_content"
else
  default_data_dir="$project_root/db/data/words_content"
fi

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
  fixture               Load the deterministic small local dictionary fixture.
  import [data-dir]     Import dictionary JSON files (default: db/data/words_content).
  test-fsrs             Run apps/ui FSRS tests in a disposable local database.
  test-ingestion        Run scraper/ingestion tests in a disposable local database.
  all --confirm-reset   Erase DB, bootstrap, test in disposable databases, load
                        the small QA fixture, then probe.

Environment:
  LOCAL_SUPABASE_DB_URL Override the local Postgres URL.
  The env command maps LOCAL_SUPABASE_DB_URL to SUPABASE_DB_URL,
  and DATABASE_URL for local app/DB checks. Test commands create their own DBs.
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

  local python_bin
  python_bin="$(ingestion_python)"

  (cd "$repo_root" && PYTHONPATH="$repo_root/packages/ingestion/src${PYTHONPATH:+:$PYTHONPATH}" \
    "$python_bin" packages/ingestion/scripts/import_words_db.py \
    --database-url "$local_db_url" \
    --data-dir "$data_dir")
}

ingestion_python() {
  if [[ -n "${PYTHON:-}" ]]; then
    need_cmd "$PYTHON"
    printf '%s\n' "$PYTHON"
    return 0
  fi
  local venv_python="$repo_root/.venv/bin/python"
  if [[ ! -x "$venv_python" ]]; then
    echo "Python ingestion environment is not ready. In a worktree run:" >&2
    echo "  scripts/bootstrap-worktree.sh --install --ingestion" >&2
    return 1
  fi
  printf '%s\n' "$venv_python"
}

load_qa_fixture() {
  ensure_psql
  (cd "$repo_root" && psql "$local_db_url" -v ON_ERROR_STOP=1 \
    -f db/test-fixtures/search_multisource.sql \
    -f db/test-fixtures/training_smoke.sql)
}

register_temporary_test_database() {
  temporary_test_databases+=("$1")
}

drop_temporary_test_database() {
  local database_name="$1"
  local remaining=()
  local candidate

  dropdb --force --if-exists --maintenance-db="$local_db_url" "$database_name"
  for candidate in "${temporary_test_databases[@]}"; do
    [[ "$candidate" == "$database_name" ]] || remaining+=("$candidate")
  done
  temporary_test_databases=("${remaining[@]}")
}

cleanup_temporary_test_databases() {
  local original_status=$?
  local cleanup_failed=false
  local database_name

  trap - EXIT
  for database_name in "${temporary_test_databases[@]}"; do
    if ! dropdb --force --if-exists --maintenance-db="$local_db_url" "$database_name" >/dev/null 2>&1; then
      echo "Failed to remove disposable database: $database_name" >&2
      cleanup_failed=true
    fi
  done
  if [[ "$original_status" -eq 0 && "$cleanup_failed" == true ]]; then
    original_status=1
  fi
  exit "$original_status"
}

database_url_for_name() {
  # The dollar expression below belongs to JavaScript.
  # shellcheck disable=SC2016
  node -e '
    const url = new URL(process.argv[1]);
    url.pathname = `/${encodeURIComponent(process.argv[2])}`;
    process.stdout.write(url.toString());
  ' "$local_db_url" "$1"
}

run_owned_test_process() {
  local test_status=0
  "$@" &
  active_test_pid=$!
  if wait "$active_test_pid"; then
    test_status=0
  else
    test_status=$?
  fi
  active_test_pid=""
  return "$test_status"
}

handle_test_signal() {
  local signal_name="$1"
  local exit_status="$2"
  local watchdog_pid=""
  trap - "$signal_name"
  if [[ -n "$active_test_pid" ]] && kill -0 "$active_test_pid" 2>/dev/null; then
    # Non-interactive shells may start background children with SIGINT ignored.
    # TERM is reliable for both Ctrl+C and external cancellation; KILL is a
    # bounded last resort so database cleanup cannot wait forever.
    kill -TERM "$active_test_pid" 2>/dev/null || true
    (sleep 2; kill -KILL "$active_test_pid" 2>/dev/null || true) &
    watchdog_pid=$!
    wait "$active_test_pid" 2>/dev/null || true
    kill -TERM "$watchdog_pid" 2>/dev/null || true
    wait "$watchdog_pid" 2>/dev/null || true
  fi
  active_test_pid=""
  exit "$exit_status"
}

run_fsrs_suite() {
  cd "$repo_root/apps/ui"
  exec env FSRS_TEST_DB_URL="$1" npm test -- tests/fsrs/*.test.ts
}

run_ingestion_suite() {
  local test_db_url="$1"
  local python_bin="$2"
  cd "$repo_root"
  exec env INGESTION_TEST_DATABASE_URL="$test_db_url" "$python_bin" -m pytest -q \
    packages/scraper/tests \
    packages/ingestion/tests/unit \
    packages/ingestion/tests/integration
}

trap cleanup_temporary_test_databases EXIT
trap 'handle_test_signal INT 130' INT
trap 'handle_test_signal TERM 143' TERM

run_fsrs_tests() {
  ensure_psql
  need_cmd npm
  need_cmd createdb
  need_cmd dropdb

  local test_db_name="2000nl_fsrs_${BASHPID}_${RANDOM}"
  local test_db_url
  test_db_url="$(database_url_for_name "$test_db_name")"
  createdb --maintenance-db="$local_db_url" "$test_db_name"
  register_temporary_test_database "$test_db_name"

  local test_status=0
  if run_owned_test_process run_fsrs_suite "$test_db_url"; then
    test_status=0
  else
    test_status=$?
  fi

  drop_temporary_test_database "$test_db_name"
  return "$test_status"
}

run_ingestion_tests() {
  ensure_psql
  need_cmd createdb
  need_cmd dropdb

  local python_bin
  python_bin="$(ingestion_python)"
  local test_db_name="2000nl_ingestion_${BASHPID}_${RANDOM}"
  local test_db_url
  test_db_url="$(database_url_for_name "$test_db_name")"
  createdb --maintenance-db="$local_db_url" "$test_db_name"
  register_temporary_test_database "$test_db_name"

  local test_status=0
  if (
    cd "$repo_root" &&
    psql "$test_db_url" -v ON_ERROR_STOP=1 -f db/scripts/plain_postgres_supabase_compat.sql >/dev/null &&
    psql "$test_db_url" -v ON_ERROR_STOP=1 -f db/migrations/bootstrap.sql >/dev/null
  ); then
    if run_owned_test_process run_ingestion_suite "$test_db_url" "$python_bin"; then
      test_status=0
    else
      test_status=$?
    fi
  else
    test_status=$?
  fi

  drop_temporary_test_database "$test_db_name"
  return "$test_status"
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
    if [[ $# -ne 0 ]]; then
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
  start|stop|status|env|apply|probe|check|fixture|import|test-fsrs|test-ingestion|reset|all)
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
  fixture)
    load_qa_fixture
    run_probe
    ;;
  import)
    import_dictionary "${1:-$default_data_dir}"
    ;;
  test-fsrs)
    run_fsrs_tests
    ;;
  test-ingestion)
    run_ingestion_tests
    ;;
  all)
    start_stack
    (cd "$repo_root" && supabase db reset)
    apply_bootstrap
    run_probe
    run_fsrs_tests
    run_ingestion_tests
    load_qa_fixture
    run_probe
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
