import { beforeAll, afterAll, describe, expect, test } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "crypto";
import {
  callGetNextCard,
  ensureUserWithSettings,
  getDbUrl,
  insertWord,
  runMigrations,
  withTransaction,
} from "./dbTestUtils";
import type { PoolClient } from "pg";

const dbUrl = getDbUrl();
const hasDb = Boolean(dbUrl);
const describeIfDb = hasDb ? describe : describe.skip;

const callHandleReview = (
  client: PoolClient,
  userId: string,
  wordId: string,
  mode: string,
  result: string,
  turnId: string | null = null
) =>
  client.query(`select handle_card_review($1::uuid, $2::uuid, $3::text, $4::text, $5::uuid)`, [
    userId,
    wordId,
    mode,
    result,
    turnId,
  ]);

async function expectUnauthorizedRpc(
  client: PoolClient,
  savepointName: string,
  query: string,
  params: unknown[]
) {
  await client.query(`savepoint ${savepointName}`);
  await expect(client.query(query, params)).rejects.toThrow(/unauthorized/);
  await client.query(`rollback to savepoint ${savepointName}`);
  await client.query(`release savepoint ${savepointName}`);
}

describeIfDb("FSRS RPC integration", () => {
  const pool = new Pool({ connectionString: dbUrl });
  const mode = "word-to-definition";
  type SearchGroupResult = {
    id: string;
    total: number;
    items: Array<{
      kind: string;
      resultKey?: string;
      entry: { headword: string };
    }>;
    page: { hasMore: boolean; nextCursor: string | null };
  };

  beforeAll(async () => {
    await runMigrations(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  test("user-scoped RPCs reject null auth.uid()", async () => {
    const userId = randomUUID();
    await withTransaction(pool, async (client) => {
      await ensureUserWithSettings(client, userId);
      const wordId = await insertWord(client, `fsrs-null-auth-${Date.now()}`);
      const { rows: listRows } = await client.query(
        `insert into user_word_lists (user_id, language_code, primary_language_code, name)
         values ($1, 'nl', 'nl', $2)
         returning id`,
        [userId, `Null auth list ${Date.now()}`],
      );
      const listId = listRows[0].id;

      await client.query(`select set_config('request.jwt.claim.sub', '', true)`);

      await expectUnauthorizedRpc(
        client,
        "null_auth_next_card",
        `select get_next_card($1, ARRAY[$2]::text[], ARRAY[]::uuid[])`,
        [userId, mode],
      );
      await expectUnauthorizedRpc(
        client,
        "null_auth_review",
        `select handle_card_review($1, $2, $3, 'success', NULL)`,
        [userId, wordId, mode],
      );
      await expectUnauthorizedRpc(
        client,
        "null_auth_view",
        `select record_card_view($1, $2, $3)`,
        [userId, wordId, mode],
      );
      await expectUnauthorizedRpc(
        client,
        "null_auth_start",
        `select start_learning_entry_card($1, $2, $3)`,
        [userId, wordId, mode],
      );
      await expectUnauthorizedRpc(
        client,
        "null_auth_state",
        `select get_user_card_state($1, $2, $3)`,
        [userId, wordId, mode],
      );
      await expectUnauthorizedRpc(
        client,
        "null_auth_bulk_state",
        `select * from get_user_card_states_for_entries($1, ARRAY[$2]::uuid[], ARRAY[$3]::text[])`,
        [userId, wordId, mode],
      );
      await expectUnauthorizedRpc(
        client,
        "null_auth_stats",
        `select get_detailed_training_stats($1, ARRAY[$2]::text[], NULL, 'curated')`,
        [userId, mode],
      );
      await expectUnauthorizedRpc(
        client,
        "null_auth_preferences",
        `select get_learning_preferences($1)`,
        [userId],
      );
      await expectUnauthorizedRpc(
        client,
        "null_auth_active_list",
        `select get_active_word_list($1)`,
        [userId],
      );
      await expectUnauthorizedRpc(
        client,
        "null_auth_membership",
        `select get_user_list_membership($1, $2, ARRAY[$3]::uuid[])`,
        [userId, listId, wordId],
      );
      await expectUnauthorizedRpc(
        client,
        "null_auth_ensure_dictionary",
        `select ensure_user_dictionary($1, 'nl', 'Blocked')`,
        [userId],
      );
      await expectUnauthorizedRpc(
        client,
        "null_auth_available_lists",
        `select get_available_word_lists($1, 'nl', NULL)`,
        [userId],
      );
      await expectUnauthorizedRpc(
        client,
        "null_auth_compat_state",
        `select get_card_user_state($1, $2, $3)`,
        [userId, wordId, mode],
      );
      await expectUnauthorizedRpc(
        client,
        "null_auth_tier",
        `select get_user_tier($1)`,
        [userId],
      );
      await expectUnauthorizedRpc(
        client,
        "null_auth_list_summary",
        `select get_word_list_summary($1, $2, 'user')`,
        [userId, listId],
      );
    }, userId);
  });

  test("handle_card_review creates then updates card state", async () => {
    const userId = randomUUID();
    await withTransaction(pool, async (client) => {
      const wordId = await insertWord(client, `fsrs-review-${Date.now()}`);

      await ensureUserWithSettings(client, userId, { target_retention: 0.9 });

      await callHandleReview(client, userId, wordId, mode, "success", randomUUID());

      const { rows: first } = await client.query(
        `select fsrs_reps, fsrs_lapses, last_result, fsrs_enabled
         from user_card_status where user_id = $1 and entry_id = $2 and card_type_id = $3`,
        [userId, wordId, mode]
      );

      expect(first[0].fsrs_reps).toBe(1);
      expect(first[0].fsrs_lapses).toBe(0);
      expect(first[0].last_result).toBe("success");
      expect(first[0].fsrs_enabled).toBe(true);

      await callHandleReview(client, userId, wordId, mode, "fail", randomUUID());

      const { rows: second } = await client.query(
        `select fsrs_reps, fsrs_lapses, last_result, fsrs_last_grade
         from user_card_status where user_id = $1 and entry_id = $2 and card_type_id = $3`,
        [userId, wordId, mode]
      );

      expect(second[0].fsrs_reps).toBe(2);
      expect(second[0].fsrs_lapses).toBe(1);
      expect(second[0].last_result).toBe("fail");
      expect(second[0].fsrs_last_grade).toBe(1);
    }, userId);
  });

  test("handle_card_review fail counts as lapse", async () => {
    const userId = randomUUID();
    await withTransaction(pool, async (client) => {
      const wordId = await insertWord(client, `fsrs-click-${Date.now()}`);
      await ensureUserWithSettings(client, userId);

      // Seed with a success so we have prior state.
      await callHandleReview(client, userId, wordId, mode, "success", randomUUID());

      await callHandleReview(client, userId, wordId, mode, "fail", randomUUID());

      const { rows } = await client.query(
        `select fsrs_reps, fsrs_lapses, fsrs_last_grade, last_result
         from user_card_status where user_id = $1 and entry_id = $2 and card_type_id = $3`,
        [userId, wordId, mode]
      );

      expect(rows[0].fsrs_reps).toBe(2);
      expect(rows[0].fsrs_lapses).toBe(1);
      expect(rows[0].fsrs_last_grade).toBe(1);
      expect(rows[0].last_result).toBe("fail");

      const { rows: logRows } = await client.query(
        `select review_type from user_review_log where user_id = $1 and word_id = $2`,
        [userId, wordId]
      );
      expect(logRows.some((r) => r.review_type === "review")).toBe(true);
    }, userId);
  });

  test("dictionary lookup does not mutate FSRS or review logs", async () => {
    const userId = randomUUID();
    await withTransaction(pool, async (client) => {
      await ensureUserWithSettings(client, userId);
      const wordId = await insertWord(client, `fsrs-lookup-${Date.now()}`);

      const { rows } = await client.query(
        `select fetch_dictionary_entry_gated($1) as item`,
        [`missing-${randomUUID()}`],
      );
      // The timestamped query above intentionally should miss; call the real
      // headword too so both miss and hit paths are read-only.
      expect(rows[0]?.item).toEqual([]);

      const { rows: wordRows } = await client.query(
        `select headword from word_entries where id = $1`,
        [wordId],
      );
      const { rows: hitRows } = await client.query(
        `select fetch_dictionary_entry_gated($1) as item`,
        [wordRows[0].headword],
      );
      expect(hitRows[0]?.item?.[0]?.id).toBe(wordId);

      const { rows: statusRows } = await client.query(
        `select count(*)::int as count
         from user_card_status
         where user_id = $1 and entry_id = $2`,
        [userId, wordId],
      );
      const { rows: reviewRows } = await client.query(
        `select count(*)::int as count
         from user_review_log
         where user_id = $1 and word_id = $2`,
        [userId, wordId],
      );
      const { rows: translationRows } = await client.query(
        `select count(*)::int as count
         from word_entry_translations
         where word_entry_id = $1`,
        [wordId],
      );

      expect(statusRows[0].count).toBe(0);
      expect(reviewRows[0].count).toBe(0);
      expect(translationRows[0].count).toBe(0);
    }, userId);
  });

  test("dictionary lookup by headword hides private user dictionaries from other users", async () => {
    const ownerId = randomUUID();
    const otherId = randomUUID();
    await withTransaction(pool, async (client) => {
      await ensureUserWithSettings(client, ownerId);
      await ensureUserWithSettings(client, otherId);

      await client.query(`select set_config('request.jwt.claim.sub', $1, true)`, [
        ownerId,
      ]);
      const headword = `fsrs-private-lookup-${Date.now()}`;
      const { rows: createRows } = await client.query(
        `select create_user_dictionary_entry(
          $1,
          NULL,
          jsonb_build_object(
            'headword', $2::text,
            'languageCode', 'nl',
            'definition', 'private definition'
          )
        ) as word_id`,
        [ownerId, headword],
      );

      const { rows: ownerRows } = await client.query(
        `select fetch_dictionary_entry_gated($1) as items`,
        [headword],
      );
      expect(ownerRows[0].items.map((item: { id: string }) => item.id)).toContain(
        createRows[0].word_id,
      );

      await client.query(`select set_config('request.jwt.claim.sub', $1, true)`, [
        otherId,
      ]);
      const { rows: otherRows } = await client.query(
        `select fetch_dictionary_entry_gated($1) as items`,
        [headword],
      );
      expect(otherRows[0].items).toEqual([]);

      const { rows: statusRows } = await client.query(
        `select count(*)::int as count
         from user_card_status
         where user_id = $1 and entry_id = $2`,
        [otherId, createRows[0].word_id],
      );
      expect(statusRows[0].count).toBe(0);
    }, ownerId);
  });

  test("public catalog search excludes private dictionaries under service role", async () => {
    const ownerId = randomUUID();
    await withTransaction(pool, async (client) => {
      await ensureUserWithSettings(client, ownerId);
      const headword = `catalog-private-${Date.now()}`;

      const { rows: publicDictionaryRows } = await client.query(
        `select id from dictionaries where slug = 'nl-vandale' limit 1`,
      );
      const publicDictionaryId = publicDictionaryRows[0].id;
      const { rows: publicRows } = await client.query(
        `insert into word_entries (
           dictionary_id, language_code, headword, meaning_id, part_of_speech, raw
         ) values ($1, 'nl', $2, 1, 'noun', jsonb_build_object('definition', 'public definition'))
         returning id`,
        [publicDictionaryId, headword],
      );

      const { rows: privateDictionaryRows } = await client.query(
        `insert into dictionaries (
           language_code, slug, name, kind, visibility, owner_user_id,
           is_editable, schema_key, schema_version
         ) values (
           'nl', $1, 'Private catalog test', 'user', 'private', $2,
           true, 'user-entry-v1', 1
         )
         returning id`,
        [`catalog-private-${Date.now()}`, ownerId],
      );
      const privateDictionaryId = privateDictionaryRows[0].id;
      const { rows: privateRows } = await client.query(
        `insert into word_entries (
           dictionary_id, language_code, headword, meaning_id, part_of_speech, raw
         ) values ($1, 'nl', $2, 1, 'noun', jsonb_build_object('definition', 'private definition'))
         returning id`,
        [privateDictionaryId, headword],
      );

      await client.query(`set local role service_role`);
      const { rows: catalogRows } = await client.query(
        `select search_public_catalog_entries($1, 'nl', 1, 10) as result`,
        [headword],
      );
      await client.query(`reset role`);

      const ids = (catalogRows[0].result.items as Array<{ id: string }>).map(
        (item) => item.id,
      );
      expect(ids).toContain(publicRows[0].id);
      expect(ids).not.toContain(privateRows[0].id);
    }, ownerId);
  });

  test("public catalog search matches headwords when query omits diacritics", async () => {
    const ownerId = randomUUID();
    await withTransaction(pool, async (client) => {
      const { rows: publicDictionaryRows } = await client.query(
        `select id from dictionaries where slug = 'nl-vandale' limit 1`,
      );
      const publicDictionaryId = publicDictionaryRows[0].id;
      const headword = `écht-${Date.now()}`;
      const plainQuery = headword.replace("é", "e");
      const { rows: entryRows } = await client.query(
        `insert into word_entries (
           dictionary_id, language_code, headword, meaning_id, part_of_speech, raw
         ) values ($1, 'nl', $2, 1, 'bw', jsonb_build_object('definition', 'met nadruk echt'))
         returning id`,
        [publicDictionaryId, headword],
      );

      await client.query(`set local role service_role`);
      const { rows: catalogRows } = await client.query(
        `select search_public_catalog_entries($1, 'nl', 1, 10) as result`,
        [plainQuery],
      );
      await client.query(`reset role`);

      const items = catalogRows[0].result.items as Array<{
        id: string;
        headword: string;
        search_match_group: string;
      }>;
      expect(items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: entryRows[0].id,
            headword,
            search_match_group: "exact-headword",
          }),
        ]),
      );
    }, ownerId);
  });

  test("strict public catalog lookup returns only the selected lexical tier", async () => {
    const ownerId = randomUUID();
    await withTransaction(pool, async (client) => {
      await ensureUserWithSettings(client, ownerId);
      const suffix = Date.now().toString();
      const exactHeadword = `oog-${suffix}`;
      const deHeadword = `de-${suffix}`;
      const brandenHeadword = `branden-${suffix}`;
      const brandtForm = `brandt-${suffix}`;

      const { rows: publicDictionaryRows } = await client.query(
        `select id from dictionaries where slug = 'nl-vandale' limit 1`,
      );
      const publicDictionaryId = publicDictionaryRows[0].id;

      const { rows: exactRows } = await client.query(
        `insert into word_entries (
           dictionary_id, language_code, headword, meaning_id, part_of_speech, raw
         ) values
           ($1, 'nl', $2, 1, 'noun', jsonb_build_object('definition', 'eye')),
           ($1, 'nl', $3, 1, 'noun', jsonb_build_object('definition', 'eye doctor')),
           ($1, 'nl', $4, 1, 'noun', jsonb_build_object('definition', 'eyelid')),
           ($1, 'nl', $5, 1, 'lidwoord', jsonb_build_object('definition', 'article')),
           ($1, 'nl', $6, 1, 'noun', jsonb_build_object('definition', 'deadline')),
           ($1, 'nl', $7, 1, 'verb', jsonb_build_object('definition', 'burn'))
         returning id, headword`,
        [
          publicDictionaryId,
          exactHeadword,
          `oogarts-${suffix}`,
          `ooglid-${suffix}`,
          deHeadword,
          `deadline-${suffix}`,
          brandenHeadword,
        ],
      );
      const idsByHeadword = new Map<string, string>(
        exactRows.map((row) => [row.headword, row.id]),
      );

      await client.query(
        `insert into word_forms (language_code, dictionary_id, form, word_id, headword)
         values ('nl', $1, $2, $3, $4)`,
        [
          publicDictionaryId,
          brandtForm,
          idsByHeadword.get(brandenHeadword),
          brandenHeadword,
        ],
      );

      await client.query(`set local role service_role`);
      const { rows: oogRows } = await client.query(
        `select lookup_public_catalog_entries_v1($1, 'nl', 10) as result`,
        [exactHeadword],
      );
      const { rows: deRows } = await client.query(
        `select lookup_public_catalog_entries_v1($1, 'nl', 10) as result`,
        [deHeadword],
      );
      const { rows: formRows } = await client.query(
        `select lookup_public_catalog_entries_v1($1, 'nl', 10) as result`,
        [brandtForm],
      );
      const { rows: missRows } = await client.query(
        `select lookup_public_catalog_entries_v1($1, 'nl', 10) as result`,
        [`missing-${suffix}`],
      );
      await client.query(`reset role`);

      expect(
        (oogRows[0].result.items as Array<{ headword: string }>).map(
          (item) => item.headword,
        ),
      ).toEqual([exactHeadword]);
      expect(
        (deRows[0].result.items as Array<{ headword: string }>).map(
          (item) => item.headword,
        ),
      ).toEqual([deHeadword]);
      expect(formRows[0].result.items).toEqual([
        expect.objectContaining({
          headword: brandenHeadword,
          search_match_group: "lemma-or-inflection",
          search_matched_text: brandtForm,
        }),
      ]);
      expect(missRows[0].result.items).toEqual([]);
    }, ownerId);
  });

  test("strict lookup applies authenticated access and public catalog visibility", async () => {
    const ownerId = randomUUID();
    const otherId = randomUUID();
    await withTransaction(pool, async (client) => {
      await ensureUserWithSettings(client, ownerId);
      await ensureUserWithSettings(client, otherId);
      const headword = `strict-private-${Date.now()}`;

      const { rows: privateDictionaryRows } = await client.query(
        `insert into dictionaries (
           language_code, slug, name, kind, visibility, owner_user_id,
           is_editable, schema_key, schema_version
         ) values (
           'nl', $1, 'Private strict lookup test', 'user', 'private', $2,
           true, 'user-entry-v1', 1
         )
         returning id`,
        [`strict-private-${Date.now()}`, ownerId],
      );
      const privateDictionaryId = privateDictionaryRows[0].id;
      const { rows: privateRows } = await client.query(
        `insert into word_entries (
           dictionary_id, language_code, headword, meaning_id, part_of_speech, raw
         ) values ($1, 'nl', $2, 1, 'noun', jsonb_build_object('definition', 'private definition'))
         returning id`,
        [privateDictionaryId, headword],
      );

      const { rows: ownerRows } = await client.query(
        `select lookup_dictionary_entries_v3($1, 'nl', NULL, 10) as result`,
        [headword],
      );
      expect(
        (ownerRows[0].result.items as Array<{ id: string }>).map((item) => item.id),
      ).toContain(privateRows[0].id);

      await client.query(`select set_config('request.jwt.claim.sub', $1, true)`, [
        otherId,
      ]);
      const { rows: otherRows } = await client.query(
        `select lookup_dictionary_entries_v3($1, 'nl', NULL, 10) as result`,
        [headword],
      );
      expect(otherRows[0].result.items).toEqual([]);

      await client.query(`set local role service_role`);
      const { rows: catalogRows } = await client.query(
        `select lookup_public_catalog_entries_v1($1, 'nl', 10) as result`,
        [headword],
      );
      await client.query(`reset role`);
      expect(catalogRows[0].result.items).toEqual([]);
    }, ownerId);
  });

  test("dictionary search backfill runs in resumable batches", async () => {
    const ownerId = randomUUID();
    await withTransaction(pool, async (client) => {
      await ensureUserWithSettings(client, ownerId);
      const suffix = Date.now();
      await client.query(
        `insert into languages (code, name)
         values ('aa', 'Backfill Test')
         on conflict (code) do nothing`,
      );
      const { rows: dictionaryRows } = await client.query(
        `insert into dictionaries (
           language_code, slug, name, kind, visibility, is_editable,
           schema_key, schema_version
         ) values (
           'aa', $1, 'Backfill Test Dictionary', 'curated', 'system', false,
           'nl-vandale-v1', 1
         )
         returning id`,
        [`aa-backfill-${suffix}`],
      );
      const dictionaryId = dictionaryRows[0].id;
      const headwords = [0, 1, 2].map((index) => `aa-backfill-${suffix}-${index}`);
      for (const headword of headwords) {
        await client.query(
          `insert into word_entries (
             dictionary_id, language_code, headword, meaning_id, part_of_speech, raw
           ) values ($1, 'aa', $2, 1, 'noun', jsonb_build_object('definition', $3::text))`,
          [dictionaryId, headword, `${headword} definition`],
        );
      }

      const { rows: runRows } = await client.query(
        `select start_dictionary_search_backfill(2, 2) as run_id`,
      );
      const runId = runRows[0].run_id;
      const { rows: firstBatchRows } = await client.query(
        `select run_dictionary_search_backfill_batch($1) as result`,
        [runId],
      );
      expect(firstBatchRows[0].result).toEqual(
        expect.objectContaining({
          runId,
          status: "running",
          processedInBatch: 2,
          hasMore: true,
        }),
      );

      const { rows: secondBatchRows } = await client.query(
        `select run_dictionary_search_backfill_batch($1) as result`,
        [runId],
      );
      expect(secondBatchRows[0].result.processedEntryCount).toBeGreaterThanOrEqual(3);

      const { rows: indexedRows } = await client.query(
        `select
           (select count(*)::int from dictionary_search_documents where headword = any($1::text[])) as docs,
           (select count(*)::int
            from dictionary_search_fields f
            join dictionary_search_documents d on d.entry_id = f.entry_id
            where d.headword = any($1::text[])) as fields`,
        [headwords],
      );
      expect(indexedRows[0].docs).toBe(3);
      expect(indexedRows[0].fields).toBeGreaterThanOrEqual(3);

      const { rows: statusRows } = await client.query(
        `select get_dictionary_search_backfill_status($1) as status`,
        [runId],
      );
      expect(statusRows[0].status[0]).toEqual(
        expect.objectContaining({
          runId,
          extractionVersion: 2,
          batchSize: 2,
        }),
      );
    }, ownerId);
  });

  test("grouped dictionary search returns Van Dale-style groups and cursors", async () => {
    const ownerId = randomUUID();
    await withTransaction(pool, async (client) => {
      await ensureUserWithSettings(client, ownerId);
      const suffix = Date.now();
      const query = `aagroup${suffix}`;
      await client.query(
        `insert into languages (code, name)
         values ('aa', 'Grouped Search Test')
         on conflict (code) do nothing`,
      );
      const { rows: dictionaryRows } = await client.query(
        `insert into dictionaries (
           language_code, slug, name, kind, visibility, is_editable,
           schema_key, schema_version
         ) values (
           'aa', $1, 'Grouped Search Test Dictionary', 'curated', 'system', false,
           'nl-vandale-v1', 1
         )
         returning id`,
        [`aa-grouped-${suffix}`],
      );
      const dictionaryId = dictionaryRows[0].id;
      const entries = [
        {
          headword: query,
          definition: `${query} definition text`,
          example: `first ${query} example text`,
        },
        {
          headword: `${query}b`,
          definition: `definition without the token`,
          example: `second ${query} example text`,
        },
        {
          headword: `${query}c`,
          definition: `another ${query} definition text`,
          example: `example without the token`,
        },
      ];

      for (const entry of entries) {
        const { rows } = await client.query(
          `insert into word_entries (
             dictionary_id, language_code, headword, meaning_id, part_of_speech, raw
           ) values ($1, 'aa', $2, 1, 'noun', $3::jsonb)
           returning id`,
          [
            dictionaryId,
            entry.headword,
            JSON.stringify({
              meanings: [
                {
                  definition: entry.definition,
                  examples: [entry.example],
                },
              ],
            }),
          ],
        );
        await client.query(`select refresh_dictionary_search_document($1, 2)`, [rows[0].id]);
      }

      const { rows: previewRows } = await client.query(
        `select search_dictionary_groups_v1($1, 'aa', NULL, NULL, 2, NULL) as result`,
        [query],
      );
      const preview = previewRows[0].result as {
        contractVersion: string;
        groups: SearchGroupResult[];
      };
      expect(preview.contractVersion).toBe("dictionary-search-v1");
      expect(preview.groups.map((group: { id: string }) => group.id)).toEqual([
        "headwords",
        "examples",
        "definitions",
        "alphabetical",
      ]);

      const byGroup = new Map<string, SearchGroupResult>(
        preview.groups.map((group) => [group.id, group]),
      );
      expect(byGroup.get("headwords")?.items[0].entry.headword).toBe(query);
      expect(byGroup.get("examples")?.total).toBeGreaterThanOrEqual(2);
      expect(byGroup.get("definitions")?.total).toBeGreaterThanOrEqual(2);
      expect(byGroup.get("examples")?.items[0].kind).toBe("field-match");
      expect(byGroup.get("definitions")?.items[0].kind).toBe("field-match");
      expect(byGroup.get("alphabetical")?.items.map((item) => item.entry.headword)).toEqual([
        query,
        `${query}b`,
      ]);

      const { rows: firstExampleRows } = await client.query(
        `select search_dictionary_groups_v1($1, 'aa', NULL, 'examples', 1, NULL) as result`,
        [query],
      );
      const firstExampleGroup = firstExampleRows[0].result.groups[0];
      expect(firstExampleGroup.page.hasMore).toBe(true);
      expect(firstExampleGroup.page.nextCursor).toEqual(expect.any(String));

      const { rows: secondExampleRows } = await client.query(
        `select search_dictionary_groups_v1($1, 'aa', NULL, 'examples', 1, $2) as result`,
        [query, firstExampleGroup.page.nextCursor],
      );
      const secondExampleGroup = secondExampleRows[0].result.groups[0];
      expect(secondExampleGroup.items[0].resultKey).not.toBe(firstExampleGroup.items[0].resultKey);

      await client.query(`set local role service_role`);
      const { rows: publicRows } = await client.query(
        `select search_public_dictionary_groups_v1($1, 'aa', NULL, 2, NULL) as result`,
        [query],
      );
      await client.query(`reset role`);
      expect(publicRows[0].result.request.scope).toBe("public-catalog");
      expect(publicRows[0].result.groups[0].items[0].entry.headword).toBe(query);
    }, ownerId);
  });

  test("get_recent_training_history returns hydrated event and status rows", async () => {
    const userId = randomUUID();
    await withTransaction(pool, async (client) => {
      await ensureUserWithSettings(client, userId);
      const wordId = await insertWord(client, `fsrs-history-${Date.now()}`);

      await client.query(
        `insert into user_card_status (
          user_id, entry_id, card_type_id,
          click_count, last_seen_at, fsrs_last_interval, fsrs_reps, fsrs_stability, next_review_at
        ) values ($1, $2, $3, 2, now() - interval '30 minutes', 3.0, 4, 7.5, now() + interval '1 day')`,
        [userId, wordId, mode],
      );
      await client.query(
        `insert into user_events (user_id, word_id, mode, event_type, created_at)
         values ($1, $2, $3, 'review_success', now())`,
        [userId, wordId, mode],
      );

      const { rows } = await client.query(
        `select *
         from get_recent_training_history($1::uuid, now() - interval '1 day', 50)`,
        [userId],
      );

      expect(rows).toHaveLength(1);
      expect(rows[0]).toEqual(
        expect.objectContaining({
          id: wordId,
          headword: expect.stringContaining("fsrs-history-"),
          event_type: "review_success",
          mode,
          click_count: 2,
          fsrs_reps: 4,
          meanings_count: 1,
        }),
      );
      expect(rows[0].raw).toEqual(expect.objectContaining({ meaning_id: 1 }));
    }, userId);
  });

  test("get_card_user_state returns one accessible card state", async () => {
    const userId = randomUUID();
    await withTransaction(pool, async (client) => {
      await ensureUserWithSettings(client, userId);
      const wordId = await insertWord(client, `fsrs-card-state-${Date.now()}`);

      await client.query(
        `insert into user_card_status (
          user_id, entry_id, card_type_id,
          click_count, seen_count, success_count, fsrs_params_version,
          fsrs_last_interval, fsrs_reps, fsrs_stability, next_review_at
        ) values ($1, $2, $3, 1, 5, 2, 'fsrs-6-default', 2.0, 3, 4.5, now() + interval '1 day')`,
        [userId, wordId, mode],
      );

      const { rows } = await client.query(
        `select get_card_user_state($1::uuid, $2::uuid, $3::text) as state`,
        [userId, wordId, mode],
      );

      expect(rows[0].state).toEqual(
        expect.objectContaining({
          click_count: 1,
          seen_count: 5,
          success_count: 2,
          fsrs_params_version: "fsrs-6-default",
          fsrs_last_interval: 2,
          fsrs_reps: 3,
          fsrs_stability: 4.5,
          in_learning: false,
        }),
      );
    }, userId);
  });

  test("card-oriented RPCs map to physical card storage", async () => {
    const userId = randomUUID();
    await withTransaction(pool, async (client) => {
      await ensureUserWithSettings(client, userId);
      const wordId = await insertWord(client, `fsrs-card-compat-${Date.now()}`);
      const turnId = randomUUID();

      await client.query(`select record_card_view($1, $2, $3)`, [
        userId,
        wordId,
        mode,
      ]);

      let { rows } = await client.query(
        `select entry_id, card_type_id, seen_count, last_seen_at
         from user_card_status
         where user_id = $1 and entry_id = $2 and card_type_id = $3`,
        [userId, wordId, mode],
      );
      expect(rows[0]).toEqual(
        expect.objectContaining({
          entry_id: wordId,
          card_type_id: mode,
          seen_count: 0,
        }),
      );
      expect(rows[0].last_seen_at).toBeTruthy();

      await client.query(`select start_learning_entry_card($1, $2, $3)`, [
        userId,
        wordId,
        mode,
      ]);
      await client.query(`select handle_card_review($1, $2, $3, $4, $5)`, [
        userId,
        wordId,
        mode,
        "success",
        turnId,
      ]);
      await client.query(`select handle_card_review($1, $2, $3, $4, $5)`, [
        userId,
        wordId,
        mode,
        "success",
        turnId,
      ]);

      const { rows: stateRows } = await client.query(
        `select get_user_card_state($1::uuid, $2::uuid, $3::text) as state`,
        [userId, wordId, mode],
      );
      expect(stateRows[0].state).toEqual(
        expect.objectContaining({
          fsrs_reps: 1,
          fsrs_last_grade: 3,
        }),
      );

      rows = (
        await client.query(
          `select fsrs_reps, fsrs_last_grade, fsrs_enabled
           from user_card_status
           where user_id = $1 and entry_id = $2 and card_type_id = $3`,
          [userId, wordId, mode],
        )
      ).rows;
      expect(rows[0]).toEqual(
        expect.objectContaining({
          fsrs_reps: 1,
          fsrs_last_grade: 3,
          fsrs_enabled: true,
        }),
      );

      const { rows: reviewRows } = await client.query(
        `select count(*)::int as count
         from user_review_log
         where user_id = $1 and word_id = $2 and mode = $3 and turn_id = $4`,
        [userId, wordId, mode, turnId],
      );
      expect(reviewRows[0].count).toBe(1);
    }, userId);
  });

  test("source-context-v2 provenance rejects already consumed review turns", async () => {
    const userId = randomUUID();
    await withTransaction(pool, async (client) => {
      await ensureUserWithSettings(client, userId);
      const wordId = await insertWord(client, `fsrs-v2-provenance-turn-${Date.now()}`);
      const consumedTurnId = randomUUID();
      const sourceContext = {
        contractVersion: "source-context-v2",
        source: {
          kind: "youtube_video",
          provider: "youtube",
          externalId: "4EE7m94mJpk",
          url: "https://www.youtube.com/watch?v=4EE7m94mJpk",
        },
      };

      await client.query(`select handle_card_review($1, $2, $3, $4, $5)`, [
        userId,
        wordId,
        mode,
        "success",
        consumedTurnId,
      ]);

      await client.query(`savepoint consumed_turn_collision`);
      await expect(
        client.query(
          `select perform_platform_card_action(
             $1::uuid,
             $2::uuid,
             $3::text,
             'review-card',
             'success',
             $4::uuid,
             $4::text,
             $5::jsonb,
             'first_party',
             NULL
           )`,
          [userId, wordId, mode, consumedTurnId, JSON.stringify(sourceContext)]
        )
      ).rejects.toThrow(/platform_review_turn_already_consumed/);
      await client.query(`rollback to savepoint consumed_turn_collision`);
      await client.query(`release savepoint consumed_turn_collision`);

      const { rows } = await client.query(
        `select count(*)::int as count
         from user_card_action_events
         where user_id = $1 and client_event_id = $2`,
        [userId, consumedTurnId]
      );
      expect(rows[0].count).toBe(0);
    }, userId);
  });

  test("source-context-v2 idempotency ignores volatile observation fields", async () => {
    const userId = randomUUID();
    await withTransaction(pool, async (client) => {
      await ensureUserWithSettings(client, userId);
      const wordId = await insertWord(client, `fsrs-v2-idempotency-${Date.now()}`);
      const clientEventId = randomUUID();
      const baseContext = {
        contractVersion: "source-context-v2",
        source: {
          kind: "youtube_video",
          provider: "youtube",
          externalId: "4EE7m94mJpk",
          url: "https://www.youtube.com/watch?v=4EE7m94mJpk",
        },
        artifact: {
          artifactKind: "caption_phrase_set",
          producer: "audiofilms_backend",
          phraseSetRevisionId: "phrases-v1",
        },
        location: {
          kind: "caption_phrase",
          phraseIndex: 12,
          startMs: 54210,
          endMs: 58100,
        },
        selection: {
          clickedForm: "huis",
        },
        context: {
          clickedForm: "huis",
          text: "Ik ga naar huis.",
        },
      };

      const callAction = (sourceContext: unknown) =>
        client.query(
          `select perform_platform_card_action(
             $1::uuid,
             $2::uuid,
             $3::text,
             'start-learning',
             NULL,
             NULL,
             $4::text,
             $5::jsonb,
             'first_party',
             NULL
           ) as result`,
          [userId, wordId, mode, clientEventId, JSON.stringify(sourceContext)]
        );

      const first = await callAction({
        ...baseContext,
        observation: { title: "Original title", currentPlaybackTimeMs: 55000 },
        diagnostics: { warnings: ["first"] },
      });
      const second = await callAction({
        ...baseContext,
        observation: { title: "Changed title", currentPlaybackTimeMs: 57000 },
        diagnostics: { warnings: ["retry-different"] },
      });

      expect(first.rows[0].result.status).toBe("accepted");
      expect(second.rows[0].result).toEqual(
        expect.objectContaining({
          status: "duplicate",
          eventId: first.rows[0].result.eventId,
        })
      );

      const { rows } = await client.query(
        `select count(*)::int as count, min(length(action_payload_hash))::int as hash_length
         from user_card_action_events
         where user_id = $1 and client_event_id = $2`,
        [userId, clientEventId]
      );
      expect(rows[0]).toEqual({ count: 1, hash_length: 64 });
    }, userId);
  });

  test("source-context-v2 direct RPC cannot poison canonical YouTube source metadata", async () => {
    const userId = randomUUID();
    await withTransaction(pool, async (client) => {
      await ensureUserWithSettings(client, userId);
      const wordId = await insertWord(client, `fsrs-v2-source-canonical-${Date.now()}`);
      const clientEventId = randomUUID();
      const sourceContext = {
        contractVersion: "source-context-v2",
        client: { id: "malicious-client" },
        source: {
          kind: "youtube_video",
          provider: "youtube",
          externalId: "4EE7m94mJpk",
          url: "https://evil.example/watch?v=4EE7m94mJpk&token=secret",
          title: "User supplied title",
          languageCode: "NL",
        },
      };

      const { rows: actionRows } = await client.query(
        `select perform_platform_card_action(
           $1::uuid,
           $2::uuid,
           $3::text,
           'record-view',
           NULL,
           NULL,
           $4::text,
           $5::jsonb,
           'first_party',
           NULL
         ) as result`,
        [userId, wordId, mode, clientEventId, JSON.stringify(sourceContext)]
      );

      const { rows } = await client.query(
        `select kind, provider, external_id, canonical_url, title, language_code, metadata
         from learning_sources
         where id = $1::uuid`,
        [actionRows[0].result.sourceId]
      );

      expect(rows[0]).toEqual({
        kind: "youtube_video",
        provider: "youtube",
        external_id: "4EE7m94mJpk",
        canonical_url: "https://www.youtube.com/watch?v=4EE7m94mJpk",
        title: null,
        language_code: "nl",
        metadata: { contractVersion: "source-context-v2" },
      });
    }, userId);
  });

  test("source-context-v2 direct RPC enforces private web source redaction", async () => {
    const userId = randomUUID();
    await withTransaction(pool, async (client) => {
      await ensureUserWithSettings(client, userId);
      await client.query(
        `insert into connected_clients (
           client_id, display_name, client_type, allowed_redirect_uris, allowed_scopes
         ) values (
           'pontix_chrome_dev',
           'Pontix Dev',
           'chrome_extension',
           ARRAY['https://example.com/callback'],
           ARRAY['platform:read', 'platform:write', 'offline_access']
         )
         on conflict (client_id) do nothing`
      );
      const wordId = await insertWord(client, `fsrs-v2-private-web-${Date.now()}`);
      const sourceContext = {
        contractVersion: "source-context-v2",
        source: {
          kind: "web_page",
          provider: "web",
          externalId: `private:web_page:${"a".repeat(64)}`,
          canonicalUrl: "https://example.com/article?a=1&b=2",
          title: "Private page title",
          languageCode: "EN_us",
        },
        location: {
          kind: "text_selection",
          navigationId: "nav-1",
          charStart: 4,
          charEnd: 9,
        },
        selection: {
          clickedForm: "woord",
          selectionHash: "pontix-fnv1a-11111111",
          contextTextHash: "pontix-fnv1a-22222222",
        },
      };

      const { rows: actionRows } = await client.query(
        `select perform_platform_card_action(
           $1::uuid,
           $2::uuid,
           $3::text,
           'record-view',
           NULL,
           NULL,
           $4::text,
           $5::jsonb,
           'connected_client',
           'pontix_chrome_dev'
         ) as result`,
        [userId, wordId, mode, randomUUID(), JSON.stringify(sourceContext)]
      );

      const { rows } = await client.query(
        `select kind, provider, external_id, canonical_url, title, language_code, metadata
         from learning_sources
         where id = $1::uuid`,
        [actionRows[0].result.sourceId]
      );

      expect(rows[0]).toEqual({
        kind: "web_page",
        provider: "web",
        external_id: `private:web_page:${"a".repeat(64)}`,
        canonical_url: "https://example.com/article?a=1&b=2",
        title: null,
        language_code: "en-us",
        metadata: {
          contractVersion: "source-context-v2",
          privateSource: true,
        },
      });

      await client.query(`savepoint unsafe_private_web_source`);
      await expect(
        client.query(
          `select perform_platform_card_action(
             $1::uuid,
             $2::uuid,
             $3::text,
             'record-view',
             NULL,
             NULL,
             $4::text,
             $5::jsonb,
             'connected_client',
             'pontix_chrome_dev'
           )`,
          [
            userId,
            wordId,
            mode,
            randomUUID(),
            JSON.stringify({
              ...sourceContext,
              source: {
                ...sourceContext.source,
                externalId: `private:web_page:${"b".repeat(64)}`,
                canonicalUrl: "https://user:password@example.com/private#secret",
              },
            }),
          ]
        )
      ).rejects.toThrow(/invalid_v2_private_source/);
      await client.query(`rollback to savepoint unsafe_private_web_source`);
      await client.query(`release savepoint unsafe_private_web_source`);
    }, userId);
  });

  test("physical user_card_status table is the writable card-state storage", async () => {
    const userId = randomUUID();
    await withTransaction(pool, async (client) => {
      await ensureUserWithSettings(client, userId);
      const wordId = await insertWord(client, `fsrs-card-physical-${Date.now()}`);

      const { rows: tableRows } = await client.query(
        `select table_type
         from information_schema.tables
         where table_schema = 'public'
           and table_name = 'user_card_status'`,
      );
      expect(tableRows[0].table_type).toBe("BASE TABLE");

      const { rows: legacyTableRows } = await client.query(
        `select table_name
         from information_schema.tables
         where table_schema = 'public'
           and table_name = 'user_word_status'`,
      );
      expect(legacyTableRows).toHaveLength(0);

      await client.query(
        `insert into user_card_status (
           user_id, entry_id, card_type_id, fsrs_enabled, seen_count, last_result
         ) values ($1, $2, $3, true, 2, 'success')`,
        [userId, wordId, mode],
      );

      let { rows } = await client.query(
        `select fsrs_enabled, seen_count, last_result
         from user_card_status
         where user_id = $1 and entry_id = $2 and card_type_id = $3`,
        [userId, wordId, mode],
      );
      expect(rows[0]).toEqual(
        expect.objectContaining({
          fsrs_enabled: true,
          seen_count: 2,
          last_result: "success",
        }),
      );

      await client.query(
        `update user_card_status
         set seen_count = 3, last_result = 'fail'
         where user_id = $1 and entry_id = $2 and card_type_id = $3`,
        [userId, wordId, mode],
      );

      rows = (
        await client.query(
          `select seen_count, last_result
           from user_card_status
           where user_id = $1 and entry_id = $2 and card_type_id = $3`,
          [userId, wordId, mode],
        )
      ).rows;
      expect(rows[0]).toEqual(
        expect.objectContaining({
          seen_count: 3,
          last_result: "fail",
        }),
      );

      await client.query(
        `delete from user_card_status
         where user_id = $1 and entry_id = $2 and card_type_id = $3`,
        [userId, wordId, mode],
      );

      const { rows: remainingRows } = await client.query(
        `select count(*)::int as count
         from user_card_status
         where user_id = $1 and entry_id = $2 and card_type_id = $3`,
        [userId, wordId, mode],
      );
      expect(remainingRows[0].count).toBe(0);
    }, userId);
  });

  test("get_user_list_membership returns owned list intersection", async () => {
    const userId = randomUUID();
    await withTransaction(pool, async (client) => {
      await ensureUserWithSettings(client, userId);
      const firstWordId = await insertWord(client, `membership-a-${Date.now()}`);
      const secondWordId = await insertWord(client, `membership-b-${Date.now()}`);
      const absentWordId = await insertWord(client, `membership-c-${Date.now()}`);
      const { rows: listRows } = await client.query(
        `insert into user_word_lists (user_id, language_code, primary_language_code, name)
         values ($1, 'nl', 'nl', $2)
         returning id`,
        [userId, `Membership list ${Date.now()}`],
      );
      const listId = listRows[0].id;

      await client.query(`select add_entry_to_user_list($1, $2, $3)`, [
        userId,
        listId,
        firstWordId,
      ]);
      await client.query(`select add_entry_to_user_list($1, $2, $3)`, [
        userId,
        listId,
        secondWordId,
      ]);

      const { rows } = await client.query(
        `select get_user_list_membership($1::uuid, $2::uuid, $3::uuid[]) as ids`,
        [userId, listId, [firstWordId, absentWordId]],
      );

      expect(rows[0].ids).toEqual([firstWordId]);
    }, userId);
  });

  test("get_word_list_summary returns owned user list metadata", async () => {
    const userId = randomUUID();
    await withTransaction(pool, async (client) => {
      await ensureUserWithSettings(client, userId);
      const wordId = await insertWord(client, `summary-list-${Date.now()}`);
      const { rows: listRows } = await client.query(
        `insert into user_word_lists (user_id, language_code, primary_language_code, name)
         values ($1, 'nl', 'nl', $2)
         returning id`,
        [userId, `Summary list ${Date.now()}`],
      );
      const listId = listRows[0].id;
      await client.query(`select add_entry_to_user_list($1, $2, $3)`, [
        userId,
        listId,
        wordId,
      ]);

      const { rows } = await client.query(
        `select get_word_list_summary($1::uuid, $2::uuid, 'user') as list`,
        [userId, listId],
      );

      expect(rows[0].list).toEqual(
        expect.objectContaining({
          id: listId,
          name: expect.stringContaining("Summary list"),
          language_code: "nl",
          primary_language_code: "nl",
          default_scenario_id: null,
          card_policy: "inherit",
          card_type_ids: null,
        }),
      );
      expect(rows[0].list.user_word_list_items[0].count).toBe(1);
    }, userId);
  });

  test("get_available_word_lists scopes user lists by language and keeps mixed lists separate", async () => {
    const userId = randomUUID();
    await withTransaction(pool, async (client) => {
      await ensureUserWithSettings(client, userId);
      await client.query(
        `insert into languages (code, name)
         values ('de', 'German')
         on conflict (code) do nothing`,
      );
      const { rows: curatedRows } = await client.query(
        `insert into word_lists (language_code, primary_language_code, name, slug, is_primary)
         values ('nl', 'nl', $1, $2, false)
         returning id`,
        [`Available curated ${Date.now()}`, `available-curated-${Date.now()}`],
      );
      await client.query(
        `insert into word_lists (language_code, primary_language_code, name, slug, is_primary)
         values ('de', 'de', $1, $2, false)`,
        [`Other language curated ${Date.now()}`, `other-curated-${Date.now()}`],
      );
      const { rows: otherLanguageUserRows } = await client.query(
        `insert into user_word_lists (user_id, language_code, primary_language_code, name)
         values ($1, 'de', 'de', $2)
         returning id`,
        [userId, `Other language user ${Date.now()}`],
      );
      const { rows: languageUserRows } = await client.query(
        `insert into user_word_lists (user_id, language_code, primary_language_code, name)
         values ($1, 'nl', 'nl', $2)
         returning id`,
        [userId, `Dutch user ${Date.now()}`],
      );
      const { rows: mixedUserRows } = await client.query(
        `insert into user_word_lists (user_id, language_code, primary_language_code, name)
         values ($1, 'nl', 'nl', $2)
         returning id`,
        [userId, `Mixed user ${Date.now()}`],
      );
      const nlWordId = await insertWord(client, `available-nl-${Date.now()}`);
      const { rows: deDictionaryRows } = await client.query(
        `insert into dictionaries (
          language_code, slug, name, kind, visibility, schema_key, schema_version
        )
        values ('de', $1, 'German fixture dictionary', 'curated', 'public', 'nl-vandale-v1', 1)
        returning id`,
        [`available-de-${Date.now()}`],
      );
      const { rows: deWordRows } = await client.query(
        `insert into word_entries (
          dictionary_id, language_code, headword, part_of_speech, gender,
          is_nt2_2000, raw, meaning_id
        )
        values ($1, 'de', $2, 'noun', 'n', true, '{}'::jsonb, 1)
        returning id`,
        [deDictionaryRows[0].id, `verfuegbar-${Date.now()}`],
      );
      await client.query(
        `insert into user_word_list_items (list_id, word_id)
         values ($1, $2), ($3, $2), ($3, $4)`,
        [languageUserRows[0].id, nlWordId, mixedUserRows[0].id, deWordRows[0].id],
      );

      const { rows } = await client.query(
        `select get_available_word_lists($1::uuid, 'nl', null) as lists`,
        [userId],
      );
      const lists = rows[0].lists as Array<{
        id: string;
        list_type: string;
        card_policy: string;
        is_mixed_language?: boolean;
      }>;

      expect(lists.some((list) => list.id === curatedRows[0].id)).toBe(true);
      expect(lists.some((list) => list.id === languageUserRows[0].id)).toBe(true);
      expect(lists.some((list) => list.id === mixedUserRows[0].id && list.is_mixed_language === true)).toBe(true);
      expect(lists.some((list) => list.id === otherLanguageUserRows[0].id)).toBe(false);
      expect(lists.every((list) => list.list_type === "curated" || list.list_type === "user")).toBe(true);
    }, userId);
  });

  test("active word list RPCs read and update saved selection", async () => {
    const userId = randomUUID();
    await withTransaction(pool, async (client) => {
      await ensureUserWithSettings(client, userId);
      const { rows: listRows } = await client.query(
        `insert into user_word_lists (user_id, language_code, primary_language_code, name)
         values ($1, 'nl', 'nl', $2)
         returning id`,
        [userId, `Active list ${Date.now()}`],
      );
      const listId = listRows[0].id;

      await client.query(
        `select update_active_word_list($1::uuid, $2::uuid, 'user')`,
        [userId, listId],
      );
      const { rows } = await client.query(
        `select get_active_word_list($1::uuid) as active`,
        [userId],
      );

      expect(rows[0].active).toEqual(expect.objectContaining({
        active_list_id: listId,
        active_list_type: "user",
        active_scenario: "understanding",
        card_filter: "both",
        language_code: "nl",
        modes_enabled: ["word-to-definition"],
        new_review_ratio: 2,
      }));
    }, userId);
  });

  test("learning preference RPCs read and update scheduler-facing settings", async () => {
    const userId = randomUUID();
    await withTransaction(pool, async (client) => {
      await ensureUserWithSettings(client, userId);

      await client.query(
        `select update_learning_preferences(
          $1::uuid,
          ARRAY['definition-to-word']::text[],
          'review',
          'nl',
          3,
          'listening'
        )`,
        [userId],
      );

      const { rows } = await client.query(
        `select get_learning_preferences($1::uuid) as prefs`,
        [userId],
      );

      expect(rows[0].prefs).toEqual(
        expect.objectContaining({
          training_mode: "definition-to-word",
          modes_enabled: ["definition-to-word"],
          card_filter: "review",
          language_code: "nl",
          new_review_ratio: 3,
          active_scenario: "listening",
        }),
      );
    }, userId);
  });

  test("dictionary lookup returns curated and user candidates", async () => {
    const userId = randomUUID();
    await withTransaction(pool, async (client) => {
      await ensureUserWithSettings(client, userId);
      const sourceWordId = await insertWord(client, `fsrs-candidates-${Date.now()}`);

      const { rows: copyRows } = await client.query(
        `select copy_entry_to_user_dictionary(
          $1,
          $2,
          NULL,
          '{"translation":{"languageCode":"en","text":"candidate copy"}}'::jsonb
        ) as copied_word_id`,
        [userId, sourceWordId],
      );

      const { rows: wordRows } = await client.query(
        `select headword from word_entries where id = $1`,
        [sourceWordId],
      );
      const { rows } = await client.query(
        `select fetch_dictionary_entry_gated($1) as items`,
        [wordRows[0].headword],
      );

      const ids = rows[0].items.map((item: { id: string }) => item.id);
      expect(ids).toContain(sourceWordId);
      expect(ids).toContain(copyRows[0].copied_word_id);
      expect(rows[0].items[0].id).toBe(copyRows[0].copied_word_id);
      expect(rows[0].items[0].dictionary).toEqual(
        expect.objectContaining({
          kind: "user",
          schema_key: "user-entry-v1",
          owner_user_id: userId,
          is_editable: true,
        }),
      );
    }, userId);
  });

  test("dictionary entry by id lookup is gated by dictionary access", async () => {
    const userId = randomUUID();
    const ownerId = randomUUID();
    await withTransaction(pool, async (client) => {
      await ensureUserWithSettings(client, userId);
      await ensureUserWithSettings(client, ownerId);

      const publicWordId = await insertWord(client, `fsrs-by-id-public-${Date.now()}`);
      const { rows: dictionaryRows } = await client.query(
        `insert into dictionaries (
          language_code, slug, name, kind, visibility, owner_user_id,
          schema_key, schema_version
        )
        values ('nl', $1, 'Private by id dictionary', 'user', 'private', $2, 'user-entry-v1', 1)
        returning id`,
        [`private-by-id-${Date.now()}`, ownerId],
      );
      const { rows: privateRows } = await client.query(
        `insert into word_entries (
          dictionary_id, language_code, headword, part_of_speech, gender,
          is_nt2_2000, raw, meaning_id
        )
        values ($1, 'nl', $2, 'noun', null, false, '{}'::jsonb, 1)
        returning id`,
        [dictionaryRows[0].id, `fsrs-by-id-private-${Date.now()}`],
      );

      const { rows: publicRows } = await client.query(
        `select fetch_dictionary_entry_by_id_gated($1) as item`,
        [publicWordId],
      );
      expect(publicRows[0].item.id).toBe(publicWordId);

      const { rows: privateRowsForOther } = await client.query(
        `select fetch_dictionary_entry_by_id_gated($1) as item`,
        [privateRows[0].id],
      );
      expect(privateRowsForOther[0].item).toBeNull();

      await client.query(`select set_config('request.jwt.claim.sub', $1, true)`, [
        ownerId,
      ]);
      const { rows: privateRowsForOwner } = await client.query(
        `select fetch_dictionary_entry_by_id_gated($1) as item`,
        [privateRows[0].id],
      );
      expect(privateRowsForOwner[0].item.id).toBe(privateRows[0].id);
    }, userId);
  });

  test("start_learning_entry_card enables a card without review-log side effects", async () => {
    const userId = randomUUID();
    await withTransaction(pool, async (client) => {
      await ensureUserWithSettings(client, userId);
      const wordId = await insertWord(client, `fsrs-start-${Date.now()}`);

      await client.query(`select start_learning_entry_card($1, $2, $3)`, [
        userId,
        wordId,
        mode,
      ]);

      const { rows: statusRows } = await client.query(
        `select fsrs_enabled, fsrs_reps, fsrs_lapses, seen_count, in_learning, hidden, frozen_until
         from user_card_status
         where user_id = $1 and entry_id = $2 and card_type_id = $3`,
        [userId, wordId, mode],
      );
      const { rows: reviewRows } = await client.query(
        `select count(*)::int as count
         from user_review_log
         where user_id = $1 and word_id = $2`,
        [userId, wordId],
      );

      expect(statusRows[0]).toEqual(
        expect.objectContaining({
          fsrs_enabled: true,
          fsrs_reps: 0,
          fsrs_lapses: 0,
          seen_count: 1,
          in_learning: true,
          hidden: false,
          frozen_until: null,
        }),
      );
      expect(reviewRows[0].count).toBe(0);
    }, userId);
  });

  test("add_entry_to_user_list adds readable entries idempotently", async () => {
    const userId = randomUUID();
    await withTransaction(pool, async (client) => {
      await ensureUserWithSettings(client, userId);
      const wordId = await insertWord(client, `fsrs-list-${Date.now()}`);
      const { rows: listRows } = await client.query(
        `insert into user_word_lists (user_id, language_code, primary_language_code, name)
         values ($1, 'nl', 'nl', $2)
         returning id`,
        [userId, `List ${Date.now()}`],
      );
      const listId = listRows[0].id;

      await client.query(`select add_entry_to_user_list($1, $2, $3)`, [
        userId,
        listId,
        wordId,
      ]);
      await client.query(`select add_entry_to_user_list($1, $2, $3)`, [
        userId,
        listId,
        wordId,
      ]);

      const { rows } = await client.query(
        `select count(*)::int as count
         from user_word_list_items
         where list_id = $1 and word_id = $2`,
        [listId, wordId],
      );
      expect(rows[0].count).toBe(1);
    }, userId);
  });

  test("get_user_list_memberships_for_entries returns curated and owned memberships", async () => {
    const ownerId = randomUUID();
    const otherId = randomUUID();
    await withTransaction(pool, async (client) => {
      await ensureUserWithSettings(client, ownerId);
      await ensureUserWithSettings(client, otherId);
      const firstWordId = await insertWord(client, `fsrs-membership-a-${Date.now()}`);
      const secondWordId = await insertWord(client, `fsrs-membership-b-${Date.now()}`);
      const { rows: curatedListRows } = await client.query(
        `insert into word_lists (language_code, primary_language_code, slug, name, description)
         values ('nl', 'nl', $1, $2, 'Curated learning words')
         returning id`,
        [`membership-${Date.now()}`, `Curated membership list ${Date.now()}`],
      );
      const { rows: sourceListRows } = await client.query(
        `insert into word_lists (language_code, primary_language_code, slug, name, description)
         values ('nl', 'nl', $1, 'VanDale', 'Dictionary source container')
         returning id`,
        [`membership-source-${Date.now()}`],
      );
      const { rows: ownerListRows } = await client.query(
        `insert into user_word_lists (user_id, language_code, primary_language_code, name, description)
         values ($1, 'nl', 'nl', $2, 'Owned words')
         returning id`,
        [ownerId, `Owned membership list ${Date.now()}`],
      );
      const { rows: otherListRows } = await client.query(
        `insert into user_word_lists (user_id, language_code, primary_language_code, name)
         values ($1, 'nl', 'nl', $2)
         returning id`,
        [otherId, `Other membership list ${Date.now()}`],
      );

      await client.query(
        `insert into word_list_items (list_id, word_id) values ($1, $2)`,
        [curatedListRows[0].id, firstWordId],
      );
      await client.query(
        `insert into word_list_items (list_id, word_id) values ($1, $2)`,
        [sourceListRows[0].id, firstWordId],
      );
      await client.query(
        `update user_settings
         set active_list_id = $2, active_list_type = 'curated'
         where user_id = $1`,
        [ownerId, curatedListRows[0].id],
      );
      await client.query(`select add_entry_to_user_list($1, $2, $3)`, [
        ownerId,
        ownerListRows[0].id,
        firstWordId,
      ]);
      await client.query(`select add_entry_to_user_list($1, $2, $3)`, [
        ownerId,
        ownerListRows[0].id,
        secondWordId,
      ]);
      await client.query("select set_config('request.jwt.claim.sub', $1, true)", [
        otherId,
      ]);
      await client.query(`select add_entry_to_user_list($1, $2, $3)`, [
        otherId,
        otherListRows[0].id,
        firstWordId,
      ]);
      await client.query("select set_config('request.jwt.claim.sub', $1, true)", [
        ownerId,
      ]);

      const { rows } = await client.query(
        `select get_user_list_memberships_for_entries($1, $2::uuid[]) as memberships`,
        [ownerId, [firstWordId, secondWordId]],
      );

      expect(rows[0].memberships).toEqual(
        expect.arrayContaining([
          {
            entry_id: firstWordId,
            lists: [
              expect.objectContaining({
                id: curatedListRows[0].id,
                kind: "curated",
                description: "Curated learning words",
                primary_language_code: "nl",
                item_count: 1,
                editable: false,
                read_only_reason: "curated",
                is_active_training_list: true,
              }),
              expect.objectContaining({
                id: ownerListRows[0].id,
                kind: "user",
                description: "Owned words",
                primary_language_code: "nl",
                item_count: 2,
                editable: true,
                is_active_training_list: false,
              }),
            ],
          },
          {
            entry_id: secondWordId,
            lists: [
              expect.objectContaining({
                id: ownerListRows[0].id,
                kind: "user",
                item_count: 2,
                editable: true,
              }),
            ],
          },
        ]),
      );
      expect(rows[0].memberships).toHaveLength(2);
      expect(JSON.stringify(rows[0].memberships)).not.toContain(
        "Dictionary source container",
      );

      await client.query("savepoint unauthorized_memberships");
      await expect(
        client.query(
          `select get_user_list_memberships_for_entries($1, $2::uuid[])`,
          [otherId, [firstWordId]],
        ),
      ).rejects.toThrow(/unauthorized/);
      await client.query("rollback to savepoint unauthorized_memberships");
      await client.query("release savepoint unauthorized_memberships");
    }, ownerId);
  });

  test("remove_entries_from_user_list removes owned list entries only", async () => {
    const ownerId = randomUUID();
    const otherId = randomUUID();
    await withTransaction(pool, async (client) => {
      await ensureUserWithSettings(client, ownerId);
      await ensureUserWithSettings(client, otherId);
      const firstWordId = await insertWord(client, `fsrs-remove-list-${Date.now()}`);
      const secondWordId = await insertWord(client, `fsrs-keep-list-${Date.now()}`);
      const { rows: listRows } = await client.query(
        `insert into user_word_lists (user_id, language_code, primary_language_code, name)
         values ($1, 'nl', 'nl', $2)
         returning id`,
        [ownerId, `Remove list ${Date.now()}`],
      );
      const listId = listRows[0].id;

      await client.query(`select add_entry_to_user_list($1, $2, $3)`, [
        ownerId,
        listId,
        firstWordId,
      ]);
      await client.query(`select add_entry_to_user_list($1, $2, $3)`, [
        ownerId,
        listId,
        secondWordId,
      ]);

      await client.query("savepoint unauthorized_remove");
      await expect(
        client.query(`select remove_entries_from_user_list($1, $2, $3::uuid[])`, [
          otherId,
          listId,
          [firstWordId],
        ]),
      ).rejects.toThrow(/unauthorized/);
      await client.query("rollback to savepoint unauthorized_remove");
      await client.query("release savepoint unauthorized_remove");

      await client.query(`select remove_entries_from_user_list($1, $2, $3::uuid[])`, [
        ownerId,
        listId,
        [firstWordId],
      ]);

      const { rows } = await client.query(
        `select word_id
         from user_word_list_items
         where list_id = $1
         order by word_id`,
        [listId],
      );
      expect(rows.map((row) => row.word_id)).toEqual([secondWordId]);
    }, ownerId);
  });

  test("user word list CRUD actions create and delete owned lists", async () => {
    const ownerId = randomUUID();
    const otherId = randomUUID();
    await withTransaction(pool, async (client) => {
      await ensureUserWithSettings(client, ownerId);
      await ensureUserWithSettings(client, otherId);

      const { rows: createRows } = await client.query(
        `select create_user_word_list(
          $1,
          $2,
          $3,
          'nl',
          'nl',
          'listening',
          'restrict',
          ARRAY['listen-recognize']::text[]
        ) as list`,
        [ownerId, `CRUD list ${Date.now()}`, "Created through RPC"],
      );
      const list = createRows[0].list;
      expect(list).toEqual(
        expect.objectContaining({
          name: expect.stringContaining("CRUD list"),
          description: "Created through RPC",
          language_code: "nl",
          primary_language_code: "nl",
          default_scenario_id: "listening",
          card_policy: "restrict",
          card_type_ids: ["listen-recognize"],
        }),
      );
      expect(list.user_word_list_items[0].count).toBe(0);

      await client.query("savepoint unauthorized_delete_list");
      await expect(
        client.query(`select delete_user_word_list($1, $2)`, [otherId, list.id]),
      ).rejects.toThrow(/unauthorized/);
      await client.query("rollback to savepoint unauthorized_delete_list");
      await client.query("release savepoint unauthorized_delete_list");

      await client.query(`select delete_user_word_list($1, $2)`, [
        ownerId,
        list.id,
      ]);

      const { rows: countRows } = await client.query(
        `select count(*)::int as count
         from user_word_lists
         where id = $1`,
        [list.id],
      );
      expect(countRows[0].count).toBe(0);
    }, ownerId);
  });

  test("update_user_word_list updates owned list metadata", async () => {
    const ownerId = randomUUID();
    const otherId = randomUUID();
    await withTransaction(pool, async (client) => {
      await ensureUserWithSettings(client, ownerId);
      await ensureUserWithSettings(client, otherId);

      const { rows: createRows } = await client.query(
        `select create_user_word_list($1, $2, $3, 'nl', 'nl') as list`,
        [ownerId, `Update list ${Date.now()}`, "Before"],
      );
      const list = createRows[0].list;

      await client.query("savepoint unauthorized_update_list");
      await expect(
        client.query(
          `select update_user_word_list($1, $2, $3, $4, 'nl', 'nl')`,
          [otherId, list.id, "Blocked", "Blocked"],
        ),
      ).rejects.toThrow(/unauthorized/);
      await client.query("rollback to savepoint unauthorized_update_list");
      await client.query("release savepoint unauthorized_update_list");

      const { rows: updateRows } = await client.query(
        `select update_user_word_list(
          $1,
          $2,
          $3,
          $4,
          'nl',
          'nl',
          'understanding',
          'prefer',
          ARRAY['definition-to-word', 'word-to-definition']::text[]
        ) as list`,
        [ownerId, list.id, "Updated list", "After"],
      );

      expect(updateRows[0].list).toEqual(
        expect.objectContaining({
          id: list.id,
          name: "Updated list",
          description: "After",
          language_code: "nl",
          primary_language_code: "nl",
          default_scenario_id: "understanding",
          card_policy: "prefer",
          card_type_ids: ["definition-to-word", "word-to-definition"],
        }),
      );
      expect(updateRows[0].list.user_word_list_items[0].count).toBe(0);

      const { rows: clearRows } = await client.query(
        `select update_user_word_list(
          $1,
          $2,
          null,
          null,
          null,
          null,
          null,
          'inherit',
          ARRAY[]::text[],
          true
        ) as list`,
        [ownerId, list.id],
      );

      expect(clearRows[0].list).toEqual(
        expect.objectContaining({
          id: list.id,
          default_scenario_id: null,
          card_policy: "inherit",
          card_type_ids: null,
        }),
      );
    }, ownerId);
  });

  test("ensure_user_dictionary creates a private editable user dictionary", async () => {
    const userId = randomUUID();
    await withTransaction(pool, async (client) => {
      await ensureUserWithSettings(client, userId);

      const { rows: firstRows } = await client.query(
        `select ensure_user_dictionary($1, 'nl', 'My words') as dictionary_id`,
        [userId],
      );
      const { rows: secondRows } = await client.query(
        `select ensure_user_dictionary($1, 'nl', 'My words') as dictionary_id`,
        [userId],
      );

      expect(firstRows[0].dictionary_id).toBe(secondRows[0].dictionary_id);

      const { rows } = await client.query(
        `select kind, visibility, owner_user_id, is_editable, schema_key, schema_version
         from dictionaries
         where id = $1`,
        [firstRows[0].dictionary_id],
      );

      expect(rows[0]).toEqual(
        expect.objectContaining({
          kind: "user",
          visibility: "private",
          owner_user_id: userId,
          is_editable: true,
          schema_key: "user-entry-v1",
          schema_version: 1,
        }),
      );
    }, userId);
  });

  test("copy_entry_to_user_dictionary creates a user-entry-v1 copy", async () => {
    const userId = randomUUID();
    await withTransaction(pool, async (client) => {
      await ensureUserWithSettings(client, userId);
      const sourceWordId = await insertWord(client, `fsrs-copy-${Date.now()}`);

      const { rows: copyRows } = await client.query(
        `select copy_entry_to_user_dictionary(
          $1,
          $2,
          NULL,
          '{"translation":{"languageCode":"en","text":"copy"}}'::jsonb
        ) as copied_word_id`,
        [userId, sourceWordId],
      );

      const { rows } = await client.query(
        `select
           w.id,
           w.dictionary_id,
           w.is_nt2_2000,
           w.raw,
           d.kind,
           d.visibility,
           d.owner_user_id,
           d.schema_key
         from word_entries w
         join dictionaries d on d.id = w.dictionary_id
         where w.id = $1`,
        [copyRows[0].copied_word_id],
      );

      expect(rows[0]).toEqual(
        expect.objectContaining({
          id: copyRows[0].copied_word_id,
          is_nt2_2000: false,
          kind: "user",
          visibility: "private",
          owner_user_id: userId,
          schema_key: "user-entry-v1",
        }),
      );
      expect(rows[0].raw).toEqual(
        expect.objectContaining({
          headword: expect.stringContaining("fsrs-copy-"),
          languageCode: "nl",
          sourceEntryId: sourceWordId,
          translation: {
            languageCode: "en",
            text: "copy",
          },
        }),
      );
    }, userId);
  });

  test("copy_entry_to_user_dictionary copies source definitions without filler notes", async () => {
    const userId = randomUUID();
    await withTransaction(pool, async (client) => {
      await ensureUserWithSettings(client, userId);
      const { rows: sourceRows } = await client.query(
        `insert into word_entries (
          language_code, headword, part_of_speech, gender, is_nt2_2000, raw
        )
        values ('nl', $1, 'noun', 'n', true, '{"meanings":[{"definition":"source definition"}]}'::jsonb)
        returning id`,
        [`fsrs-copy-definition-${Date.now()}`],
      );

      const { rows: copyRows } = await client.query(
        `select copy_entry_to_user_dictionary($1, $2, NULL, '{}'::jsonb) as copied_word_id`,
        [userId, sourceRows[0].id],
      );

      const { rows } = await client.query(
        `select raw from word_entries where id = $1`,
        [copyRows[0].copied_word_id],
      );

      expect(rows[0].raw).toEqual(
        expect.objectContaining({
          definition: "source definition",
          sourceEntryId: sourceRows[0].id,
        }),
      );
      expect(rows[0].raw.notes).toBeUndefined();
    }, userId);
  });

  test("user dictionary entry CRUD creates updates deletes owned entries", async () => {
    const userId = randomUUID();
    await withTransaction(pool, async (client) => {
      await ensureUserWithSettings(client, userId);

      const { rows: createRows } = await client.query(
        `select create_user_dictionary_entry(
          $1,
          NULL,
          jsonb_build_object(
            'headword', $2::text,
            'languageCode', 'nl',
            'translation', jsonb_build_object('languageCode', 'en', 'text', 'hassle'),
            'example', jsonb_build_object('source', 'Wat een gedoe.')
          )
        ) as word_id`,
        [userId, `fsrs-crud-${Date.now()}`],
      );
      const wordId = createRows[0].word_id;

      const { rows: createdRows } = await client.query(
        `select w.raw, d.kind, d.owner_user_id, d.schema_key
         from word_entries w
         join dictionaries d on d.id = w.dictionary_id
         where w.id = $1`,
        [wordId],
      );
      expect(createdRows[0]).toEqual(
        expect.objectContaining({
          kind: "user",
          owner_user_id: userId,
          schema_key: "user-entry-v1",
        }),
      );
      expect(createdRows[0].raw.translation.text).toBe("hassle");

      await client.query(
        `select update_user_dictionary_entry(
          $1,
          $2,
          jsonb_build_object(
            'headword', $3::text,
            'languageCode', 'nl',
            'definition', 'updated definition',
            'notes', 'updated note'
          )
        )`,
        [userId, wordId, createdRows[0].raw.headword],
      );

      const { rows: lookupRows } = await client.query(
        `select fetch_dictionary_entry_gated($1) as items`,
        [createdRows[0].raw.headword],
      );
      expect(lookupRows[0].items[0].id).toBe(wordId);
      expect(lookupRows[0].items[0].raw.definition).toBe("updated definition");

      await client.query(`select delete_user_dictionary_entry($1, $2)`, [
        userId,
        wordId,
      ]);

      const { rows: deletedRows } = await client.query(
        `select count(*)::int as count from word_entries where id = $1`,
        [wordId],
      );
      expect(deletedRows[0].count).toBe(0);
    }, userId);
  });

  test("user dictionary entry update is blocked for other users", async () => {
    const ownerId = randomUUID();
    const otherId = randomUUID();
    await withTransaction(pool, async (client) => {
      await ensureUserWithSettings(client, ownerId);
      await ensureUserWithSettings(client, otherId);

      await client.query(`select set_config('request.jwt.claim.sub', $1, true)`, [
        ownerId,
      ]);
      const { rows } = await client.query(
        `select create_user_dictionary_entry(
          $1,
          NULL,
          jsonb_build_object(
            'headword', $2::text,
            'languageCode', 'nl',
            'definition', 'owned definition'
          )
        ) as word_id`,
        [ownerId, `fsrs-private-crud-${Date.now()}`],
      );

      await client.query(`select set_config('request.jwt.claim.sub', $1, true)`, [
        otherId,
      ]);
      await expect(
        client.query(
          `select update_user_dictionary_entry(
            $1,
            $2,
            jsonb_build_object(
              'headword', 'blocked',
              'languageCode', 'nl',
              'definition', 'blocked'
            )
          )`,
          [otherId, rows[0].word_id],
        ),
      ).rejects.toThrow(/target_dictionary_not_editable/);
    }, ownerId);
  });

  test("created user dictionary entries can be listed, scheduled, and reviewed", async () => {
    const userId = randomUUID();
    await withTransaction(pool, async (client) => {
      await ensureUserWithSettings(client, userId, {
        daily_new_limit: 10,
        daily_review_limit: 10,
      });

      const headword = `fsrs-user-train-${Date.now()}`;
      const { rows: createRows } = await client.query(
        `select create_user_dictionary_entry(
          $1,
          NULL,
          jsonb_build_object(
            'headword', $2::text,
            'languageCode', 'nl',
            'translation', jsonb_build_object('languageCode', 'en', 'text', 'trainable user entry'),
            'example', jsonb_build_object('source', 'Dit is een eigen woord.')
          )
        ) as word_id`,
        [userId, headword],
      );
      const wordId = createRows[0].word_id;

      const { rows: listRows } = await client.query(
        `insert into user_word_lists (user_id, language_code, primary_language_code, name)
         values ($1, 'nl', 'nl', $2)
         returning id`,
        [userId, `Training list ${Date.now()}`],
      );
      const listId = listRows[0].id;
      await client.query(`select add_entry_to_user_list($1, $2, $3)`, [
        userId,
        listId,
        wordId,
      ]);

      const { rows: listFetchRows } = await client.query(
        `select fetch_words_for_list_gated(
          $1::uuid,
          'user',
          NULL,
          NULL,
          NULL,
          NULL,
          NULL,
          1,
          20
        ) as result`,
        [listId],
      );
      expect(listFetchRows[0].result.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: wordId,
            headword,
            raw: expect.objectContaining({
              translation: expect.objectContaining({
                text: "trainable user entry",
              }),
            }),
          }),
        ]),
      );

      const { rows: nextRows } = await client.query(
        `select get_next_card(
          $1::uuid,
          ARRAY[$2]::text[],
          ARRAY[]::uuid[],
          $3::uuid,
          'user',
          'both',
          'new',
          ARRAY[]::text[]
        ) as item`,
        [userId, mode, listId],
      );

      expect(nextRows[0]?.item).toEqual(
        expect.objectContaining({
          id: wordId,
          headword,
          mode,
          raw: expect.objectContaining({
            translation: expect.objectContaining({
              text: "trainable user entry",
            }),
          }),
          stats: expect.objectContaining({
            source: "new",
          }),
        }),
      );

      await callHandleReview(client, userId, wordId, mode, "success", randomUUID());

      const { rows: statusRows } = await client.query(
        `select fsrs_reps, last_result, fsrs_enabled
         from user_card_status
         where user_id = $1 and entry_id = $2 and card_type_id = $3`,
        [userId, wordId, mode],
      );
      expect(statusRows[0]).toEqual(
        expect.objectContaining({
          fsrs_reps: 1,
          last_result: "success",
          fsrs_enabled: true,
        }),
      );
    }, userId);
  });

  test("get_next_card schedules with entry and card terminology", async () => {
    const userId = randomUUID();
    await withTransaction(pool, async (client) => {
      await ensureUserWithSettings(client, userId, {
        daily_new_limit: 10,
        daily_review_limit: 10,
      });
      const firstWordId = await insertWord(client, `fsrs-next-card-a-${Date.now()}`);
      const secondWordId = await insertWord(client, `fsrs-next-card-b-${Date.now()}`);
      const { rows: listRows } = await client.query(
        `insert into user_word_lists (user_id, language_code, primary_language_code, name)
         values ($1, 'nl', 'nl', $2)
         returning id`,
        [userId, `Next card list ${Date.now()}`],
      );
      const listId = listRows[0].id;
      await client.query(`select add_entry_to_user_list($1, $2, $3)`, [
        userId,
        listId,
        firstWordId,
      ]);
      await client.query(`select add_entry_to_user_list($1, $2, $3)`, [
        userId,
        listId,
        secondWordId,
      ]);

      const { rows } = await client.query(
        `select get_next_card(
          $1::uuid,
          ARRAY[$2]::text[],
          ARRAY[$3]::uuid[],
          $4::uuid,
          'user',
          'both',
          'new',
          ARRAY[]::text[]
        ) as item`,
        [userId, mode, firstWordId, listId],
      );

      expect(rows[0]?.item).toEqual(
        expect.objectContaining({
          id: secondWordId,
          mode,
          stats: expect.objectContaining({
            source: "new",
          }),
        }),
      );
    }, userId);
  });

  test("get_next_card honors overdue order and daily caps", async () => {
    const userId = randomUUID();
    await withTransaction(pool, async (client) => {
      await ensureUserWithSettings(client, userId, { daily_new_limit: 1, daily_review_limit: 2 });

      const overdueId = await insertWord(client, `fsrs-overdue-${Date.now()}`);
      const newId = await insertWord(client, `fsrs-new-${Date.now() + 1}`);
      const { rows: listRows } = await client.query(
        `insert into user_word_lists (user_id, language_code, primary_language_code, name)
         values ($1, 'nl', 'nl', $2)
         returning id`,
        [userId, `Scheduler list ${Date.now()}`],
      );
      const listId = listRows[0].id;
      await client.query(`select add_entry_to_user_list($1, $2, $3)`, [
        userId,
        listId,
        overdueId,
      ]);
      await client.query(`select add_entry_to_user_list($1, $2, $3)`, [
        userId,
        listId,
        newId,
      ]);

      const getNextFromList = async () => {
        const { rows } = await client.query(
          `select get_next_card(
            $1::uuid,
            ARRAY[$2]::text[],
            ARRAY[]::uuid[],
            $3::uuid,
            'user',
            'both',
            'auto',
            ARRAY[]::text[]
          ) as item`,
          [userId, mode, listId],
        );
        return rows[0]?.item as any | undefined;
      };

      await client.query(
        `insert into user_card_status (
          user_id, entry_id, card_type_id,
          fsrs_stability, fsrs_difficulty, fsrs_reps, fsrs_lapses,
          fsrs_last_interval, fsrs_last_grade, fsrs_enabled, next_review_at, last_seen_at
        ) values ($1, $2, $3, 1.0, 5.0, 1, 0, 1.0, 3, true, now() - interval '1 day', now() - interval '1 day')`,
        [userId, overdueId, mode]
      );

      const first = await getNextFromList();
      expect(first?.id).toBe(overdueId);
      expect(first?.stats?.source).toBe("review");

      // Hit the review cap for today.
      await client.query(
        `insert into user_review_log (user_id, word_id, mode, grade, review_type, reviewed_at)
         values ($1, $2, $3, 3, 'review', now()), ($1, $2, $3, 3, 'review', now())`,
        [userId, overdueId, mode]
      );

      const second = await getNextFromList();
      expect(second?.id).toBe(newId);
      expect(second?.stats?.source).toBe("new");

      // Hit the new cap as well.
      await client.query(
        `insert into user_review_log (user_id, word_id, mode, grade, review_type, reviewed_at)
         values ($1, $2, $3, 3, 'new', now())`,
        [userId, newId, mode]
      );

      const none = await getNextFromList();
      expect(none).toBeUndefined();
    }, userId);
  });

  test("get_next_card excludes reviewed cards by entry and mode", async () => {
    const userId = randomUUID();
    await withTransaction(pool, async (client) => {
      await ensureUserWithSettings(client, userId, {
        daily_new_limit: 0,
        daily_review_limit: 10,
      });

      const wordId = await insertWord(client, `fsrs-card-key-${Date.now()}`);
      const reverseMode = "definition-to-word";

      await client.query(
        `insert into user_card_status (
          user_id, entry_id, card_type_id,
          fsrs_stability, fsrs_difficulty, fsrs_reps, fsrs_lapses,
          fsrs_last_interval, fsrs_last_grade, fsrs_enabled, next_review_at, last_seen_at
        ) values
          ($1, $2, $3, 1.0, 5.0, 1, 0, 1.0, 3, true, now() - interval '2 days', now() - interval '2 days'),
          ($1, $2, $4, 1.0, 5.0, 1, 0, 1.0, 3, true, now() - interval '1 day', now() - interval '1 day')`,
        [userId, wordId, mode, reverseMode],
      );

      const { rows } = await client.query(
        `select get_next_card(
          $1::uuid,
          $2::text[],
          ARRAY[]::uuid[],
          NULL::uuid,
          'curated',
          'review',
          'review',
          $3::text[]
        ) as item`,
        [userId, [mode, reverseMode], [`${wordId}:${mode}`]],
      );

      expect(rows[0]?.item?.id).toBe(wordId);
      expect(rows[0]?.item?.mode).toBe(reverseMode);
    }, userId);
  });

  test("get_next_filtered_card filters by local date window and source", async () => {
    const userId = randomUUID();
    await withTransaction(pool, async (client) => {
      await ensureUserWithSettings(client, userId, {
        daily_new_limit: 10,
        daily_review_limit: 10,
      });

      const todayWordId = await insertWord(client, `fsrs-filter-today-${Date.now()}`);
      const yesterdayWordId = await insertWord(client, `fsrs-filter-yesterday-${Date.now()}`);
      const otherSourceWordId = await insertWord(client, `fsrs-filter-other-${Date.now()}`);

      const { rows: sourceRows } = await client.query(
        `insert into learning_sources (
          source_identity_key, kind, provider, external_id, canonical_url, title, language_code, metadata
        ) values
          ($1, 'youtube_video', 'youtube', 'video-a', 'https://www.youtube.com/watch?v=video-a', 'Video A', 'nl', '{}'::jsonb),
          ($2, 'youtube_video', 'youtube', 'video-b', 'https://www.youtube.com/watch?v=video-b', 'Video B', 'nl', '{}'::jsonb)
        returning id, external_id`,
        [`source-a-${Date.now()}`, `source-b-${Date.now()}`],
      );
      const sourceA = sourceRows.find((row) => row.external_id === "video-a").id;
      const sourceB = sourceRows.find((row) => row.external_id === "video-b").id;

      await client.query(
        `insert into user_card_status (
          user_id, entry_id, card_type_id,
          fsrs_stability, fsrs_difficulty, fsrs_reps, fsrs_lapses,
          fsrs_last_interval, fsrs_last_grade, fsrs_enabled, next_review_at, last_seen_at
        ) values
          ($1, $2, $5, 1.0, 5.0, 1, 0, 1.0, 3, true, now() - interval '1 hour', now()),
          ($1, $3, $5, null, null, 0, 0, null, null, false, now(), now() - interval '1 day'),
          ($1, $4, $5, null, null, 0, 0, null, null, false, now(), now())`,
        [userId, todayWordId, yesterdayWordId, otherSourceWordId, mode],
      );

      await client.query(
        `insert into user_card_action_events (
          user_id, entry_id, card_type_id, action, client_event_id, source_id, action_payload_hash, created_at
        ) values
          ($1, $2, $5, 'review-card', 'today-video-a', $6, 'hash-today-video-a', now()),
          ($1, $3, $5, 'record-view', 'yesterday-video-a', $6, 'hash-yesterday-video-a', now() - interval '1 day'),
          ($1, $4, $5, 'record-view', 'today-video-b', $7, 'hash-today-video-b', now())`,
        [userId, todayWordId, yesterdayWordId, otherSourceWordId, mode, sourceA, sourceB],
      );

      const getFiltered = async (filter: Record<string, unknown>) => {
        const { rows } = await client.query(
          `select get_next_filtered_card(
            $1::uuid,
            ARRAY[$2]::text[],
            ARRAY[]::uuid[],
            NULL::uuid,
            'curated',
            'both',
            'auto',
            ARRAY[]::text[],
            $3::jsonb
          ) as item`,
          [userId, mode, JSON.stringify({ timezone: "UTC", ...filter })],
        );
        return rows[0]?.item as any | undefined;
      };

      const todayFromSourceA = await getFiltered({
        dateWindow: "today",
        sourceId: sourceA,
      });
      expect(todayFromSourceA?.id).toBe(todayWordId);
      expect(todayFromSourceA?.stats?.source).toBe("review");
      expect(todayFromSourceA?.stats?.reason).toBe("filtered");

      const yesterdayFromSourceA = await getFiltered({
        dateWindow: "yesterday",
        sourceId: sourceA,
      });
      expect(yesterdayFromSourceA?.id).toBe(yesterdayWordId);
      expect(yesterdayFromSourceA?.stats?.source).toBe("new");

      const todayFromYoutubeKind = await getFiltered({
        dateWindow: "today",
        sourceKind: "youtube",
        externalId: "video-b",
      });
      expect(todayFromYoutubeKind?.id).toBe(otherSourceWordId);

      const noMatch = await getFiltered({
        dateWindow: "daysAgo",
        daysAgo: 30,
        sourceId: sourceA,
      });
      expect(noMatch).toBeUndefined();
    }, userId);
  });

  test("get_training_filter_sources returns safe user-owned source labels", async () => {
    const userId = randomUUID();
    const otherUserId = randomUUID();
    await withTransaction(pool, async (client) => {
      await ensureUserWithSettings(client, userId);
      await ensureUserWithSettings(client, otherUserId);
      const wordId = await insertWord(client, `fsrs-filter-source-list-${Date.now()}`);

      const { rows: sourceRows } = await client.query(
        `insert into learning_sources (
          source_identity_key, kind, provider, external_id, canonical_url, title, language_code, metadata
        ) values
          ($1, 'youtube_video', 'youtube', 'video-safe', 'https://www.youtube.com/watch?v=video-safe', 'Safe Video', 'nl', '{}'::jsonb),
          ($2, 'document', 'pontix', 'private-doc', null, 'Private Doc', 'nl', '{}'::jsonb)
        returning id, external_id`,
        [`source-safe-${Date.now()}`, `source-private-${Date.now()}`],
      );
      const safeSource = sourceRows.find((row) => row.external_id === "video-safe").id;
      const privateSource = sourceRows.find((row) => row.external_id === "private-doc").id;

      await client.query(
        `insert into user_card_status (user_id, entry_id, card_type_id, last_seen_at)
         values ($1, $2, $3, now())`,
        [userId, wordId, mode],
      );
      await client.query(
        `insert into user_card_action_events (
          user_id, entry_id, card_type_id, action, client_event_id, source_id, action_payload_hash, created_at
        ) values
          ($1, $3, $4, 'record-view', 'safe-source-event', $5, 'safe-source-hash', now()),
          ($2, $3, $4, 'record-view', 'other-source-event', $6, 'other-source-hash', now())`,
        [userId, otherUserId, wordId, mode, safeSource, privateSource],
      );

      const { rows } = await client.query(
        `select get_training_filter_sources($1::uuid, 20) as source`,
        [userId],
      );

      expect(rows).toHaveLength(1);
      expect(rows[0].source).toEqual(
        expect.objectContaining({
          sourceId: safeSource,
          kind: "youtube_video",
          provider: "youtube",
          externalId: "video-safe",
          title: "Safe Video",
          label: "YouTube · Safe Video",
          eventCount: 1,
        }),
      );
    }, userId);
  });

  test("get_next_card skips dictionaries the user cannot read", async () => {
    const userId = randomUUID();
    const ownerId = randomUUID();
    await withTransaction(pool, async (client) => {
      await ensureUserWithSettings(client, userId, {
        daily_new_limit: 0,
        daily_review_limit: 10,
      });
      await ensureUserWithSettings(client, ownerId);

      const { rows: dictionaryRows } = await client.query(
        `insert into dictionaries (
          language_code, slug, name, kind, visibility, owner_user_id,
          schema_key, schema_version
        )
        values ('nl', $1, 'Private test dictionary', 'user', 'private', $2, 'nl-vandale-v1', 1)
        returning id`,
        [`private-${Date.now()}`, ownerId],
      );
      const privateDictionaryId = dictionaryRows[0].id;

      const publicWordId = await insertWord(client, `fsrs-public-${Date.now()}`);
      const { rows: privateRows } = await client.query(
        `insert into word_entries (
          dictionary_id, language_code, headword, part_of_speech, gender,
          is_nt2_2000, raw, meaning_id
        )
        values ($1, 'nl', $2, 'noun', 'n', true, '{}'::jsonb, 1)
        returning id`,
        [privateDictionaryId, `fsrs-private-${Date.now()}`],
      );
      const privateWordId = privateRows[0].id;

      await client.query(
        `insert into user_card_status (
          user_id, entry_id, card_type_id,
          fsrs_stability, fsrs_difficulty, fsrs_reps, fsrs_lapses,
          fsrs_last_interval, fsrs_last_grade, fsrs_enabled, next_review_at, last_seen_at
        ) values
          ($1, $2, $4, 1.0, 5.0, 1, 0, 1.0, 3, true, now() - interval '2 days', now() - interval '2 days'),
          ($1, $3, $4, 1.0, 5.0, 1, 0, 1.0, 3, true, now() - interval '1 day', now() - interval '1 day')`,
        [userId, privateWordId, publicWordId, mode],
      );

      const next = await callGetNextCard(client, userId, mode);
      expect(next?.id).toBe(publicWordId);
      expect(next?.id).not.toBe(privateWordId);
    }, userId);
  });

  test("training stats exclude dictionaries the user cannot read", async () => {
    const userId = randomUUID();
    const ownerId = randomUUID();
    await withTransaction(pool, async (client) => {
      await ensureUserWithSettings(client, userId, {
        daily_new_limit: 0,
        daily_review_limit: 10,
      });
      await ensureUserWithSettings(client, ownerId);

      const publicWordId = await insertWord(client, `fsrs-stats-public-${Date.now()}`);
      const { rows: dictionaryRows } = await client.query(
        `insert into dictionaries (
          language_code, slug, name, kind, visibility, owner_user_id,
          schema_key, schema_version
        )
        values ('nl', $1, 'Private stats dictionary', 'user', 'private', $2, 'nl-vandale-v1', 1)
        returning id`,
        [`private-stats-${Date.now()}`, ownerId],
      );
      const { rows: privateRows } = await client.query(
        `insert into word_entries (
          dictionary_id, language_code, headword, part_of_speech, gender,
          is_nt2_2000, raw, meaning_id
        )
        values ($1, 'nl', $2, 'noun', 'n', true, '{}'::jsonb, 1)
        returning id`,
        [dictionaryRows[0].id, `fsrs-stats-private-${Date.now()}`],
      );
      const privateWordId = privateRows[0].id;

      const { rows: listRows } = await client.query(
        `insert into user_word_lists (user_id, language_code, primary_language_code, name)
         values ($1, 'nl', 'nl', $2)
         returning id`,
        [userId, `Stats mixed list ${Date.now()}`],
      );
      const listId = listRows[0].id;

      await client.query(
        `insert into user_word_list_items (list_id, word_id)
         values ($1, $2), ($1, $3)`,
        [listId, publicWordId, privateWordId],
      );

      await client.query(
        `insert into user_card_status (
          user_id, entry_id, card_type_id,
          fsrs_stability, fsrs_difficulty, fsrs_reps, fsrs_lapses,
          fsrs_last_interval, fsrs_last_grade, fsrs_enabled, next_review_at, last_seen_at
        ) values
          ($1, $2, $4, 3.0, 5.0, 1, 0, 1.0, 3, true, now() - interval '2 days', now() - interval '2 days'),
          ($1, $3, $4, 3.0, 5.0, 1, 0, 1.0, 3, true, now() - interval '1 day', now() - interval '1 day')`,
        [userId, publicWordId, privateWordId, mode],
      );

      const { rows: basicRows } = await client.query(
        `select get_training_stats($1, ARRAY[$2]::text[], $3, 'user') as stats`,
        [userId, mode, listId],
      );
      expect(basicRows[0].stats.totalItems).toBe(1);
      expect(basicRows[0].stats.totalSuccess).toBe(1);

      const { rows: detailedRows } = await client.query(
        `select get_detailed_training_stats($1, ARRAY[$2]::text[], $3, 'user') as stats`,
        [userId, mode, listId],
      );
      expect(detailedRows[0].stats.totalWordsInList).toBe(1);
      expect(detailedRows[0].stats.totalWordsLearned).toBe(1);
      expect(detailedRows[0].stats.reviewCardsDue).toBe(1);

      const { rows: scenarioRows } = await client.query(
        `select get_scenario_stats($1, 'understanding', $2, 'user') as stats`,
        [userId, listId],
      );
      expect(scenarioRows[0].stats.total).toBe(1);

      const { rows: privateWordStatsRows } = await client.query(
        `select get_scenario_word_stats($1, $2, 'understanding') as stats`,
        [userId, privateWordId],
      );
      expect(privateWordStatsRows[0].stats.cards_started).toBe(0);
    }, userId);
  });
});

if (!hasDb) {
  describe("FSRS RPC integration (skipped)", () => {
    test("skips without DB URL", () => {
      expect(getDbUrl()).toBeFalsy();
    });
  });
}
