#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/../.." && pwd)"
psql_script="$repo_root/db/scripts/psql_supabase.sh"

usage() {
  cat <<'USAGE'
Usage:
  db/scripts/srs_history.sh --user-id <uuid> [--word-id <uuid> | --word <text>] [--limit <n>]

Examples:
  db/scripts/srs_history.sh --user-id 00000000-0000-0000-0000-000000000000
  db/scripts/srs_history.sh --user-id 00000000-0000-0000-0000-000000000000 --word-id 11111111-1111-1111-1111-111111111111
  db/scripts/srs_history.sh --user-id 00000000-0000-0000-0000-000000000000 --word fiets
USAGE
}

user_id=""
word_id=""
word_text=""
limit=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --user-id|-u)
      user_id="${2:-}"
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
    --limit|-n)
      limit="${2:-}"
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

if [[ -z "$user_id" ]]; then
  echo "Missing --user-id" >&2
  usage >&2
  exit 1
fi

if [[ -n "$word_id" && -n "$word_text" ]]; then
  echo "Use only one of --word-id or --word" >&2
  usage >&2
  exit 1
fi

"$psql_script" \
  -v user_id="$user_id" \
  -v word_id="$word_id" \
  -v word_text="$word_text" \
  -v limit="$limit" \
  -c "\\pset pager off" \
  <<'SQL'
WITH params AS (
  SELECT
    :'user_id'::uuid AS user_id,
    NULLIF(:'word_id', '')::uuid AS word_id,
    NULLIF(:'word_text', '') AS word_text,
    COALESCE(NULLIF(:'limit', '')::int, 200) AS row_limit
),
resolved_word AS (
  SELECT
    p.user_id,
    COALESCE(p.word_id, wf.word_id, we.id) AS word_id,
    COALESCE(p.word_text, we.headword, wf.form) AS word_text,
    p.row_limit
  FROM params p
  LEFT JOIN word_entries we ON p.word_text IS NOT NULL AND we.headword = p.word_text
  LEFT JOIN word_forms wf ON p.word_text IS NOT NULL AND wf.form = p.word_text
  LIMIT 1
),
review_rows AS (
  SELECT
    rl.user_id,
    rl.word_id,
    rl.mode,
    rl.review_type,
    rl.grade,
    rl.scheduled_at,
    rl.reviewed_at,
    rl.interval_after,
    rl.params_version,
    rl.metadata,
    we.headword
  FROM user_review_log rl
  JOIN resolved_word rw ON rw.user_id = rl.user_id
  LEFT JOIN word_entries we ON we.id = rl.word_id
  WHERE rl.user_id = rw.user_id
    AND (rw.word_id IS NULL OR rl.word_id = rw.word_id)
),
annotated AS (
  SELECT
    r.*,
    LAG(r.interval_after) OVER w AS interval_before,
    LAG(r.grade) OVER w AS prev_grade,
    LAG(r.interval_after) OVER w AS prev_interval,
    LAG(r.reviewed_at) OVER w AS prev_reviewed_at
  FROM review_rows r
  WINDOW w AS (PARTITION BY r.word_id, r.mode ORDER BY r.reviewed_at)
),
resolved_output AS (
  SELECT
    rw.user_id,
    rw.word_id,
    rw.word_text,
    rw.row_limit
  FROM resolved_word rw
)
SELECT
  a.reviewed_at,
  a.headword,
  a.word_id,
  a.mode,
  a.review_type,
  a.grade,
  CASE a.grade
    WHEN 1 THEN 'again'
    WHEN 2 THEN 'hard'
    WHEN 3 THEN 'good'
    WHEN 4 THEN 'easy'
    ELSE 'unknown'
  END AS response,
  a.scheduled_at,
  a.interval_before,
  a.interval_after,
  a.prev_reviewed_at,
  CASE
    WHEN a.prev_grade IN (3, 4)
      AND COALESCE(a.prev_interval, 0) >= 1
      AND a.prev_reviewed_at IS NOT NULL
      AND a.reviewed_at - a.prev_reviewed_at < interval '1 day'
    THEN true
    ELSE false
  END AS repeat_after_good
FROM annotated a
JOIN resolved_output ro ON ro.user_id = a.user_id
ORDER BY a.reviewed_at ASC
LIMIT (SELECT row_limit FROM resolved_output);
SQL
