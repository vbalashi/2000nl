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
test("material settings preserve user/session state and serialize concurrent devices", { skip: !target }, async () => {
  const url = new URL(target);
  assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(url.hostname));
  const name = `material_preferences_test_${randomUUID().replaceAll("-", "")}`;
  psql(target, `CREATE DATABASE ${name};`);
  url.pathname = `/${name}`;
  const db = url.href;
  const user = randomUUID(), other = randomUUID();
  const document = JSON.stringify({ schemaVersion: 1, learningLanguages: [{code:"nl",paused:false},{code:"en",paused:true}],disabledDictionaryIds:["11111111-1111-4111-8111-111111111111"] });
  const asUser = sql => `SET ROLE authenticated; SET request.jwt.claim.sub='${user}'; ${sql}`;
  const save = revision => `SELECT public.save_account_material_preferences_v1(${revision}, '${document}'::jsonb);`;
  try {
    psql(db, "\\i db/scripts/plain_postgres_supabase_compat.sql\n\\i db/migrations/bootstrap.sql\n\\i db/migrations/183_account_material_preferences.sql\n\\i db/deploy-contract/account-material-preferences-probe.sql");
    psql(db, `INSERT INTO auth.users(id,email) VALUES ('${user}','a@example.test'),('${other}','b@example.test');
      INSERT INTO public.user_settings(user_id,preferences,translation_lang)
      VALUES ('${user}','{"sentinel":"unchanged"}', 'ru'),('${other}','{"sentinel":"other"}', 'en')
      ON CONFLICT(user_id) DO UPDATE SET preferences=excluded.preferences, translation_lang=excluded.translation_lang;
      GRANT SELECT,INSERT,UPDATE ON public.user_settings TO authenticated;
      GRANT USAGE ON SCHEMA auth TO authenticated;
      GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;`);
    psql(db, `INSERT INTO public.training_sessions(id,user_id,session_size,card_type_ids,card_filter,training_filter) VALUES ('${randomUUID()}','${user}','10',ARRAY['word-to-definition'],'both','{"sentinel":"existing-run"}');`);
    const sessionBefore=psql(db,"SELECT row_to_json(session)::text FROM public.training_sessions session;");
    const first = JSON.parse(psql(db, asUser(save(0))).split("\n").at(-1));
    assert.equal(first.revision, 1); assert.equal(first.conflict, false);
    assert.equal(psql(db, `SELECT preferences->>'sentinel'||':'||translation_lang FROM public.user_settings WHERE user_id='${user}';`), "unchanged:ru");
    assert.equal(psql(db, asUser(`SELECT count(*) FROM public.user_settings WHERE user_id='${other}';`)).split("\n").at(-1), "0");
    const stale = JSON.parse(psql(db, asUser(save(0))).split("\n").at(-1));
    assert.equal(stale.conflict, true); assert.equal(stale.revision, 1);
    const concurrent = async candidate => {
      const statement = asUser(save(1).replace('"en"', candidate === 'Device A' ? '"de"' : '"fr"'));
      const { stdout } = await execute("psql", [db, "-X", "-v", "ON_ERROR_STOP=1", "-At", "-c", statement], { timeout: 15000 });
      return JSON.parse(stdout.trim().split("\n").at(-1));
    };
    const results = await Promise.all([concurrent("Device A"), concurrent("Device B")]);
    assert.equal(results.filter(result => result.conflict === false).length, 1);
    assert.equal(results.filter(result => result.conflict === true).length, 1);
    assert.ok(results.every(result => result.revision === 2));
    const winner = results.find(result => result.conflict === false);
    assert.deepEqual(results.find(result => result.conflict === true).document, winner.document);
    assert.equal(psql(db, `SELECT material_preferences_revision FROM public.user_settings WHERE user_id='${other}';`), "0");
    const invalid = spawnSync("psql", [db, "-X", "-v", "ON_ERROR_STOP=1", "-c", asUser(`SELECT public.save_account_material_preferences_v1(2, '{"schemaVersion":1,"learningLanguages":[{"code":"nl","paused":true}],"disabledDictionaryIds":[]}');`)], { encoding: "utf8" });
    assert.notEqual(invalid.status, 0); assert.match(invalid.stderr, /Invalid material preferences/);
    assert.equal(psql(db, "SELECT has_function_privilege('anon','public.save_account_material_preferences_v1(integer,jsonb)','EXECUTE');"), "f");
    assert.equal(psql(db, "SELECT has_function_privilege('authenticated','public.save_account_material_preferences_v1(integer,jsonb)','EXECUTE');"), "t");
    const directInvalid = spawnSync("psql", [db,"-X","-v","ON_ERROR_STOP=1","-c",asUser("UPDATE public.user_settings SET material_preferences='{}' WHERE user_id='"+user+"';")],{encoding:"utf8"});
    assert.notEqual(directInvalid.status,0); assert.match(directInvalid.stderr,/user_settings_material_preferences_bounds/);
    assert.equal(psql(db, "SELECT row_to_json(session)::text FROM public.training_sessions session;"), sessionBefore);
    assert.equal(psql(db, "SELECT count(*) FROM public.user_card_status;"), "0");
    assert.equal(psql(db, "SELECT count(*) FROM public.user_card_action_events;"), "0");
    // Reapplying DDL must retain both the account data and revision.
    psql(db, "\\i db/migrations/183_account_material_preferences.sql");
    assert.equal(psql(db, `SELECT material_preferences_revision FROM public.user_settings WHERE user_id='${user}';`), "2");
  } finally {
    psql(target, `DROP DATABASE ${name} WITH (FORCE);`);
  }
});
