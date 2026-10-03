import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { ensureUserWithSettings, getDbUrl, runMigrations, withTransaction } from "./dbTestUtils";

const dbUrl = getDbUrl();
const describeIfDb = dbUrl ? describe : describe.skip;

describeIfDb("dictionary publication access boundary", () => {
  const pool = new Pool({ connectionString: dbUrl });

  beforeAll(async () => { await runMigrations(pool); });
  afterAll(async () => { await pool.end(); });

  test("enforces general and restricted publication, then restores access after republish", async () => {
    await withTransaction(pool, async (client) => {
      const ownerId = randomUUID();
      const trustedId = randomUUID();
      const ordinaryId = randomUUID();
      const premiumId = randomUUID();
      const operatorId = randomUUID();
      await ensureUserWithSettings(client, ownerId);
      await ensureUserWithSettings(client, trustedId);
      await ensureUserWithSettings(client, ordinaryId);
      await ensureUserWithSettings(client, premiumId);
      await ensureUserWithSettings(client, operatorId);
      await client.query(`update user_settings set subscription_tier = 'premium' where user_id = $1`, [premiumId]);
      await client.query(
        `insert into admin_operators (email, user_id, is_active, permissions)
         values ($1, $2, true, ARRAY['publication.manage']::text[])`,
        [`operator-${operatorId}@example.test`, operatorId],
      );

      const { rows } = await client.query(
        `insert into dictionaries (language_code, slug, name, kind, visibility, owner_user_id, minimum_subscription_tier)
         values ('nl', $1, 'Publication access fixture', 'curated', 'private', $2, 'premium')
         returning id`,
        [`publication-access-${randomUUID()}`, ownerId],
      );
      const dictionaryId = rows[0].id as string;

      expect((await client.query(`select can_access_dictionary($1, $2, 'read') as allowed`, [ordinaryId, dictionaryId])).rows[0].allowed).toBe(false);

      await client.query(`update dictionaries set publication_state = 'general' where id = $1`, [dictionaryId]);
      expect((await client.query(`select can_access_dictionary($1, $2, 'read') as allowed`, [ordinaryId, dictionaryId])).rows[0].allowed).toBe(false);
      expect((await client.query(`select can_browse_dictionary($1, $2) as allowed`, [ordinaryId, dictionaryId])).rows[0].allowed).toBe(true);
      expect((await client.query(`select can_access_dictionary($1, $2, 'read') as allowed`, [premiumId, dictionaryId])).rows[0].allowed).toBe(true);
      expect((await client.query(`select can_access_dictionary($1, $2, 'read') as allowed`, [operatorId, dictionaryId])).rows[0].allowed).toBe(false);
      await client.query(`update user_settings set subscription_tier = 'free' where user_id = $1`, [premiumId]);
      expect((await client.query(`select can_access_dictionary($1, $2, 'read') as allowed`, [premiumId, dictionaryId])).rows[0].allowed).toBe(false);
      expect((await client.query(`select can_browse_dictionary($1, $2) as allowed`, [premiumId, dictionaryId])).rows[0].allowed).toBe(true);
      expect((await client.query(`select publication_state from dictionaries where id = $1`, [dictionaryId])).rows[0].publication_state).toBe("general");
      await client.query(`update user_settings set subscription_tier = 'premium' where user_id = $1`, [premiumId]);

      await client.query(`select replace_dictionary_audience($1, $2::text[], $3::uuid[])`, [dictionaryId, ["trusted"], []]);
      await client.query(`update dictionaries set publication_state = 'restricted' where id = $1`, [dictionaryId]);
      expect((await client.query(`select can_access_dictionary($1, $2, 'read') as allowed`, [ordinaryId, dictionaryId])).rows[0].allowed).toBe(false);
      expect((await client.query(`select can_browse_dictionary($1, $2) as allowed`, [premiumId, dictionaryId])).rows[0].allowed).toBe(false);

      await client.query(`select replace_dictionary_audience($1, $2::text[], $3::uuid[])`, [dictionaryId, [], [trustedId]]);
      expect((await client.query(`select can_access_dictionary($1, $2, 'read') as allowed`, [trustedId, dictionaryId])).rows[0].allowed).toBe(true);

      await client.query(`update dictionaries set publication_state = 'unpublished' where id = $1`, [dictionaryId]);
      expect((await client.query(`select can_access_dictionary($1, $2, 'read') as allowed`, [trustedId, dictionaryId])).rows[0].allowed).toBe(false);
      await client.query(`update dictionaries set publication_state = 'general' where id = $1`, [dictionaryId]);
      expect((await client.query(`select can_access_dictionary($1, $2, 'read') as allowed`, [ordinaryId, dictionaryId])).rows[0].allowed).toBe(false);
      expect((await client.query(`select can_access_dictionary($1, $2, 'read') as allowed`, [premiumId, dictionaryId])).rows[0].allowed).toBe(true);
    });
  });

  test("defaults new rows to unpublished while translating explicit legacy visibility", async () => {
    await withTransaction(pool, async (client) => {
      const { rows: unpublishedRows } = await client.query(
        `insert into dictionaries (language_code, slug, name, kind)
         values ('nl', $1, 'Unpublished by default fixture', 'curated') returning publication_state, visibility`,
        [`publication-default-${randomUUID()}`],
      );
      expect(unpublishedRows[0]).toEqual({ publication_state: "unpublished", visibility: "private" });

      const { rows: legacyRows } = await client.query(
        `insert into dictionaries (language_code, slug, name, kind, visibility)
         values ('nl', $1, 'Legacy published fixture', 'curated', 'system') returning publication_state, visibility`,
        [`publication-legacy-${randomUUID()}`],
      );
      expect(legacyRows[0]).toEqual({ publication_state: "general", visibility: "public" });
    });
  });

  test("applies the publication gate to Platform V2 direct lookup", async () => {
    await withTransaction(pool, async (client) => {
      const { rows } = await client.query(
        `select pg_get_functiondef(
          'private.lookup_platform_v2_entries_base_v1(uuid,boolean,text,text,text,integer,integer)'::regprocedure
        ) as definition`,
      );
      expect(rows[0].definition).toContain("can_browse_dictionary(p_user_id, dictionary.id)");
    });
  });

  test("changes restricted publication and its grants in one database operation", async () => {
    await withTransaction(pool, async (client) => {
      const userId = randomUUID();
      await ensureUserWithSettings(client, userId);
      const { rows } = await client.query(
        `insert into dictionaries (language_code, slug, name, kind)
         values ('nl', $1, 'Atomic publication fixture', 'curated') returning id`,
        [`publication-atomic-${randomUUID()}`],
      );
      const dictionaryId = rows[0].id as string;

      await client.query(
        `select set_dictionary_publication($1, 'restricted', $2::text[], $3::uuid[])`,
        [dictionaryId, ["trusted"], [userId]],
      );
      const result = await client.query(
        `select publication_state, can_access_dictionary($2, id, 'read') as allowed
           from dictionaries where id = $1`,
        [dictionaryId, userId],
      );
      expect(result.rows[0]).toEqual({ publication_state: "restricted", allowed: true });

      await client.query(`select set_dictionary_publication($1, 'unpublished', $2::text[], $3::uuid[])`, [dictionaryId, ["trusted"], [userId]]);
      expect((await client.query(`select can_access_dictionary($1, $2, 'read') as allowed`, [userId, dictionaryId])).rows[0].allowed).toBe(false);
    });
  });

  test("replaces access group membership atomically", async () => {
    await withTransaction(pool, async (client) => {
      const firstUser = randomUUID();
      const secondUser = randomUUID();
      await ensureUserWithSettings(client, firstUser);
      await ensureUserWithSettings(client, secondUser);

      await client.query(`select replace_dictionary_access_group($1, $2, $3::uuid[])`, ["trusted", "Trusted", [firstUser]]);
      await client.query(`select replace_dictionary_access_group($1, $2, $3::uuid[])`, ["trusted", "Trusted", [secondUser]]);
      const { rows } = await client.query(
        `select g.key, g.name, array_agg(m.user_id order by m.user_id) as member_ids
           from dictionary_access_groups g
           join dictionary_access_group_members m on m.group_id = g.id
          where g.key = 'trusted'
          group by g.key, g.name`,
      );
      expect(rows).toEqual([{ key: "trusted", name: "Trusted", member_ids: [secondUser] }]);
    });
  });

  test("restricted search and direct-ID reads follow publication, grant revocation, and republish", async () => {
    await withTransaction(pool, async (client) => {
      const trustedUser = randomUUID();
      const ordinaryUser = randomUUID();
      const premiumUser = randomUUID();
      await ensureUserWithSettings(client, trustedUser);
      await ensureUserWithSettings(client, ordinaryUser);
      await ensureUserWithSettings(client, premiumUser);
      await client.query(`update user_settings set subscription_tier = 'premium' where user_id = $1`, [premiumUser]);
      await client.query(`select replace_dictionary_access_group($1, $2, $3::uuid[])`, ["trusted", "Trusted", [trustedUser]]);
      const query = `publicationprobe${randomUUID().replaceAll("-", "")}`;
      const { rows: dictionaryRows } = await client.query(
        `insert into dictionaries (language_code, slug, name, kind, visibility, minimum_subscription_tier)
         values ('nl', $1, 'Restricted search fixture', 'curated', 'private', 'premium') returning id`,
        [`publication-search-${randomUUID()}`],
      );
      const dictionaryId = dictionaryRows[0].id as string;
      const { rows: entryRows } = await client.query(
        `insert into word_entries (dictionary_id, language_code, headword, meaning_id, part_of_speech, raw)
         values ($1, 'nl', $2, 1, 'noun', '{"meanings":[{"definition":"publication probe definition"}]}'::jsonb)
         returning id`,
        [dictionaryId, query],
      );
      const entryId = entryRows[0].id as string;
      const identityScheme = `publication-test-${randomUUID()}`;
      const { rows: importRows } = await client.query(
        `insert into private.dictionary_import_runs (
           dictionary_id, identity_scheme_version, artifact_format_version,
           manifest_checksum, input_checksum, source_record_count, artifact_count, status
         ) values ($1, $2, 'test-v1', $3, $4, 1, 1, 'completed') returning id`,
        [dictionaryId, identityScheme, randomUUID(), randomUUID()],
      );
      await client.query(
        `insert into private.source_entry_bindings (
           dictionary_id, identity_scheme_version, source_entry_key, source_group_key,
           sense_ordinal, word_entry_id, binding_state, first_seen_run_id, last_seen_run_id,
           manifest_checksum, content_fingerprint_version, content_fingerprint,
           identity_evidence, reconciliation_decision
         ) values ($1, $2, 'publication-entry', 'publication-group', 1, $3, 'active', $4, $4,
                   'test-manifest', 'test-v1', 'test-fingerprint', '{"kind":"test"}', '{"decision":"create"}')`,
        [dictionaryId, identityScheme, entryId, importRows[0].id],
      );
      await client.query(`select refresh_dictionary_search_document($1, 2)`, [entryId]);
      await client.query(`select set_config('request.jwt.claim.sub', $1, true)`, [trustedUser]);
      await client.query(`select set_dictionary_publication($1, 'restricted', $2::text[], $3::uuid[])`, [dictionaryId, ["trusted"], [trustedUser]]);

      const readViews = async (userId: string) => {
        await client.query(`select set_config('request.jwt.claim.sub', $1, true)`, [userId]);
        const { rows: searchRows } = await client.query(
          `select search_dictionary_groups_v1($1, 'nl', NULL, 'headwords', 10, NULL) as result`,
          [query],
        );
        const { rows: directRows } = await client.query(`select fetch_dictionary_entry_by_id_gated($1) as result`, [entryId]);
        const { rows: publicSearchRows } = await client.query(
          `select search_public_dictionary_groups_v1($1, 'nl', 'headwords', 10, NULL) as result`,
          [query],
        );
        const { rows: platformRows } = await client.query(
          `select lookup_platform_v2_entries($1, false, $2, 'nl', NULL, 10, 50) as result`,
          [userId, query],
        );
        const { rows: platformCatalogRows } = await client.query(
          `select lookup_platform_v2_entries(NULL, true, $1, 'nl', NULL, 10, 50) as result`,
          [query],
        );
        return {
          matches: searchRows[0].result.groups[0].items.length,
          directEntry: directRows[0].result,
          publicMatches: publicSearchRows[0].result.groups[0].items.length,
          platformMatches: Array.isArray(platformRows[0].result.items) ? platformRows[0].result.items.length : 0,
          platformCatalogMatches: Array.isArray(platformCatalogRows[0].result.items) ? platformCatalogRows[0].result.items.length : 0,
        };
      };

      expect(await readViews(trustedUser)).toMatchObject({ matches: 1, directEntry: { id: entryId }, publicMatches: 0, platformMatches: 1, platformCatalogMatches: 0 });
      expect(await readViews(ordinaryUser)).toMatchObject({ matches: 0, directEntry: null, publicMatches: 0, platformMatches: 0, platformCatalogMatches: 0 });
      expect(await readViews(premiumUser)).toMatchObject({ matches: 0, directEntry: null, publicMatches: 0, platformMatches: 0, platformCatalogMatches: 0 });

      await client.query(`select set_dictionary_publication($1, 'unpublished', $2::text[], $3::uuid[])`, [dictionaryId, ["trusted"], [trustedUser]]);
      expect(await readViews(trustedUser)).toMatchObject({ matches: 0, directEntry: null, publicMatches: 0, platformMatches: 0, platformCatalogMatches: 0 });

      await client.query(`select replace_dictionary_access_group($1, $2, $3::uuid[])`, ["trusted", "Trusted", []]);
      expect(await readViews(trustedUser)).toMatchObject({ matches: 0, directEntry: null, publicMatches: 0, platformMatches: 0, platformCatalogMatches: 0 });

      await client.query(`select replace_dictionary_access_group($1, $2, $3::uuid[])`, ["trusted", "Trusted", [trustedUser]]);
      await client.query(`select set_dictionary_publication($1, 'restricted', $2::text[], $3::uuid[])`, [dictionaryId, ["trusted"], []]);
      expect(await readViews(trustedUser)).toMatchObject({ matches: 1, directEntry: { id: entryId }, publicMatches: 0, platformMatches: 1, platformCatalogMatches: 0 });

      await client.query(`select set_dictionary_publication($1, 'general', $2::text[], $3::uuid[])`, [dictionaryId, [], []]);
      expect(await readViews(ordinaryUser)).toMatchObject({ matches: 1, directEntry: { id: entryId }, publicMatches: 1, platformMatches: 1, platformCatalogMatches: 1 });
      expect(await readViews(premiumUser)).toMatchObject({ matches: 1, directEntry: { id: entryId }, publicMatches: 1, platformMatches: 1, platformCatalogMatches: 1 });
    });
  });

  test("preserves user and curated list references while returning a non-identifying source availability summary", async () => {
    await withTransaction(pool, async (client) => {
      const member = randomUUID();
      await ensureUserWithSettings(client, member);
      await client.query(`select set_config('request.jwt.claim.sub', $1, true)`, [member]);
      const { rows: dictionaryRows } = await client.query(
        `insert into dictionaries (language_code, slug, name, kind)
         values ('nl', $1, 'Restricted collection source fixture', 'curated') returning id`,
        [`publication-list-source-${randomUUID()}`],
      );
      const dictionaryId = dictionaryRows[0].id as string;
      const { rows: entryRows } = await client.query(
        `insert into word_entries (dictionary_id, language_code, headword, meaning_id, part_of_speech, raw)
         values ($1, 'nl', $2, 1, 'noun', '{"meanings":[{"definition":"collection fixture"}]}'::jsonb)
         returning id`,
        [dictionaryId, `collectionfixture${randomUUID().replaceAll("-", "")}`],
      );
      const entryId = entryRows[0].id as string;
      const { rows: curatedRows } = await client.query(
        `insert into word_lists (language_code, primary_language_code, name, slug)
         values ('nl', 'nl', 'Publication availability fixture', $1) returning id`,
        [`publication-list-${randomUUID()}`],
      );
      const curatedListId = curatedRows[0].id as string;
      const { rows: userListRows } = await client.query(
        `insert into user_word_lists (user_id, language_code, primary_language_code, name)
         values ($1, 'nl', 'nl', 'Saved publication fixture') returning id`,
        [member],
      );
      const userListId = userListRows[0].id as string;
      await client.query(`insert into word_list_items (list_id, word_id) values ($1, $2)`, [curatedListId, entryId]);
      await client.query(`insert into user_word_list_items (list_id, word_id) values ($1, $2)`, [userListId, entryId]);

      await client.query(`select replace_dictionary_access_group($1, $2, $3::uuid[])`, ["trusted", "Trusted", [member]]);
      await client.query(`select set_dictionary_publication($1, 'restricted', $2::text[], $3::uuid[])`, [dictionaryId, ["trusted"], []]);

      const readCollections = async () => {
        const { rows } = await client.query(`select get_available_word_lists($1, 'nl', NULL) as lists`, [member]);
        return rows[0].lists as Array<Record<string, any>>;
      };
      const expectAvailability = (lists: Array<Record<string, any>>, id: string, type: "word_list_items" | "user_word_list_items", available: number, unavailable: number) => {
        const list = lists.find((item) => item.id === id);
        expect(list).toBeDefined();
        expect(list?.[type][0]).toMatchObject({ count: 1, available_count: available, unavailable_source_count: unavailable });
        expect(JSON.stringify(list)).not.toContain(dictionaryId);
        expect(JSON.stringify(list)).not.toContain("Restricted collection source fixture");
      };

      expectAvailability(await readCollections(), curatedListId, "word_list_items", 1, 0);
      expectAvailability(await readCollections(), userListId, "user_word_list_items", 1, 0);

      await client.query(`select replace_dictionary_access_group($1, $2, $3::uuid[])`, ["trusted", "Trusted", []]);
      const unavailableLists = await readCollections();
      expectAvailability(unavailableLists, curatedListId, "word_list_items", 0, 1);
      expectAvailability(unavailableLists, userListId, "user_word_list_items", 0, 1);

      await client.query(`select replace_dictionary_access_group($1, $2, $3::uuid[])`, ["trusted", "Trusted", [member]]);
      const restoredLists = await readCollections();
      expectAvailability(restoredLists, curatedListId, "word_list_items", 1, 0);
      expectAvailability(restoredLists, userListId, "user_word_list_items", 1, 0);
    });
  });
});
