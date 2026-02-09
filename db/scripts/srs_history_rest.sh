#!/usr/bin/env bash
set -euo pipefail

# Fetch SRS review history via Supabase REST API (works even if direct Postgres is unreachable).
#
# Requires:
#   - NEXT_PUBLIC_SUPABASE_URL (e.g. https://xxxx.supabase.co)
#   - SUPABASE_SERVICE_ROLE_KEY (recommended) or SUPABASE_SECRET_KEY
#
# Examples:
#   db/scripts/srs_history_rest.sh --user-email vbalashi@gmail.com --format json > out.json
#   db/scripts/srs_history_rest.sh --user-id <uuid> --format csv > out.csv
#

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/../.." && pwd)"
env_file="$repo_root/.env.local"

usage() {
  cat <<'USAGE'
Usage:
  db/scripts/srs_history_rest.sh (--user-id <uuid> | --user-email <email>)
    [--word-id <uuid> | --word <text>]
    [--include-clicks]
    [--format json|csv]

Notes:
  - Uses Supabase REST API + service role key; bypasses RLS.
  - Output includes FSRS before/after fields and metadata (when present).

Examples:
  db/scripts/srs_history_rest.sh --user-email vbalashi@gmail.com --format csv > out.csv
  db/scripts/srs_history_rest.sh --user-id 00000000-0000-0000-0000-000000000000 --word-id 11111111-1111-1111-1111-111111111111
USAGE
}

supabase_url="${NEXT_PUBLIC_SUPABASE_URL:-}"
service_key="${SUPABASE_SERVICE_ROLE_KEY:-${SUPABASE_SECRET_KEY:-}}"

if [[ -z "$supabase_url" || -z "$service_key" ]]; then
  if [[ -f "$env_file" ]]; then
    supabase_url="${supabase_url:-$(grep -E '^NEXT_PUBLIC_SUPABASE_URL=' "$env_file" | head -n1 | cut -d= -f2- || true)}"
    service_key="${service_key:-$(grep -E '^SUPABASE_SERVICE_ROLE_KEY=' "$env_file" | head -n1 | cut -d= -f2- || true)}"
    if [[ -z "$service_key" ]]; then
      service_key="$(grep -E '^SUPABASE_SECRET_KEY=' "$env_file" | head -n1 | cut -d= -f2- || true)"
    fi
  fi
fi

if [[ -z "$supabase_url" || -z "$service_key" ]]; then
  echo "Missing NEXT_PUBLIC_SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY (env or $env_file)" >&2
  exit 1
fi

user_id=""
user_email=""
word_id=""
word_text=""
include_clicks="0"
format="json"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --user-id)
      user_id="${2:-}"
      shift 2
      ;;
    --user-email)
      user_email="${2:-}"
      shift 2
      ;;
    --word-id)
      word_id="${2:-}"
      shift 2
      ;;
    --word)
      word_text="${2:-}"
      shift 2
      ;;
    --include-clicks)
      include_clicks="1"
      shift 1
      ;;
    --format)
      format="${2:-}"
      shift 2
      ;;
    --help|-h)
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

if [[ -z "$user_id" && -z "$user_email" ]]; then
  echo "Missing --user-id or --user-email" >&2
  usage >&2
  exit 1
fi

if [[ -n "$user_id" && -n "$user_email" ]]; then
  echo "Use only one of --user-id or --user-email" >&2
  usage >&2
  exit 1
fi

if [[ -n "$word_id" && -n "$word_text" ]]; then
  echo "Use only one of --word-id or --word" >&2
  usage >&2
  exit 1
fi

if [[ "$format" != "json" && "$format" != "csv" ]]; then
  echo "Invalid --format: $format (expected: json|csv)" >&2
  usage >&2
  exit 1
fi

auth_headers=(
  -H "apikey: $service_key"
  -H "Authorization: Bearer $service_key"
)

if [[ -n "$user_email" ]]; then
  # Supabase Admin API supports filtering by email (substring match). Filter exact match client-side.
  users_json="$(curl -sS "${auth_headers[@]}" "$supabase_url/auth/v1/admin/users?email=$(python -c 'import sys,urllib.parse;print(urllib.parse.quote(sys.argv[1]))' "$user_email")")"
  user_id="$(
    python -c 'import json,sys; email=sys.argv[1]; obj=json.load(sys.stdin); print(next((u.get("id","") for u in obj.get("users",[]) if u.get("email")==email), ""))' \
      "$user_email" <<<"$users_json"
  )"
  if [[ -z "$user_id" ]]; then
    echo "No Supabase auth user found for email: $user_email" >&2
    exit 1
  fi
