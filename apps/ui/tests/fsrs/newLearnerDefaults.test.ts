import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { parseTrainingSetupsDocument } from "@/lib/training/setups/model";
import { parseMaterialPreferences } from "@/lib/training/material/model";
import { ensureUserWithSettings, getDbUrl, runMigrations, withTransaction } from "./dbTestUtils";

const url = getDbUrl();
async function source(c: PoolClient, name: string, language = "nl") {
  const slug = `defaults-${randomUUID()}`;
  const id = (await c.query(`insert into dictionaries(language_code,slug,name,publication_state)
    values($1,$2,$3,'general') returning id`, [language, slug, name])).rows[0].id as string;
  // Independently authored tiny source fixture; no corpus/frequency claims.
  const definition = "Een voorwerp dat iets op zijn plaats houdt.";
  const entry = (await c.query(`insert into word_entries(dictionary_id,language_code,headword,part_of_speech,raw)
    values($1,$2,'anker','zn',$3) returning id`, [id, language, { meanings: [{ definition }] }])).rows[0].id as string;
  const run = (await c.query(`insert into private.dictionary_import_runs(dictionary_id,identity_scheme_version,
    artifact_format_version,manifest_checksum,input_checksum,source_record_count,artifact_count,status)
    values($1,'defaults-test','test','test','test',1,1,'completed') returning id`, [id])).rows[0].id;
  await c.query(`insert into private.source_entry_bindings(dictionary_id,identity_scheme_version,source_entry_key,
    source_group_key,sense_ordinal,word_entry_id,binding_state,first_seen_run_id,last_seen_run_id,manifest_checksum,
    content_fingerprint_version,content_fingerprint,identity_evidence,reconciliation_decision)
    values($1,'defaults-test','entry','group',1,$2,'active',$3,$3,'test','test','test','{}','{}')`, [id, entry, run]);
  await c.query("select private.reconcile_platform_v2_content_nodes($1,'defaults-test',$2)", [entry, JSON.stringify([{
    inputKey: "definition", kind: "definition", sourcePath: "raw.meanings[0].definition",
    sourceNativeKey: "definition", sourceTextFingerprint: "test", sourceText: definition,
  }])]);
  await c.query("select refresh_dictionary_search_document($1,2)", [entry]);
  return { id, slug, entry, language };
}
function policy(primary: Awaited<ReturnType<typeof source>>, disabled: Awaited<ReturnType<typeof source>>[] = []) {
  return { schemaVersion: 1, languages: [{ code: primary.language, primaryDictionarySlug: primary.slug,
    disabledDictionarySlugs: disabled.map(s => s.slug), trainingName: "Dilum NL — daily practice" }] };
}
async function configure(c: PoolClient, document: unknown, revision?: number) {
  const expected = revision ?? (await c.query("select revision from private.new_learner_defaults")).rows[0].revision;
  await c.query("set local role service_role");
  const result = (await c.query("select configure_new_learner_defaults_v1($1,$2) result", [expected, document])).rows[0].result;
  await c.query("reset role");
  return result;
}
async function signup(c: PoolClient, id = randomUUID(), email = `${id}@example.test`) {
  await c.query("insert into auth.users(id,email) values($1,$2) on conflict(id) do nothing", [id, email]);
  return id;
}
async function settings(c: PoolClient, id: string) {
  return (await c.query("select * from user_settings where user_id=$1", [id])).rows[0];
}
async function auth(c: PoolClient, id: string) {
  // Supabase provides this schema usage; the plain-Postgres test shim does not.
  await c.query("grant usage on schema auth to authenticated");
  await c.query("select set_config('request.jwt.claim.sub',$1,true)", [id]);
  await c.query("set local role authenticated");
}
// The app's Library API is a service-only RPC carrying the authenticated principal.
async function library(c: PoolClient, id: string, query: string, dictionaries: string[]) {
  await c.query("reset role");
  await c.query("set local role service_role");
  const result = (await c.query("select lookup_platform_v2_library_entries($1,$2,'nl',$3) r", [id, query, dictionaries])).rows[0].r;
  await c.query("reset role");
  await c.query("set local role authenticated");
  return result;
}
async function rejected(c: PoolClient, action: () => Promise<unknown>, message: RegExp) {
  await c.query("savepoint rejected");
  await expect(action()).rejects.toThrow(message);
  await c.query("rollback to savepoint rejected");
  await c.query("release savepoint rejected");
}

