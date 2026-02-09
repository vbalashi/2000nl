#!/usr/bin/env bash
set -euo pipefail

# Mint + inject a Supabase session into production (https://2000.dilum.io) using agent-browser,
# persisted under a dedicated browser profile directory.
#
# Prereqs:
# - agent-browser installed
# - Env vars available (default: .env.local in repo root):
#   NEXT_PUBLIC_SUPABASE_URL
#   NEXT_PUBLIC_SUPABASE_ANON_KEY
#   SUPABASE_SERVICE_ROLE_KEY
#   TEST_USER_EMAIL
#
# Notes:
# - Session is stored in localStorage under sb-lliwdcpuuzjmxyzrjtoz-auth-token (origin-scoped).
# - Use a persistent profile to avoid re-auth on each run.

usage() {
  cat <<'USAGE'
Usage: scripts/ab-auth-prod.sh [options]

Options:
  --url <url>          Target prod URL (default: https://2000.dilum.io/)
  --profile <path>     agent-browser profile dir (default: tmp/agent-browser/profile-2000nl-prod)
  --session <name>     agent-browser session name (default: prod2000)
  --env-file <path>    Env file to source (default: .env.local if present, else apps/ui/.env.local)
  --keep               Keep tmp/prod-session.{json,b64} (default: delete after injection)
  --no-close           Do not run agent-browser close before starting
  -h, --help           Show help

Examples:
  scripts/ab-auth-prod.sh
  scripts/ab-auth-prod.sh --session ab-prod --profile tmp/agent-browser/profile-2000nl-prod
USAGE
}

URL="https://2000.dilum.io/"
PROFILE="tmp/agent-browser/profile-2000nl-prod"
SESSION="prod2000"
ENV_FILE=""
KEEP_ARTIFACTS="0"
DO_CLOSE="1"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --url) URL="${2:-}"; shift 2 ;;
    --profile) PROFILE="${2:-}"; shift 2 ;;
    --session) SESSION="${2:-}"; shift 2 ;;
    --env-file) ENV_FILE="${2:-}"; shift 2 ;;
    --keep) KEEP_ARTIFACTS="1"; shift 1 ;;
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

mkdir -p tmp/agent-browser
chmod 700 tmp/agent-browser || true
chmod 700 "$(dirname "$PROFILE")" 2>/dev/null || true

OUT_JSON="tmp/agent-browser/prod-session.json"
OUT_B64="tmp/agent-browser/prod-session.b64"

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

cd "$REPO_ROOT/apps/ui"
node - <<'NODE'
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.env.TEST_USER_EMAIL;

if (!url || !anon || !service || !email) {
  throw new Error(
    'Missing env: need NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, TEST_USER_EMAIL'
  );
}

const repoRoot = path.resolve(__dirname, '..', '..');
const outJson = path.join(repoRoot, 'tmp', 'agent-browser', 'prod-session.json');
const outB64 = path.join(repoRoot, 'tmp', 'agent-browser', 'prod-session.b64');

const admin = createClient(url, service, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
const pub = createClient(url, anon, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

(async () => {
  const link = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (link.error) throw link.error;
  const otp = link.data.properties.email_otp;

  const ver = await pub.auth.verifyOtp({ email, token: otp, type: 'email' });
  if (ver.error) throw ver.error;

  const payload = { session: ver.data.session };
  fs.writeFileSync(outJson, JSON.stringify(payload, null, 2), { mode: 0o600 });
  fs.writeFileSync(outB64, Buffer.from(JSON.stringify(payload), 'utf8').toString('base64'), {
    mode: 0o600,
  });
})();
NODE

cd "$REPO_ROOT"

if [[ "$DO_CLOSE" == "1" ]]; then
  agent-browser close >/dev/null 2>&1 || true
fi

b64="$(tr -d '\n' < "$OUT_B64")"

agent-browser --session "$SESSION" --profile "$PROFILE" open "$URL"
agent-browser --session "$SESSION" wait --load networkidle

cat <<EOF | agent-browser --session "$SESSION" eval --stdin
(() => {
  const key = "sb-lliwdcpuuzjmxyzrjtoz-auth-token";
  const json = atob("${b64}");
  const session = JSON.parse(json).session;
  for (const k of Object.keys(localStorage)) {
    if (k.startsWith("sb-")) localStorage.removeItem(k);
  }
  localStorage.setItem(key, JSON.stringify(session));
  return { ok: true, expires_at: session.expires_at, email: session.user?.email || null };
})()
EOF

agent-browser --session "$SESSION" reload
agent-browser --session "$SESSION" wait --load networkidle

# Smoke check: training UI usually contains this button once authenticated.
agent-browser --session "$SESSION" wait --text "Antwoord Tonen"

if [[ "$KEEP_ARTIFACTS" != "1" ]]; then
  rm -f "$OUT_JSON" "$OUT_B64" 2>/dev/null || true
fi

echo "OK: Auth injected for $URL (session=$SESSION profile=$PROFILE)"

