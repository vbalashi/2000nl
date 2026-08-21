#!/usr/bin/env bash
set -euo pipefail

# Mint + inject a Supabase session into production (https://2000.dilum.io) using agent-browser,
# using a temporary dedicated browser profile by default.
#
# Prereqs:
# - agent-browser installed
# - Env vars available (default: .env.local in repo root):
#   NEXT_PUBLIC_SUPABASE_URL
#   NEXT_PUBLIC_SUPABASE_ANON_KEY
#   SUPABASE_SERVICE_ROLE_KEY
#   QA_TEST_USER_EMAIL
#   QA_TEST_USER_EMAIL_ALLOWLIST
#   QA_REFERENCE_USER_EMAILS
#
# Notes:
# - Session is stored in localStorage under sb-lliwdcpuuzjmxyzrjtoz-auth-token (origin-scoped).
# - Default browser state is removed during cleanup.

usage() {
  cat <<'USAGE'
Usage: scripts/ab-auth-prod.sh [options]

Options:
  --profile <path>     caller-owned agent-browser profile dir (default: temporary, auto-removed)
  --session <name>     agent-browser session name (default: prod2000)
  --env-file <path>    Env file to source (default: .env.local if present, else apps/ui/.env.local)
  --no-close           Do not run agent-browser close before starting
  -h, --help           Show help

Examples:
  scripts/ab-auth-prod.sh
  scripts/ab-auth-prod.sh --session ab-prod --profile tmp/agent-browser/profile-2000nl-prod
USAGE
}

URL="https://2000.dilum.io/"
PROFILE=""
PROFILE_OWNED="0"
SESSION="prod2000"
ENV_FILE=""
DO_CLOSE="1"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --profile) PROFILE="${2:-}"; shift 2 ;;
    --session) SESSION="${2:-}"; shift 2 ;;
    --env-file) ENV_FILE="${2:-}"; shift 2 ;;
    --no-close) DO_CLOSE="0"; shift 1 ;;
    -h|--help) usage; exit 0 ;;
    *)
      echo "Unknown arg: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

if [[ -z "$ENV_FILE" ]]; then
  if [[ -f ".env.local" ]]; then
    ENV_FILE=".env.local"
  elif [[ -f "apps/ui/.env.local" ]]; then
    ENV_FILE="apps/ui/.env.local"
  else
    echo "No env file found. Pass --env-file <path>." >&2
    exit 2
  fi
fi

SESSION_ARTIFACT_DIR="$REPO_ROOT/tmp/agent-browser/qa-session-$$"
OUT_JSON="$SESSION_ARTIFACT_DIR/prod-session.json"
OUT_B64="$SESSION_ARTIFACT_DIR/prod-session.b64"
if [[ -z "$PROFILE" ]]; then
  PROFILE="$REPO_ROOT/tmp/agent-browser/profile-qa-$$"
  PROFILE_OWNED="1"
fi
mkdir -p "$SESSION_ARTIFACT_DIR" "$(dirname "$PROFILE")"
chmod 700 "$SESSION_ARTIFACT_DIR" "$(dirname "$PROFILE")" || true

browser() {
  bash "$REPO_ROOT/scripts/lib/run-sanitized-agent-browser.sh" "$@"
}

run_bounded() {
  "$@" &
  local bounded_pid=$!
  local attempt
  for attempt in {1..80}; do
    if ! kill -0 "$bounded_pid" 2>/dev/null; then
      wait "$bounded_pid"
      return $?
    fi
    sleep 0.1
  done
  kill -TERM "$bounded_pid" 2>/dev/null || true
  for attempt in {1..10}; do
    if ! kill -0 "$bounded_pid" 2>/dev/null; then
      wait "$bounded_pid" 2>/dev/null || true
      return 124
    fi
    sleep 0.1
  done
  kill -KILL "$bounded_pid" 2>/dev/null || true
  wait "$bounded_pid" 2>/dev/null || true
  return 124
}

revoke_session() {
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
  cd "$REPO_ROOT/apps/ui"
  exec env QA_SESSION_JSON_PATH="$OUT_JSON" npx vite-node scripts/revoke-prod-qa-session.ts
}

cleanup() {
  local original_status="${1:-0}"
  local cleanup_failed="0"
  local revoked="0"
  trap - EXIT INT TERM
  set +e
  if [[ -f "$OUT_JSON" ]]; then
    if run_bounded revoke_session >/dev/null; then
      revoked="1"
    else
      echo "Error: global QA session revocation failed; protected recovery artifacts retained at $SESSION_ARTIFACT_DIR." >&2
      cleanup_failed="1"
    fi
  fi
  if ! run_bounded browser --session "$SESSION" eval '(() => { for (const key of Object.keys(localStorage)) { if (key.startsWith("sb-")) localStorage.removeItem(key); } return true; })()' >/dev/null 2>&1; then
    echo "Warning: browser QA session cleanup did not complete." >&2
    cleanup_failed="1"
  fi
  run_bounded browser --session "$SESSION" close >/dev/null 2>&1 || true
  if [[ "$revoked" == "1" || ! -f "$OUT_JSON" ]]; then
    [[ -f "$OUT_JSON" ]] && unlink "$OUT_JSON"
    [[ -f "$OUT_B64" ]] && unlink "$OUT_B64"
    rmdir "$SESSION_ARTIFACT_DIR" 2>/dev/null || true
  fi
  if [[ "$PROFILE_OWNED" == "1" && "$PROFILE" == "$REPO_ROOT"/tmp/agent-browser/profile-qa-* ]]; then
    find "$PROFILE" -depth -delete 2>/dev/null || true
  fi
  if [[ "$original_status" != "0" ]]; then
    exit "$original_status"
  fi
  if [[ "$cleanup_failed" != "0" ]]; then
    exit 1
  fi
  exit 0
}
trap 'cleanup $?' EXIT
trap 'exit 130' INT TERM

(
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
  cd "$REPO_ROOT/apps/ui"
  QA_SESSION_OUTPUT_DIR="$SESSION_ARTIFACT_DIR" npx vite-node scripts/mint-prod-qa-session.ts
)

if [[ "$DO_CLOSE" == "1" ]]; then
  browser close >/dev/null 2>&1 || true
fi

b64="$(tr -d '\n' < "$OUT_B64")"

browser --session "$SESSION" --profile "$PROFILE" open "$URL"
browser --session "$SESSION" wait --load networkidle

cat <<EOF | browser --session "$SESSION" eval --stdin
(() => {
  const key = "sb-lliwdcpuuzjmxyzrjtoz-auth-token";
  const json = atob("${b64}");
  const session = JSON.parse(json).session;
  for (const k of Object.keys(localStorage)) {
    if (k.startsWith("sb-")) localStorage.removeItem(k);
  }
  localStorage.setItem(key, JSON.stringify(session));
  return { ok: true };
})()
EOF

browser --session "$SESSION" reload
browser --session "$SESSION" wait --load networkidle

cat <<'EOF' | browser --session "$SESSION" eval --stdin >/dev/null
(async () => {
  const todayLabels = ["Vandaag", "Today", "Сегодня"];
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const text = document.body?.innerText || "";
    if (todayLabels.some((label) => text.includes(label))) return { surface: "today" };
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error("Authenticated Today surface did not become visible.");
})()
EOF

echo "OK: dedicated QA session verified and startup surface loaded for $URL"