(url ? describe : describe.skip)("new learner dictionary defaults", () => {
  const pool = new Pool({ connectionString: url });
  beforeAll(() => runMigrations(pool));
  afterAll(() => pool.end());

  test("passes both fresh-install postflight chains without activating a policy", async () => {
    function expand(file: string): string {
      return fs.readFileSync(path.resolve(process.cwd(), "../..", file), "utf8")
        .replace(/^\\i (.+)$/gm, (_, child: string) => expand(child.trim()));
    }
    await pool.query(expand("db/deploy-contract/postflight-288.sql"));
    await pool.query(expand("db/deploy-contract/read-only-postflight-288.sql"));
    expect((await pool.query("select document from private.new_learner_defaults")).rows[0].document).toBeNull();
  });

  test("persists a named main recipe; browse, search, counts and launched cards use enabled material", () =>
    withTransaction(pool, async c => {
      const primary = await source(c, "Dilum Nederlands"), legacy = await source(c, "Legacy fixture");
      await configure(c, policy(primary, [legacy]));
      const id = await signup(c), other = await signup(c);
      const row = await settings(c, id);
      expect(parseMaterialPreferences(row.material_preferences)).toEqual({ schemaVersion: 1,
        learningLanguages: [{ code: "nl", paused: false }], disabledDictionaryIds: [legacy.id] });
      const document = parseTrainingSetupsDocument(row.training_setups)!;
      expect(document).not.toBeNull();
      expect(document.trainings).toHaveLength(1);
      expect(document.trainings[0]).toMatchObject({ id: document.mainTrainingId,
        name: "Dilum NL — daily practice", languageCode: "nl", draft: {
          materialMode: "selected-dictionaries", dictionaryIds: [primary.id], listValue: "",
        } });
      await auth(c, id);
      // Settings inventory keeps the entitled disabled source; ordinary Library hides it.
      const inventory = (await c.query("select get_available_dictionary_sources($1,'nl') r", [id])).rows[0].r;
      expect(inventory.map((s: { id: string }) => s.id)).toContain(legacy.id);
      for (const query of ["", "anker"]) {
        const page = await library(c, id, query, [primary.id, legacy.id]);
        expect(page.error).toBeUndefined();
        expect(page.items.map((s: { id: string }) => s.id)).toEqual([primary.entry]);
        expect(page.page.nextGroupCursor).toBeNull();
      }
      const progress = (await c.query("select get_training_material_progress_v1('nl') r")).rows[0].r;
      expect(progress.materials.some((s: { id: string }) => s.id === legacy.id)).toBe(false);
      expect(progress.materials.find((s: { id: string }) => s.id === primary.id).total).toBe(1);
      const filter = { dictionaryScope: { mode: "selected", languageCode: "nl", dictionaryIds: [primary.id] } };
      const available = (await c.query("select read_training_recipe_availability_v1($1,ARRAY['word-to-definition'],null,'curated',$2) r", [id, filter])).rows[0].r;
      expect(available.newCards).toBe(1);
      const plan = (await c.query("select start_training_session($1,ARRAY['word-to-definition'],null,'curated','both',$2,'10',$3,2) r", [id, filter, randomUUID()])).rows[0].r;
      expect(plan.plannedTotal).toBe(1);
      const members = (await c.query("select entry_id from training_session_members where session_id=$1", [plan.sessionId])).rows;
      expect(members.map(s => s.entry_id)).toEqual([primary.entry]);
      expect((await c.query("select count(*)::int n from user_settings where user_id=$1", [other])).rows[0].n).toBe(0);
      // Edit through the ordinary account RPC, then read again as on reload.
      document.trainings[0].name = "My reusable lesson";
      const saved = (await c.query("select save_account_training_setups_v1($1,$2) r", [row.training_setups_revision, document])).rows[0].r;
      expect(saved.conflict).toBe(false);
      expect((await settings(c, id)).training_setups).toEqual(document);
    }));

  test("leaves existing progress, collections, setups and untouched revision-zero accounts unchanged", () =>
    withTransaction(pool, async c => {
      const primary = await source(c, "Dilum Nederlands"), legacy = await source(c, "Legacy fixture");
      await configure(c, policy(legacy));
      const existing = await signup(c);
      await configure(c, null);
      const zero = await signup(c), missing = await signup(c);
      await c.query("insert into user_card_status(user_id,entry_id,card_type_id,fsrs_enabled,fsrs_reps) values($1,$2,'word-to-definition',true,4)", [existing, legacy.entry]);
      await c.query("insert into user_word_lists(user_id,name,language_code) values($1,'Keep me','nl')", [existing]);
      await c.query("delete from user_settings where user_id=$1", [missing]);
      const before = await settings(c, existing), zeroBefore = await settings(c, zero);
      await configure(c, policy(primary, [legacy]));
      for (const id of [existing, zero, missing]) {
        await c.query("update auth.users set last_sign_in_at=now() where id=$1", [id]);
        await signup(c, id); // duplicate/concurrent initialization has no effect
      }
      expect(await settings(c, existing)).toEqual(before);
      expect(await settings(c, zero)).toEqual(zeroBefore);
      expect(await settings(c, missing)).toBeUndefined();
      expect((await c.query("select fsrs_reps from user_card_status where user_id=$1", [existing])).rows[0].fsrs_reps).toBe(4);
      expect((await c.query("select name from user_word_lists where user_id=$1", [existing])).rows[0].name).toBe("Keep me");
      // Even creating a missing settings row with an ordinary RPC is not a signup.
      await auth(c, missing);
      await c.query("select save_account_training_setups_v1(0,'{\"schemaVersion\":1,\"trainings\":[],\"mainTrainingId\":null}')");
      expect((await settings(c, missing)).material_preferences.disabledDictionaryIds).toEqual([]);
    }));

  test("config changes, login and rollback never rewrite a learner's accepted choices", () =>
    withTransaction(pool, async c => {
      const primary = await source(c, "Dilum Nederlands"), legacy = await source(c, "Legacy fixture");
      const first = await configure(c, policy(primary, [legacy]));
      const id = await signup(c), original = await settings(c, id);
      await auth(c, id);
      const prefs = { ...original.material_preferences, disabledDictionaryIds: [] };
      expect((await c.query("select save_account_material_preferences_v1(1,$1) r", [prefs])).rows[0].r.conflict).toBe(false);
      const page = await library(c, id, "", [primary.id, legacy.id]);
      expect(page.items.map((s: { id: string }) => s.id).sort()).toEqual([primary.entry, legacy.entry].sort());
      await c.query("reset role");
      await configure(c, policy(legacy, [primary]));
      expect(await configure(c, policy(primary), first.revision)).toMatchObject({ conflict: true });
      await c.query("update auth.users set last_sign_in_at=now() where id=$1", [id]);
      expect((await settings(c, id)).training_setups).toEqual(original.training_setups);
      expect((await settings(c, id)).material_preferences).toEqual(prefs);
      const next = await signup(c);
      expect((await settings(c, next)).training_setups.trainings[0].draft.dictionaryIds).toEqual([legacy.id]);
      await configure(c, null);
      expect((await settings(c, id)).material_preferences).toEqual(prefs);
      expect((await settings(c, await signup(c))).training_setups.trainings).toEqual([]);
    }));

  test("preferences cannot grant access to restricted/unpublished sources", () =>
    withTransaction(pool, async c => {
      const primary = await source(c, "Dilum Nederlands"), locked = await source(c, "Restricted fixture");
      await c.query("update dictionaries set publication_state='restricted' where id=$1", [locked.id]);
      await configure(c, policy(primary, [locked]));
      const id = await signup(c);
      await auth(c, id);
      await c.query("select save_account_material_preferences_v1(1,$1)", [{ schemaVersion: 1, learningLanguages: [], disabledDictionaryIds: [] }]);
      const page = await library(c, id, "", [locked.id]);
      expect(page.items).toEqual([]);
      expect((await c.query("select can_access_dictionary($1,$2,'read') r", [id, locked.id])).rows[0].r).toBe(false);
      const lockedScope = { dictionaryScope: { mode: "selected", languageCode: "nl", dictionaryIds: [locked.id] } };
      await rejected(c, () => c.query("select read_training_recipe_availability_v1($1,ARRAY['word-to-definition'],null,'curated',$2)", [id, lockedScope]), /training_material_unavailable/);
      const plan = (await c.query("select start_training_session($1,ARRAY['word-to-definition'],null,'curated','both',$2,'10') r", [id, lockedScope])).rows[0].r;
      expect(plan.plannedTotal).toBe(0);
      await c.query("reset role");
      await c.query("insert into dictionary_entitlements(dictionary_id,subject_type,subject_key,permission) values($1,'user',$2,'read')", [locked.id, id]);
      expect((await c.query("select can_access_dictionary($1,$2,'read') r", [id, locked.id])).rows[0].r).toBe(true);
      await c.query("update dictionaries set publication_state='unpublished' where id=$1", [locked.id]);
      expect((await c.query("select can_access_dictionary($1,$2,'read') r", [id, locked.id])).rows[0].r).toBe(false);
    }));

  test("validates configuration shape, stable identities and actual trainable content", () =>
    withTransaction(pool, async c => {
      const primary = await source(c, "Dilum Nederlands"), legacy = await source(c, "Legacy fixture");
      const good = policy(primary, [legacy]);
      for (const bad of [{}, { ...good, schemaVersion: 2 }, { ...good, secret: "no" },
        { ...good, languages: [] }, { ...good, languages: [good.languages[0], good.languages[0]] },
        policy(primary, [primary]), policy(primary, [legacy, legacy]),
        { ...good, languages: [{ ...good.languages[0], primaryDictionarySlug: primary.id }] }]) {
        await rejected(c, () => configure(c, bad), /invalid_new_learner_defaults|primary_unavailable/);
      }
      await c.query("update dictionaries set minimum_subscription_tier='premium' where id=$1", [primary.id]);
      await rejected(c, () => configure(c, good), /primary_unavailable/);
      await c.query("update dictionaries set minimum_subscription_tier='free',publication_state='unpublished' where id=$1", [primary.id]);
      await rejected(c, () => configure(c, good), /primary_unavailable/);
      await c.query("update dictionaries set publication_state='general' where id=$1", [primary.id]);
      await c.query("delete from private.platform_v2_content_nodes where entry_id=$1", [primary.entry]);
      await rejected(c, () => configure(c, good), /primary_empty/);
    }));

  test.each(["unpublished", "empty"])("fails signup atomically when configured primary becomes %s", mode =>
    withTransaction(pool, async c => {
      const primary = await source(c, "Dilum Nederlands"), legacy = await source(c, "Legacy fixture");
      await configure(c, policy(primary, [legacy]));
      if (mode === "unpublished") await c.query("update dictionaries set publication_state='unpublished' where id=$1", [primary.id]);
      else await c.query("delete from private.platform_v2_content_nodes where entry_id=$1", [primary.entry]);
      const id = randomUUID();
      await rejected(c, () => signup(c, id), /new_learner_primary_(unavailable|empty)/);
      expect((await c.query("select count(*)::int n from auth.users where id=$1", [id])).rows[0].n).toBe(0);
      expect(await settings(c, id)).toBeUndefined();
      expect((await c.query("select publication_state from dictionaries where id=$1", [legacy.id])).rows[0].publication_state).toBe("general");
    }));

  test("preserves the allowlisted operator exclusion even with a broken primary", () =>
    withTransaction(pool, async c => {
      const primary = await source(c, "Dilum Nederlands");
      await configure(c, policy(primary));
      await c.query("update dictionaries set publication_state='unpublished' where id=$1", [primary.id]);
      const id = randomUUID(), email = `operator-${id}@example.test`;
      await c.query("insert into admin_operators(email,is_active,permissions) values($1,true,ARRAY['users.read'])", [email]);
      await signup(c, id, email.toUpperCase());
      expect(await settings(c, id)).toBeUndefined();
    }));

  test("only the service role can configure; learner settings and private receipts remain protected", () =>
    withTransaction(pool, async c => {
      for (const role of ["anon", "authenticated", "service_role"]) {
        expect((await c.query("select has_function_privilege($1,'public.configure_new_learner_defaults_v1(integer,jsonb)','EXECUTE') ok", [role])).rows[0].ok).toBe(role === "service_role");
        await c.query(`set local role ${role}`);
        for (const table of ["new_learner_defaults", "new_learner_initializations"])
          await rejected(c, () => c.query(`select * from private.${table}`), /permission denied/);
        await c.query("reset role");
      }
    }));

  test("ordered language policies create persisted recipes and select the first as main", () =>
    withTransaction(pool, async c => {
      await c.query("insert into languages(code,name) values('en','English') on conflict do nothing");
      const nl = await source(c, "Dutch"), en = await source(c, "English", "en");
      await configure(c, { schemaVersion: 1, languages: [...policy(en).languages, ...policy(nl).languages] });
      const row = await settings(c, await signup(c));
      expect(row.language_code).toBe("en");
      expect(row.training_setups.trainings.map((t: { languageCode: string }) => t.languageCode)).toEqual(["en", "nl"]);
      expect(row.training_setups.mainTrainingId).toBe(row.training_setups.trainings[0].id);
    }));

  test("concurrent auth inserts seed once and serialize installation policy changes", async () => {
    const c = await pool.connect(), concurrent = await pool.connect();
    const id = randomUUID();
    let primary: Awaited<ReturnType<typeof source>> | undefined;
    try {
      await c.query("begin");
      primary = await source(c, "Concurrent primary");
      await configure(c, policy(primary));
      await c.query("commit");
      await c.query("begin");
      await signup(c, id);
      await concurrent.query("set lock_timeout='150ms'");
      await expect(signup(concurrent, id)).rejects.toThrow(/lock timeout/);
      await expect(concurrent.query("select configure_new_learner_defaults_v1(1,null)")).rejects.toThrow(/lock timeout/);
      await c.query("commit");
      await signup(concurrent, id);
      expect((await c.query("select count(*)::int n from private.new_learner_initializations where user_id=$1", [id])).rows[0].n).toBe(1);
      const row = await settings(c, id);
      expect(row.training_setups.trainings).toHaveLength(1);
      expect(row.training_setups_revision).toBe(1);
      expect((await c.query("select defaults_revision from private.new_learner_initializations where user_id=$1", [id])).rows[0].defaults_revision).toBe(1);
    } finally {
      await c.query("rollback");
      await c.query("update private.new_learner_defaults set document=null,revision=0");
      await c.query("delete from auth.users where id=$1", [id]);
      if (primary) {
        await c.query("delete from private.platform_v2_content_nodes where entry_id=$1", [primary.entry]);
        await c.query("delete from private.source_entry_bindings where dictionary_id=$1", [primary.id]);
        await c.query("delete from private.dictionary_import_runs where dictionary_id=$1", [primary.id]);
        await c.query("delete from word_entries where dictionary_id=$1", [primary.id]);
        await c.query("delete from dictionaries where id=$1", [primary.id]);
      }
      c.release(); concurrent.release();
    }
  });
});
