#!/usr/bin/env bash
set -euo pipefail

exec env -i \
  PATH="$PATH" \
  HOME="$HOME" \
  USER="${USER:-}" \
  LANG="${LANG:-C}" \
  TMPDIR="${TMPDIR:-/tmp}" \
  agent-browser "$@"
