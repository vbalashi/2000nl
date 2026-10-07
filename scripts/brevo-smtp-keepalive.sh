#!/bin/bash
set -euo pipefail

# Send one small message through Brevo SMTP. This records SMTP key usage and
# can be used to avoid automatic expiry of an otherwise idle key.

SERVICE="2000nl-brevo-smtp"
ACCOUNT="${BREVO_SMTP_LOGIN:-}"
RECIPIENT="${1:-}"

usage() {
  cat <<'EOF'
Usage: scripts/brevo-smtp-keepalive.sh <recipient-email>

On first use, BREVO_SMTP_LOGIN and the SMTP key (BREVO_SMTP_KEY) can be
provided as environment variables. The script offers to save them in the
macOS Keychain, then uses Keychain for later runs.

Required: set BREVO_SMTP_FROM to a verified sender address or enter it at the
prompt. The SMTP login is only a credential and must not be used as From.
EOF
}

if [[ -z "$RECIPIENT" || "$RECIPIENT" == "--help" || "$RECIPIENT" == "-h" ]]; then
  usage
  exit $([[ -z "$RECIPIENT" ]] && echo 2 || echo 0)
fi

if [[ -z "$ACCOUNT" ]]; then
  ACCOUNT="$(security find-generic-password -s "$SERVICE" -a login -w 2>/dev/null || true)"
fi

SMTP_KEY="${BREVO_SMTP_KEY:-}"
if [[ -z "$SMTP_KEY" ]]; then
  SMTP_KEY="$(security find-generic-password -s "$SERVICE" -a key -w 2>/dev/null || true)"
fi

if [[ -z "$ACCOUNT" ]]; then
  read -r -p "Brevo SMTP login: " ACCOUNT
fi
if [[ -z "$SMTP_KEY" ]]; then
  read -r -s -p "Brevo SMTP key: " SMTP_KEY
  printf '\n'
fi

if [[ -z "$ACCOUNT" || -z "$SMTP_KEY" ]]; then
  echo "SMTP login and key are required." >&2
  exit 2
fi

if [[ -n "${BREVO_SMTP_LOGIN:-}" || -n "${BREVO_SMTP_KEY:-}" ]]; then
  read -r -p "Save SMTP credentials in macOS Keychain for future runs? [y/N] " SAVE
  if [[ "$SAVE" =~ ^[Yy]$ ]]; then
    security add-generic-password -U -s "$SERVICE" -a login -w "$ACCOUNT"
    security add-generic-password -U -s "$SERVICE" -a key -w "$SMTP_KEY"
    echo "Credentials saved in macOS Keychain."
  fi
fi

FROM="${BREVO_SMTP_FROM:-}"
if [[ -z "$FROM" ]]; then
  read -r -p "Verified Brevo sender email (From): " FROM
fi
if [[ -z "$FROM" ]]; then
  echo "A verified sender email is required. Set BREVO_SMTP_FROM or enter it when prompted." >&2
  exit 2
fi
SUBJECT="2000NL SMTP check — $(date '+%Y-%m-%d')"
BODY="This is an automated SMTP connectivity check for 2000NL. No account or user was created."

python3 - "$ACCOUNT" "$SMTP_KEY" "$FROM" "$RECIPIENT" "$SUBJECT" "$BODY" <<'PY'
import smtplib
import ssl
import sys
from email.message import EmailMessage

login, key, sender, recipient, subject, body = sys.argv[1:]
message = EmailMessage()
message["From"] = sender
message["To"] = recipient
message["Subject"] = subject
message.set_content(body)

try:
    with smtplib.SMTP("smtp-relay.brevo.com", 587, timeout=30) as smtp:
        smtp.starttls(context=ssl.create_default_context())
        smtp.login(login, key)
        refused = smtp.send_message(message)
        if refused:
            print(f"Brevo refused recipient(s): {refused}", file=sys.stderr)
            raise SystemExit(1)
except Exception as exc:
    print(f"SMTP check failed: {type(exc).__name__}: {exc}", file=sys.stderr)
    raise SystemExit(1)

print(f"Brevo SMTP relay accepted the message for {recipient}.")
print("Acceptance does not confirm inbox delivery; check Brevo > Transactional > Logs for Sent/Delivered/Bounced/Blocked status.")
PY
