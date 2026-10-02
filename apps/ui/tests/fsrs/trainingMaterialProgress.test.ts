import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { ensureUserWithSettings, getDbUrl, runMigrations, withTransaction } from "./dbTestUtils";

const dbUrl = getDbUrl();

async function dictionary(client: PoolClient, userId: string, name: string, grant: boolean) {
  const visibility = grant ? "shared" : "private";
  const { rows: [row] } = await client.query(`insert into dictionaries(language_code,slug,name,kind,visibility,minimum_subscription_tier,schema_key,schema_version)
    values('nl',$1,$2,'curated',$3,'free','nl-vandale-v1',1) returning id`, [`${name}-${randomUUID()}`, name, visibility]);
  if (grant) await client.query(`insert into dictionary_entitlements(dictionary_id,subject_type,subject_key,permission) values($1,'user',$2,'read')`, [row.id, userId]);
  return row.id as string;
}
async function entry(client: PoolClient, dictionaryId: string, headword: string) {
  const { rows: [row] } = await client.query(`insert into word_entries(dictionary_id,language_code,headword,part_of_speech,is_nt2_2000,raw)
    values($1,'nl',$2,'bn',false,'{}'::jsonb) returning id`, [dictionaryId, `${headword}-${randomUUID()}`]);
  return row.id as string;
}
async function card(client: PoolClient, userId: string, entryId: string, mode: string, next: string) {
  await client.query(`insert into user_card_status(user_id,entry_id,card_type_id,fsrs_enabled,fsrs_reps,next_review_at)
    values($1,$2,$3,true,1,now()+$4::interval)`, [userId, entryId, mode, next]);
}
async function auth(client: PoolClient, userId: string) {
  await client.query(`select set_config('request.jwt.claim.sub',$1,true)`, [userId]);
  await client.query("set local role authenticated");
}
async function read(client: PoolClient, language: string | null = "nl") {
  const { rows } = await client.query("select get_training_material_progress_v1($1) result", [language]);
  return rows[0].result;
}

(dbUrl ? describe : describe.skip)("training material progress read model", () => {
  const pool = new Pool({ connectionString: dbUrl });
  beforeAll(async () => { await runMigrations(pool); });
  afterAll(async () => { await pool.end(); });

  test("reports due and coverage for all enabled material, readable dictionaries and collections", async () => {
    await withTransaction(pool, async client => {
      const userId = randomUUID(), other = randomUUID();
      await ensureUserWithSettings(client, userId);
      await ensureUserWithSettings(client, other);
      // Migrations may seed readable Dutch entries; All is compared relative to them.
      await auth(client, userId);
      const baseline = (await read(client)).materials[0].total as number;
      await client.query("reset role");
      const open = await dictionary(client, userId, "Open", true);
      const disabled = await dictionary(client, userId, "Disabled", true);
      const locked = await dictionary(client, userId, "Locked", false);
      await client.query(`update user_settings set material_preferences=jsonb_build_object('schemaVersion',1,'learningLanguages','[]'::jsonb,'disabledDictionaryIds',jsonb_build_array($2::text))
        where user_id=$1`, [userId, disabled]);
      const [a1, a2, a3] = [await entry(client, open, "a1"), await entry(client, open, "a2"), await entry(client, open, "a3")];
      const b1 = await entry(client, disabled, "b1"), c1 = await entry(client, locked, "c1");
      await card(client, userId, a1, "word-to-definition", "-1 hour");
      await card(client, userId, a1, "definition-to-word", "-1 hour");
      await card(client, userId, a2, "word-to-definition", "3 days");
      // Introduced today: started, but not yet due again in this study day.
      await card(client, userId, a3, "word-to-definition", "-1 minute");
      await client.query(`insert into user_review_log(user_id,word_id,mode,grade,review_type,reviewed_at) values($1,$2,'word-to-definition',3,'new',now())`, [userId, a3]);
      await card(client, userId, b1, "word-to-definition", "-1 hour");
      await card(client, other, a2, "word-to-definition", "-1 hour");
      const { rows: [curated] } = await client.query(`insert into word_lists(language_code,slug,name,sort_order) values('nl',$1,'Core',1) returning id`, [`core-${userId}`]);
      for (const id of [a1, a2, b1, c1]) await client.query("insert into word_list_items(list_id,word_id) values($1,$2)", [curated.id, id]);
      const { rows: [own] } = await client.query(`insert into user_word_lists(user_id,language_code,name) values($1,'nl','Mine') returning id`, [userId]);
      await client.query("insert into user_word_list_items(list_id,word_id) values($1,$2)", [own.id, a3]);
      const { rows: [foreign] } = await client.query(`insert into user_word_lists(user_id,language_code,name) values($1,'nl','Theirs') returning id`, [other]);
      await client.query("insert into user_word_list_items(list_id,word_id) values($1,$2)", [foreign.id, a1]);

      await auth(client, userId);
      const result = await read(client);
      expect(result.languageCode).toBe("nl");
      const byKey = Object.fromEntries(result.materials.map((m: Record<string, unknown>) => [`${m.kind}:${m.id ?? ""}`, m]));
      expect(result.materials[0]).toEqual({ kind: "all", total: baseline + 3, started: 3, due: 2 });
      expect(byKey[`dictionary:${open}`]).toEqual({ kind: "dictionary", id: open, name: "Open", personal: false, total: 3, started: 3, due: 2 });
      expect(byKey[`dictionary:${disabled}`]).toBeUndefined();
      expect(byKey[`dictionary:${locked}`]).toBeUndefined();
      expect(byKey[`collection:${curated.id}`]).toEqual({ kind: "collection", id: curated.id, listType: "curated", name: "Core", personal: false, total: 2, started: 2, due: 2 });
      expect(byKey[`collection:${own.id}`]).toMatchObject({ listType: "user", name: "Mine", personal: true, total: 1, started: 1, due: 0 });
      expect(byKey[`collection:${foreign.id}`]).toBeUndefined();
      expect((await read(client, "de")).materials).toEqual([{ kind: "all", total: 0, started: 0, due: 0 }]);

      await client.query("reset role");
      const { rows: [writes] } = await client.query("select count(*)::int n from user_card_status where user_id=$1", [userId]);
      expect(writes.n).toBe(5);
    });
  });

  test("requires an authenticated principal and a canonical language", async () => {
    await withTransaction(pool, async client => {
      const userId = randomUUID();
      await ensureUserWithSettings(client, userId);
      await client.query("select set_config('request.jwt.claim.sub','',true)");
      expect(await read(client)).toEqual({ error: "unauthorized" });
      await auth(client, userId);
      for (const language of [null, "Dutch", "nl;drop"]) expect(await read(client, language)).toEqual({ error: "invalid_material_scope" });
    });
    const { rows } = await pool.query(`select
      has_function_privilege('anon','public.get_training_material_progress_v1(text)','EXECUTE') anon,
      has_function_privilege('service_role','public.get_training_material_progress_v1(text)','EXECUTE') service,
      has_function_privilege('authenticated','public.get_training_material_progress_v1(text)','EXECUTE') learner`);
    expect(rows[0]).toEqual({ anon: false, service: false, learner: true });
  });
});
