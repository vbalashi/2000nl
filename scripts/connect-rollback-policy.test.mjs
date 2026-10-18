import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const workflow = readFileSync(path.join(root, '.github/workflows/deploy-nuc.yml'), 'utf8');
const capture = workflow.slice(workflow.indexOf('          CURRENT_CONTAINER='), workflow.indexOf('          export UI_IMAGE_TAG="${COMMIT_FULL}"'));
const handler = workflow.slice(workflow.indexOf('          on_err() {'), workflow.indexOf('          trap on_err ERR'));
assert.ok(capture.includes('CURRENT_CONNECT_CREDENTIALS'));
assert.ok(handler.includes('ROLLBACK_READY'));

for (const [name, label, container, restores] of [
  ['missing marker', '<no value>', 'abc123', false],
  ['empty marker', '', 'abc123', false],
  ['old native marker', 'native-v1', 'abc123', false],
  ['opaque predecessor', 'opaque-v2', 'abc123', true],
  ['no predecessor', '', '', false],
]) {
  test(`failed opaque cutover: ${name}`, () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'connect-rollback-policy-'));
    const record = path.join(directory, 'commands');
    try {
      // Execute the actual workflow selection and error handler. Docker and
      // notification transport are stubbed; no app, Docker or network is touched.
      const script = `
sg() {
  printf '%s\\n' "$3" >> "$TEST_RECORD"
  case "$3" in
    'docker compose ps -q ui') printf '%s' "$TEST_CONTAINER" ;;
    'docker inspect '* ) printf '%s' 'sha256:abc123' ;;
    'docker image inspect '* ) printf '%s' "$TEST_LABEL" ;;
  esac
  return 0
}
send_telegram() { printf '%s\\n' "$*"; }
ROLLBACK_READY=0
ROLLBACK_BLOCKED_REASON='no previous image existed'
ROLLBACK_TAG='rollback-fixture'
COMMIT_FULL='fixture'
${capture}
printf 'READY=%s\\n' "$ROLLBACK_READY"
APP_SWITCHED=1
WORKER_ROLLBACK_READY=1
DEPLOY_START=$(date +%s)
NEXT_PUBLIC_APP_VERSION=fixture
COMMIT=fixture
DEPLOY_SERVER_NAME=fixture
${handler}
false
on_err
`;
      const result = spawnSync('bash', ['-c', script], {
        encoding: 'utf8', env: { PATH: process.env.PATH, TEST_RECORD: record, TEST_LABEL: label, TEST_CONTAINER: container },
      });
      assert.equal(result.status, 1, result.stderr);
      const commands = readFileSync(record, 'utf8');
      assert.match(result.stdout, new RegExp(`READY=${restores ? 1 : 0}`));
      assert.equal(commands.includes('docker tag sha256:abc123'), restores);
      assert.equal(commands.includes('docker compose up -d --no-build ui'), restores);
      assert.equal(commands.includes('docker compose stop ui'), !restores);
      assert.equal(commands.includes('docker compose --profile translation-jobs stop translation-worker'), !restores);
      if (restores) assert.match(result.stdout, /previous app image restored; forward DB migrations retained/);
      else {
        assert.match(result.stdout, /incompatible new app stopped; operator action required/);
        if (container) assert.match(result.stdout, /native issuer rollback prohibited/);
      }
      if (container) assert.match(commands, /index \.Config\.Labels "io\.2000nl\.connect-credentials"/);
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
}

test('production runner image carries the opaque boundary marker', () => {
  const dockerfile = readFileSync(path.join(root, 'apps/ui/Dockerfile'), 'utf8');
  const runner = dockerfile.split('FROM node:22-bookworm-slim AS runner\n')[1];
  assert.ok(runner, 'final runner stage exists');
  assert.match(runner, /^LABEL io\.2000nl\.connect-credentials="opaque-v2"$/m);
});