fi

if [[ -n "$word_text" ]]; then
  # Resolve word_id by headword, then form.
  q_headword="$(python -c 'import sys,urllib.parse;print(urllib.parse.quote(sys.argv[1]))' "$word_text")"
  wid="$(curl -sS "${auth_headers[@]}" "$supabase_url/rest/v1/word_entries?select=id&headword=eq.$q_headword&limit=1" | python -c 'import json,sys; a=json.load(sys.stdin); print(a[0]["id"] if a else "")')"
  if [[ -z "$wid" ]]; then
    wid="$(curl -sS "${auth_headers[@]}" "$supabase_url/rest/v1/word_forms?select=word_id&form=eq.$q_headword&limit=1" | python -c 'import json,sys; a=json.load(sys.stdin); print(a[0]["word_id"] if a else "")')"
  fi
  if [[ -z "$wid" ]]; then
    echo "Could not resolve --word to a word_id: $word_text" >&2
    exit 1
  fi
  word_id="$wid"
fi

filters=()
filters+=("user_id=eq.$user_id")
if [[ "$include_clicks" != "1" ]]; then
  filters+=("review_type=neq.click")
fi
if [[ -n "$word_id" ]]; then
  filters+=("word_id=eq.$word_id")
fi

select="id,reviewed_at,scheduled_at,word_id,mode,review_type,grade,response_ms,stability_before,difficulty_before,stability_after,difficulty_after,interval_after,params_version,metadata,word_entries(headword)"
base_url="$supabase_url/rest/v1/user_review_log?select=$select&order=reviewed_at.asc&$(IFS='&'; echo "${filters[*]}")"

# Pagination via Range headers (PostgREST).
page_size=1000
start=0
all='[]'

while :; do
  end=$((start + page_size - 1))
  page="$(curl -sS "${auth_headers[@]}" -H 'Range-Unit: items' -H "Range: ${start}-${end}" "$base_url")"
  n="$(python -c 'import json,sys; print(len(json.load(sys.stdin)))' <<<"$page")"
  if [[ "$n" -eq 0 ]]; then
    break
  fi
  all="$(
    python -c 'import json,sys; all_=json.loads(sys.argv[1]); page=json.load(sys.stdin); all_.extend(page); print(json.dumps(all_, ensure_ascii=True))' \
      "$all" <<<"$page"
  )"
  if [[ "$n" -lt "$page_size" ]]; then
    break
  fi
  start=$((start + page_size))
done

if [[ "$format" == "json" ]]; then
  printf '%s\n' "$all"
  exit 0
fi

python -c '
import csv, json, sys
rows=json.load(sys.stdin)
# Flatten embedded headword and a few metadata fields that are useful for debugging.
keys=[
  "id","reviewed_at","scheduled_at","word_id","headword","mode","review_type","grade","response_ms",
  "stability_before","difficulty_before","stability_after","difficulty_after","interval_after","params_version",
  "meta_elapsed_days","meta_retrievability","meta_same_day","meta_last_reviewed_at_before"
]
w=csv.DictWriter(sys.stdout, fieldnames=keys)
w.writeheader()
for r in rows:
  meta=r.get("metadata") or {}
  out={
    "id": r.get("id"),
    "reviewed_at": r.get("reviewed_at"),
    "scheduled_at": r.get("scheduled_at"),
    "word_id": r.get("word_id"),
    "headword": (r.get("word_entries") or {}).get("headword"),
    "mode": r.get("mode"),
    "review_type": r.get("review_type"),
    "grade": r.get("grade"),
    "response_ms": r.get("response_ms"),
    "stability_before": r.get("stability_before"),
    "difficulty_before": r.get("difficulty_before"),
    "stability_after": r.get("stability_after"),
    "difficulty_after": r.get("difficulty_after"),
    "interval_after": r.get("interval_after"),
    "params_version": r.get("params_version"),
    "meta_elapsed_days": meta.get("elapsed_days"),
    "meta_retrievability": meta.get("retrievability"),
    "meta_same_day": meta.get("same_day"),
    "meta_last_reviewed_at_before": meta.get("last_reviewed_at_before"),
  }
  w.writerow(out)
' <<<"$all"
