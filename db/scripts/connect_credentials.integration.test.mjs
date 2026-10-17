import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
const target = process.env.LOCAL_SUPABASE_DB_URL;
const root = path.resolve(import.meta.dirname, '../..');
function psql(url, sql) {
  const result = spawnSync('psql', [url, '-X', '-At', '-v', 'ON_ERROR_STOP=1'], { cwd: root, input: sql, encoding: 'utf8', timeout: 60000 });
  assert.equal(result.status, 0, result.stderr); return result.stdout.trim();
}
function asyncPsql(url, sql) {
  return new Promise((resolve, reject) => {
    const child = spawn('psql', [url, '-X', '-At', '-v', 'ON_ERROR_STOP=1'], { cwd: root });
    let output = '', error = '';
    child.stdout.on('data', (chunk) => { output += chunk; }); child.stderr.on('data', (chunk) => { error += chunk; });
    child.on('error', reject); child.on('close', (code) => code === 0 ? resolve(output.trim()) : reject(new Error(error)));
    child.stdin.end(sql);
  });
}
test('opaque Connect storage ACL and concurrent claims on disposable database', { skip: !target }, async () => {
  const url = new URL(target); assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname));
  const name = 'connect735_' + randomUUID().replaceAll('-', '');
  psql(target, 'create database ' + name); url.pathname = '/' + name; const db = url.href;
  try {
    psql(db, '\\i db/scripts/plain_postgres_supabase_compat.sql\n\\i db/migrations/bootstrap.sql\n\\i db/deploy-contract/connect-opaque-credentials-probe.sql');
    const user = randomUUID();
    psql(db, `insert into auth.users(id,email) values ('${user}','fixture@example.test');
      insert into connected_clients(client_id,display_name,client_type,allowed_redirect_uris,allowed_scopes) values ('fixture','Fixture','chrome_extension',ARRAY['https://fixture.test'],ARRAY['platform:read']);
      insert into connect_authorization_codes(code_hash,client_id,user_id,user_email,redirect_uri,scopes,code_challenge,expires_at) values ('fixture-code','fixture','${user}','fixture@example.test','https://fixture.test',ARRAY['platform:read'],'fixture',now()+interval '1 hour');
      insert into connected_client_sessions(id,client_id,user_id,scopes,refresh_token_hash,credential_version,native_session_ciphertext,access_token_hash,access_token_expires_at,refresh_token_expires_at) values ('00000000-0000-4000-8000-000000000735','fixture','${user}',ARRAY['platform:read','offline_access'],'refresh-hash',2,'encrypted-fixture','access-hash',now()+interval '1 hour',now()+interval '1 day');`);
    assert.equal(psql(db, "select has_table_privilege('authenticated','connected_client_sessions','SELECT') or has_table_privilege('anon','connected_client_sessions','SELECT')"), 'f');
    assert.equal(psql(db, "select has_table_privilege('service_role','connected_client_sessions','UPDATE')"), 't');
    const claim = "with claimed as (update connect_authorization_codes set used_at=now() where code_hash='fixture-code' and used_at is null and expires_at>now() returning id) select count(*) from claimed;";
    const results = await Promise.all([asyncPsql(db, claim), asyncPsql(db, claim)]);
    assert.deepEqual(results.sort(), ['0', '1']);
    const refreshClaim = id => `with claimed as (update connected_client_sessions set refresh_claim_id='${id}' where refresh_token_hash='refresh-hash' and refresh_claim_id is null and revoked_at is null and refresh_token_expires_at>now() returning id) select count(*) from claimed;`;
    const claims = await Promise.all([asyncPsql(db, refreshClaim(randomUUID())), asyncPsql(db, refreshClaim(randomUUID()))]);
    assert.deepEqual(claims.sort(), ['0', '1']);
    psql(db, "update connected_client_sessions set revoked_at=now();");
    assert.equal(psql(db, "with updated as (update connected_client_sessions set access_token_hash='new-hash' where refresh_token_hash='refresh-hash' and refresh_claim_id is not null and revoked_at is null returning id) select count(*) from updated"), '0');
    assert.equal(psql(db, "select access_token_hash from connected_client_sessions"), 'access-hash');
  } finally { psql(target, 'drop database ' + name + ' with(force)'); }
});
