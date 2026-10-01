#!/usr/bin/env bash
# Mint a production QA session, run one measurement script, always revoke.
# Usage: scripts/latency-audit/run.sh <script.mjs> [args...]
# See docs/runbooks/production-latency-measurement.md before running.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
ENV_FILE="${LATENCY_AUDIT_ENV_FILE:-$REPO_ROOT/.env.local}"
ART="$REPO_ROOT/tmp/latency-audit/session-$$"
mkdir -p "$ART"; chmod 700 "$ART"
cleanup() {
  if [[ -f "$ART/prod-session.json" ]]; then
    if bash "$REPO_ROOT/scripts/lib/revoke-prod-qa-session.sh" "$ENV_FILE" "$ART/prod-session.json" "$REPO_ROOT" >/dev/null 2>&1; then
      echo "QA session revoked"
      rm -f "$ART/prod-session.json" "$ART/prod-session.b64"
    else
      echo "WARNING: revoke failed; session artifacts kept in $ART for manual revocation" >&2
      return
    fi
  fi
  rmdir "$ART" 2>/dev/null || true
}
trap cleanup EXIT
(
  set -a; source "$ENV_FILE"; set +a
  cd "$REPO_ROOT/apps/ui"
  QA_SESSION_OUTPUT_DIR="$ART" npx vite-node scripts/mint-prod-qa-session.ts
)
cd "$REPO_ROOT/apps/ui"
SESSION_JSON="$ART/prod-session.json" node "$SCRIPT_DIR/$1" "${@:2}"
