#!/usr/bin/env bash
# Real STARTTLS delivery to a disposable loopback-only Mailpit, with no external relay.
set -euo pipefail
root=$(cd "$(dirname "$0")/.." && pwd)
task_dir=$(mktemp -d "${TMPDIR:-/tmp}/2000nl-notification-smtp.XXXXXX")
task_container="2000nl-smtp-test-$$-$(basename "$task_dir")"
task_created=0
cleanup() {
  if [[ "$task_created" == 1 ]]; then
    docker stop "$task_container" >/dev/null 2>&1 || true
    docker rm "$task_container" >/dev/null 2>&1 || true
  fi
  rm -r "$task_dir"
}
trap cleanup EXIT
openssl req -x509 -newkey rsa:2048 -nodes -keyout "$task_dir/key.pem" -out "$task_dir/cert.pem" -days 1 -subj '/CN=127.0.0.1' -addext 'subjectAltName=IP:127.0.0.1' >/dev/null 2>&1
# Copy, rather than bind mount, so the test also works with a remote Docker VM.
docker create --name "$task_container" -p 127.0.0.1::1025 -p 127.0.0.1::8025 public.ecr.aws/supabase/mailpit:v1.22.3 --smtp-tls-cert /tmp/cert.pem --smtp-tls-key /tmp/key.pem --smtp-require-starttls --smtp-auth-accept-any >/dev/null
task_created=1
docker cp "$task_dir/cert.pem" "$task_container:/tmp/cert.pem"
docker cp "$task_dir/key.pem" "$task_container:/tmp/key.pem"
docker start "$task_container" >/dev/null
smtp_port=$(docker port "$task_container" 1025/tcp | sed -n 's/^127\.0\.0\.1://p')
http_port=$(docker port "$task_container" 8025/tcp | sed -n 's/^127\.0\.0\.1://p')
[[ "$smtp_port" =~ ^[0-9]+$ && "$http_port" =~ ^[0-9]+$ ]]
for attempt in {1..30}; do
  if curl -fsS "http://127.0.0.1:$http_port/api/v1/messages" >/dev/null; then break; fi
  if [[ "$attempt" == 30 ]]; then exit 1; fi
  sleep 1
done
cd "$root/apps/ui"
NODE_EXTRA_CA_CERTS="$task_dir/cert.pem" OPERATOR_TEST_SMTP_PORT="$smtp_port" OPERATOR_TEST_MAILPIT_HTTP_PORT="$http_port" npx vitest run tests/operatorNotifications/dispatchSmtp.integration.test.ts
