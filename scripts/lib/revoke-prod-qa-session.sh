#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${1:?env file required}"
SESSION_JSON="${2:?session JSON required}"
REPO_ROOT="${3:?repository root required}"

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a
cd "$REPO_ROOT/apps/ui"
exec env QA_SESSION_JSON_PATH="$SESSION_JSON" npx vite-node scripts/revoke-prod-qa-session.ts
