import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync, execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import test from "node:test";
const target = process.env.LOCAL_SUPABASE_DB_URL;
const root = path.resolve(import.meta.dirname, "../..");
const execute = promisify(execFile);
function psql(url, input) {
  const result = spawnSync("psql", [url, "-X", "-v", "ON_ERROR_STOP=1", "-At"], { input, encoding: "utf8", cwd: root, timeout: 60000 });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}
test("account saves isolate users/preferences and serialize concurrent devices", { skip: !target }, async () => {
  const url = new URL(target);
  assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(url.hostname));
  const name = `account_setups_test_${randomUUID().replaceAll("-", "")}`;
  psql(target, `CREATE DATABASE ${name};`);
  url.pathname = `/${name}`;
  const db = url.href;
  const user = randomUUID(), other = randomUUID();
  const document = JSON.stringify({ schemaVersion: 1, trainings: [{ id: "one", name: "Words", languageCode: "nl", draft: { sessionSize: 20 } }], mainTrainingId: "one" });
  const asUser = sql => `SET ROLE authenticated; SET request.jwt.claim.sub='${user}'; ${sql}`;
  const save = revision => `SELECT public.save_account_training_setups_v1(${revision}, '${document}'::jsonb);`;
  try {
    psql(db, "\\i db/scripts/plain_postgres_supabase_compat.sql\n\\i db/migrations/bootstrap.sql\n\\i db/migrations/180_account_training_setups.sql\n\\i db/deploy-contract/account-training-setups-probe.sql");
    psql(db, `INSERT INTO auth.users(id,email) VALUES ('${user}','a@example.test'),('${other}','b@example.test');
      INSERT INTO public.user_settings(user_id,preferences,translation_lang)
      VALUES ('${user}','{"sentinel":"unchanged"}', 'ru'),('${other}','{"sentinel":"other"}', 'en')
      ON CONFLICT(user_id) DO UPDATE SET preferences=excluded.preferences, translation_lang=excluded.translation_lang;
      GRANT SELECT,INSERT,UPDATE ON public.user_settings TO authenticated;
      GRANT USAGE ON SCHEMA auth TO authenticated;
      GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;`);
    const first = JSON.parse(psql(db, asUser(save(0))).split("\n").at(-1));
    assert.equal(first.revision, 1); assert.equal(first.conflict, false);
    assert.equal(psql(db, `SELECT preferences->>'sentinel'||':'||translation_lang FROM public.user_settings WHERE user_id='${user}';`), "unchanged:ru");
    assert.equal(psql(db, asUser(`SELECT count(*) FROM public.user_settings WHERE user_id='${other}';`)).split("\n").at(-1), "0");
    const stale = JSON.parse(psql(db, asUser(save(0))).split("\n").at(-1));
    assert.equal(stale.conflict, true); assert.equal(stale.revision, 1);
    const concurrent = async candidate => {
      const statement = asUser(save(1).replace('"Words"', `"${candidate}"`));
      const { stdout } = await execute("psql", [db, "-X", "-v", "ON_ERROR_STOP=1", "-At", "-c", statement], { timeout: 15000 });
      return JSON.parse(stdout.trim().split("\n").at(-1));
    };
    const results = await Promise.all([concurrent("Device A"), concurrent("Device B")]);
    assert.equal(results.filter(result => result.conflict === false).length, 1);
    assert.equal(results.filter(result => result.conflict === true).length, 1);
    assert.ok(results.every(result => result.revision === 2));
    const winner = results.find(result => result.conflict === false);
    assert.deepEqual(results.find(result => result.conflict === true).document, winner.document);
    assert.equal(psql(db, `SELECT training_setups_revision FROM public.user_settings WHERE user_id='${other}';`), "0");
    const invalid = spawnSync("psql", [db, "-X", "-v", "ON_ERROR_STOP=1", "-c", asUser("SELECT public.save_account_training_setups_v1(2, '{\"schemaVersion\":1,\"trainings\":[],\"mainTrainingId\":\"missing\"}');")], { encoding: "utf8" });
    assert.notEqual(invalid.status, 0); assert.match(invalid.stderr, /Invalid training setups/);
    assert.equal(psql(db, "SELECT has_function_privilege('anon','public.save_account_training_setups_v1(integer,jsonb)','EXECUTE');"), "f");
    assert.equal(psql(db, "SELECT has_function_privilege('authenticated','public.save_account_training_setups_v1(integer,jsonb)','EXECUTE');"), "t");
    // Reapplying DDL must retain both the account data and revision.
    psql(db, "\\i db/migrations/180_account_training_setups.sql");
    assert.equal(psql(db, `SELECT training_setups_revision FROM public.user_settings WHERE user_id='${user}';`), "2");
  } finally {
    psql(target, `DROP DATABASE ${name} WITH (FORCE);`);
  }
});
