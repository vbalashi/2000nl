import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const ui = resolve(root, 'apps/ui');
const status = JSON.parse(readFileSync(process.env.SMOKE_STATUS_FILE, 'utf8'));
const api = new URL(status.API_URL);
if (api.hostname !== '127.0.0.1' || api.protocol !== 'http:') throw new Error('Invalid local API target');
const env = {
  ...process.env,
  NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: status.ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
  QA_TEST_USER_EMAIL: 'test@2000nl.test',
  QA_TEST_USER_EMAIL_ALLOWLIST: 'test@2000nl.test',
  APP_ROLLOUT_PROFILE: 'pilot', ADMISSION_REQUIRED: 'false',
  NEXT_FONT_GOOGLE_MOCKED_RESPONSES: resolve(ui, 'playwright/fixtures/next-font-google-mocked-responses.cjs'),
};
const action = process.argv[2];
if (action === 'seed') {
  const require = createRequire(resolve(ui, 'package.json'));
  const client = require('@supabase/supabase-js').createClient(status.API_URL, status.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const { data, error } = await client.auth.admin.createUser({ email: 'test@2000nl.test', email_confirm: true, app_metadata: { is_qa_test_user: true } });
  if (error || !data.user) throw new Error('Could not create disposable QA account');
  writeFileSync(process.env.SMOKE_QA_FILE, JSON.stringify({ id: data.user.id }), { mode: 0o600 });
} else if (action === 'server') {
  const result = spawnSync('npm', ['run', 'dev', '--', '--hostname', '127.0.0.1', '--port', process.env.SMOKE_WEB_PORT], { cwd: ui, env, stdio: 'inherit' });
  process.exit(result.status ?? 1);
} else if (action === 'test') {
  const result = spawnSync('npx', ['playwright', 'test', '-c', 'playwright/real-smoke.config.ts'], { cwd: ui, env: { ...env, REAL_SMOKE: '1', REAL_SMOKE_BASE_URL: `http://127.0.0.1:${process.env.SMOKE_WEB_PORT}`, REAL_SMOKE_DB_PORT: process.env.SMOKE_DB_PORT, REAL_SMOKE_QA_FILE: process.env.SMOKE_QA_FILE }, stdio: 'inherit' });
  process.exit(result.status ?? 1);
} else throw new Error('Unknown action');
