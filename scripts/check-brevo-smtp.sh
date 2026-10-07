#!/bin/bash
set -euo pipefail

# Verify Brevo SMTP credentials by sending a small message to the account owner.
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  exec "$SCRIPT_DIR/brevo-smtp-keepalive.sh" --help
fi
if [[ "$#" -gt 0 ]]; then
  echo "Usage: scripts/check-brevo-smtp.sh [--help]" >&2
  exit 2
fi
exec "$SCRIPT_DIR/brevo-smtp-keepalive.sh" "vbalashi@gmail.com"
