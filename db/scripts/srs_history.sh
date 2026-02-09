#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/../.." && pwd)"
psql_script="$repo_root/db/scripts/psql_supabase.sh"

usage() {
  cat <<'USAGE'
Usage:
  db/scripts/srs_history.sh --user-id <uuid> [--word-id <uuid> | --word <text>] [--limit <n>] [--format table|csv] [--include-clicks]

Examples:
  db/scripts/srs_history.sh --user-id 00000000-0000-0000-0000-000000000000
  db/scripts/srs_history.sh --user-id 00000000-0000-0000-0000-000000000000 --word-id 11111111-1111-1111-1111-111111111111
  db/scripts/srs_history.sh --user-id 00000000-0000-0000-0000-000000000000 --word fiets
  db/scripts/srs_history.sh --user-id 00000000-0000-0000-0000-000000000000 --format csv > out.csv
  db/scripts/srs_history.sh --user-id 00000000-0000-0000-0000-000000000000 --include-clicks
USAGE
}

user_id=""
word_id=""
word_text=""
limit=""
format="table"
include_clicks="0"

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
    --format)
      format="${2:-}"
      shift 2
      ;;
    --include-clicks)
      include_clicks="1"
      shift 1
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

if [[ "$format" != "table" && "$format" != "csv" ]]; then
  echo "Invalid --format: $format (expected: table|csv)" >&2
  usage >&2
  exit 1
fi

psql_format="aligned"
if [[ "$format" == "csv" ]]; then
  psql_format="csv"
fi

"$psql_script" \
  -P pager=off \
  -P footer=off \
  -P "format=$psql_format" \
  -v user_id="$user_id" \
  -v word_id="$word_id" \
  -v word_text="$word_text" \
  -v limit="$limit" \
  -v include_clicks="$include_clicks" \
  <<'SQL'
WITH params AS (
  SELECT
    :'user_id'::uuid AS user_id,
    NULLIF(:'word_id', '')::uuid AS word_id,
    NULLIF(:'word_text', '') AS word_text,
    COALESCE(NULLIF(:'limit', '')::int, 200) AS row_limit,
    COALESCE(NULLIF(:'include_clicks', '')::int, 0) AS include_clicks
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
    rl.stability_before,
    rl.difficulty_before,
    rl.stability_after,
    rl.difficulty_after,
    rl.interval_after,
    rl.params_version,
    rl.metadata,
    we.headword
  FROM user_review_log rl
  JOIN resolved_word rw ON rw.user_id = rl.user_id
  JOIN params p ON p.user_id = rl.user_id
  LEFT JOIN word_entries we ON we.id = rl.word_id
  WHERE rl.user_id = rw.user_id
    AND (rw.word_id IS NULL OR rl.word_id = rw.word_id)
    AND (p.include_clicks = 1 OR rl.review_type <> 'click')
),
annotated AS (
  SELECT
    r.*,
    LAG(r.interval_after) OVER w AS interval_before,
    LAG(r.grade) OVER w AS prev_grade,
    LAG(r.interval_after) OVER w AS prev_interval,
    LAG(r.reviewed_at) OVER w AS prev_reviewed_at,
    EXTRACT(EPOCH FROM (r.reviewed_at - LAG(r.reviewed_at) OVER w)) AS delta_seconds
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
  a.stability_before,
  a.stability_after,
  a.difficulty_before,
  a.difficulty_after,
  a.params_version,
  a.prev_reviewed_at,
  a.delta_seconds,
  a.metadata->>'elapsed_days' AS elapsed_days,
  a.metadata->>'retrievability' AS retrievability,
  a.metadata->>'same_day' AS same_day,
  a.metadata->>'last_reviewed_at_before' AS last_reviewed_at_before,
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
