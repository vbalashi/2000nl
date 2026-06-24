#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/../.." && pwd)"
psql_script="$repo_root/db/scripts/psql_supabase.sh"

usage() {
  cat <<'EOF'
Usage:
  db/scripts/run_dictionary_search_backfill.sh start [extraction-version] [batch-size]
  db/scripts/run_dictionary_search_backfill.sh resume <run-id>

Each processed batch is a separate psql command/transaction. Resume the same
run id after interruption.
EOF
}

if [[ $# -lt 1 ]]; then
  usage >&2
  exit 1
fi

cmd="$1"
shift

require_integer() {
  local name="$1"
  local value="$2"
  if [[ ! "$value" =~ ^[0-9]+$ ]]; then
    echo "$name must be an integer: $value" >&2
    exit 1
  fi
}

require_uuid() {
  local value="$1"
  if [[ ! "$value" =~ ^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$ ]]; then
    echo "run-id must be a UUID: $value" >&2
    exit 1
  fi
}

case "$cmd" in
  start)
    extraction_version="${1:-2}"
    batch_size="${2:-500}"
    require_integer "extraction-version" "$extraction_version"
    require_integer "batch-size" "$batch_size"
    run_id="$("$psql_script" -At -c "select start_dictionary_search_backfill(${extraction_version}::int, ${batch_size}::int);")"
    ;;
  resume)
    if [[ $# -lt 1 ]]; then
      usage >&2
      exit 1
    fi
    run_id="$1"
    require_uuid "$run_id"
    ;;
  -h|--help|help)
    usage
    exit 0
    ;;
  *)
    echo "Unknown command: $cmd" >&2
    usage >&2
    exit 1
    ;;
esac

echo "Backfill run: $run_id"

while true; do
  result="$("$psql_script" -At -c "select run_dictionary_search_backfill_batch('${run_id}'::uuid);")"
  echo "$result"
  status="$(printf '%s' "$result" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("status",""))')"
  has_more="$(printf '%s' "$result" | python3 -c 'import json,sys; print(str(json.load(sys.stdin).get("hasMore", False)).lower())')"
  if [[ "$status" != "running" || "$has_more" != "true" ]]; then
    break
  fi
done
