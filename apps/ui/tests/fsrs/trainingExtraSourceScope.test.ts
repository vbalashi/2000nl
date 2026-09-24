import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import {
  ensureUserWithSettings,
  getDbUrl,
  insertWord,
  runMigrations,
  withTransaction,
} from "./dbTestUtils";

const dbUrl = getDbUrl();

async function sourceEntries(
  client: PoolClient,
  userId: string,
  filter: Record<string, unknown>,
  listId: string | null = null,
  listType: "curated" | "user" = "curated",
) {
  const { rows } = await client.query(
    `select entry_id from private.training_extra_source_entries_v1(
       $1::uuid, $2::uuid, $3::text, $4::jsonb
     ) order by entry_id`,
    [userId, listId, listType, JSON.stringify(filter)],
  );
  return rows.map((row) => row.entry_id as string);
}

(dbUrl ? describe : describe.skip)("extra-exercise source scope", () => {
  const pool = new Pool({ connectionString: dbUrl });

  beforeAll(async () => {
    await runMigrations(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  test("keeps material, lexical and activity filters exact for both exercise families", async () => {
    const userId = randomUUID();
    await withTransaction(pool, async (client) => {
      await ensureUserWithSettings(client, userId);
      const defaultEntry = await insertWord(client, `extra-default-${randomUUID()}`);
      const { rows: dictionaryRows } = await client.query(
        `insert into dictionaries (
           language_code, slug, name, kind, visibility,
           minimum_subscription_tier, schema_key, schema_version
         ) values
           ('nl', $1, 'Accessible', 'curated', 'private', 'free', 'nl-vandale-v1', 1),
           ('nl', $2, 'Unavailable', 'curated', 'private', 'free', 'nl-vandale-v1', 1)
         returning id`,
        [`extra-accessible-${userId}`, `extra-unavailable-${userId}`],
      );
      const accessibleDictionary = dictionaryRows[0].id as string;
      const unavailableDictionary = dictionaryRows[1].id as string;
      await client.query(
        `insert into dictionary_entitlements (
           dictionary_id, subject_type, subject_key, permission
         ) values ($1, 'user', $2, 'read')`,
        [accessibleDictionary, userId],
      );
      const { rows: entryRows } = await client.query(
        `insert into word_entries (
           dictionary_id, language_code, headword, part_of_speech,
           is_nt2_2000, raw
         ) values
           ($1, 'nl', $3, 'bn', false, '{}'::jsonb),
           ($1, 'nl', $4, 'ww', false, '{}'::jsonb),
           ($2, 'nl', $5, 'bn', false, '{}'::jsonb)
         returning id, dictionary_id, part_of_speech`,
        [accessibleDictionary, unavailableDictionary,
          `extra-adjective-${userId}`, `extra-verb-${userId}`,
          `extra-hidden-${userId}`],
      );
      const adjective = entryRows.find(
        (row) => row.dictionary_id === accessibleDictionary && row.part_of_speech === "bn",
      )?.id as string;
      const verb = entryRows.find(
        (row) => row.dictionary_id === accessibleDictionary && row.part_of_speech === "ww",
      )?.id as string;
      const selected = {
        dictionaryScope: {
          mode: "selected", languageCode: "nl",
          dictionaryIds: [accessibleDictionary, unavailableDictionary],
        },
      };
      expect(await sourceEntries(client, userId, {})).toContain(defaultEntry);
      expect(await sourceEntries(client, userId, {})).not.toContain(adjective);
      expect(await sourceEntries(client, userId, selected)).toEqual([adjective, verb].sort());
      expect(await sourceEntries(client, userId, {
        ...selected, partOfSpeech: ["bn"],
      })).toEqual([adjective]);
      expect(await sourceEntries(client, userId, {
        ...selected, partOfSpeech: ["zn"],
      })).toEqual([]);

      const idiomNodeIds = new Map<string, string>();
      for (const entryId of [adjective, verb]) {
        const idiomId = randomUUID();
        idiomNodeIds.set(entryId, idiomId);
        await client.query(
          `insert into private.platform_v2_content_nodes (
             id, entry_id, parent_content_node_id, kind, binding_state,
             first_source_revision, last_source_revision,
             source_text_fingerprint, diagnostic_locator
           ) values
             ($1, $2, null, 'idiom', 'active', 'extra-v1', 'extra-v1', $3, $4),
             ($5, $2, $1, 'idiom-explanation', 'active', 'extra-v1',
              'extra-v1', $6, $7)`,
          [idiomId, entryId, `fingerprint-${idiomId}`, `idiom-${idiomId}`,
            randomUUID(), `explanation-${idiomId}`, `explanation-${idiomId}`],
        );
      }
      const identityVersion = `extra-source-${randomUUID()}`;
      const { rows: importRows } = await client.query(
        `insert into private.dictionary_import_runs (
           dictionary_id, identity_scheme_version, artifact_format_version,
           manifest_checksum, input_checksum, source_record_count,
           artifact_count, status
         ) values ($1, $2, 'test-v1', $3, $4, 2, 2, 'completed')
         returning id`,
        [accessibleDictionary, identityVersion, randomUUID(), randomUUID()],
      );
      for (const [index, entryId] of [adjective, verb].entries()) {
        await client.query(
          `insert into private.source_entry_bindings (
             dictionary_id, identity_scheme_version, source_entry_key,
             source_group_key, sense_ordinal, word_entry_id, binding_state,
             first_seen_run_id, last_seen_run_id, manifest_checksum,
             content_fingerprint_version, content_fingerprint,
             identity_evidence, reconciliation_decision
           ) values (
             $1, $2, $3, 'extra-source-group', $4, $5, 'active',
             $6, $6, 'test-manifest', 'test-v1', $7,
             '{"kind":"test"}'::jsonb, '{"decision":"create"}'::jsonb
           )`,
          [accessibleDictionary, identityVersion, `extra-entry-${index}-${randomUUID()}`,
            index + 1, entryId, importRows[0].id, `fingerprint-${entryId}`],
        );
      }
      // The learner knows one ordinary meaning; idioms attached to its sibling
      // meaning in the same source group must be eligible too.
      await client.query(
        `insert into user_card_status (
           user_id, entry_id, card_type_id, fsrs_enabled, in_learning, next_review_at
         ) values ($1, $2, 'word-to-definition', true, true, now())`,
        [userId, adjective],
      );
      const { rows: idiomRows } = await client.query(
        `select item from private.platform_v2_idiom_exercise_candidates_v2(
           $1::uuid, 'direct', 20, 0, null::uuid, 'curated', 'new', $2::jsonb
         ) as item`,
        [userId, JSON.stringify({ ...selected, partOfSpeech: ["bn"] })],
      );
      expect(idiomRows.map((row) => row.item.entryId)).toEqual([adjective]);
      const { rows: siblingRows } = await client.query(
        `select item from private.platform_v2_idiom_exercise_candidates_v2(
           $1::uuid, 'direct', 20, 0, null::uuid, 'curated', 'new', $2::jsonb
         ) as item`,
        [userId, JSON.stringify({ ...selected, partOfSpeech: ["ww"] })],
      );
      expect(siblingRows.map((row) => row.item.entryId)).toEqual([verb]);

      const startFilter = { ...selected, partOfSpeech: ["bn", "zn"] };
      const requestId = randomUUID();
      const start = async (filter = startFilter) => {
        await client.query("set local role authenticated");
        try {
          return await client.query(
            `select public.start_platform_v2_idiom_training_session(
               $1::uuid, 'direct', '5', $2::uuid, null::uuid, 'curated',
               'new', $3::jsonb, 3
             ) as session`,
            [userId, requestId, JSON.stringify(filter)],
          );
        } finally {
          await client.query("reset role");
        }
      };
      const { rows: startedRows } = await start();
      const sessionId = startedRows[0].session.sessionId as string;
      expect(startedRows[0].session).toMatchObject({
        exerciseFamily: "idiom", plannedTotal: 1, plannedNew: 1,
      });
      const { rows: retryRows } = await start();
      expect(retryRows[0].session.sessionId).toBe(sessionId);
      const { rows: reorderedRetryRows } = await start({
        dictionaryScope: {
          ...selected.dictionaryScope,
          dictionaryIds: [...selected.dictionaryScope.dictionaryIds].reverse(),
        },
        partOfSpeech: ["zn", "bn", "bn"],
      });
      expect(reorderedRetryRows[0].session.sessionId).toBe(sessionId);
      const { rows: memberRows } = await client.query(
        `select target.entry_id from training_session_exercise_members member
         join private.platform_v2_training_exercise_targets target
           on target.id = member.target_id
         where member.session_id = $1`,
        [sessionId],
      );
      expect(memberRows.map((row) => row.entry_id)).toEqual([adjective]);
      const { rows: storedRows } = await client.query(
        `select training_filter, new_review_ratio, card_filter
         from training_sessions where id = $1`,
        [sessionId],
      );
      expect(storedRows[0]).toEqual({
        training_filter: {
          ...startFilter,
          dictionaryScope: {
            ...startFilter.dictionaryScope,
            dictionaryIds: [...startFilter.dictionaryScope.dictionaryIds].sort(),
          },
        },
        new_review_ratio: 3,
        card_filter: "new",
      });
      await client.query("savepoint changed_idiom_start_request");
      await client.query("set local role authenticated");
      await expect(client.query(
        `select public.start_platform_v2_idiom_training_session(
           $1::uuid, 'direct', '5', $2::uuid, null::uuid, 'curated',
           'new', $3::jsonb, 3
         )`,
        [userId, requestId, JSON.stringify({ ...selected, partOfSpeech: ["ww"] })],
      ))
        .rejects.toThrow("idiom_training_session_start_idempotency_conflict");
      await client.query("rollback to savepoint changed_idiom_start_request");
      await client.query("reset role");

      const adjectiveIdiom = idiomNodeIds.get(adjective);
      if (!adjectiveIdiom) throw new Error("missing adjective idiom fixture");
      await client.query(
        `insert into private.platform_v2_content_nodes (
           id, entry_id, parent_content_node_id, kind, binding_state,
           first_source_revision, last_source_revision,
           source_text_fingerprint, diagnostic_locator
         ) values ($1, $2, $3, 'idiom-explanation', 'active',
           'extra-v1', 'extra-v1', $4, ' ')`,
        [randomUUID(), adjective, adjectiveIdiom, `blank-${randomUUID()}`],
      );
      const { rows: ambiguousRows } = await client.query(
        `select item from private.platform_v2_idiom_exercise_candidates_v2(
           $1::uuid, 'direct', 20, 0, null::uuid, 'curated', 'new', $2::jsonb
         ) as item`,
        [userId, JSON.stringify(startFilter)],
      );
      expect(ambiguousRows).toEqual([]);

      const { rows: listRows } = await client.query(
        `insert into word_lists (language_code, slug, name)
         values ('nl', $1, 'Extra exercise list') returning id`,
        [`extra-list-${userId}`],
      );
      const listId = listRows[0].id as string;
      await client.query(
        `insert into word_list_items (list_id, word_id) values ($1, $2)`,
        [listId, adjective],
      );
      expect(await sourceEntries(client, userId, {}, listId)).toEqual([adjective]);
      expect(await sourceEntries(client, userId, { partOfSpeech: ["ww"] }, listId)).toEqual([]);

      const { rows: userListRows } = await client.query(
        `insert into user_word_lists (user_id, language_code, name)
         values ($1, 'nl', $2) returning id`,
        [userId, `Extra user list ${userId}`],
      );
      const userListId = userListRows[0].id as string;
      await client.query(
        `insert into user_word_list_items (list_id, word_id) values ($1, $2)`,
        [userListId, defaultEntry],
      );
      expect(await sourceEntries(client, userId, {}, userListId, "user"))
        .toEqual([defaultEntry]);
      const otherUserId = randomUUID();
      await ensureUserWithSettings(client, otherUserId);
      expect(await sourceEntries(client, otherUserId, {}, userListId, "user"))
        .toEqual([]);

      const { rows: sourceRows } = await client.query(
        `insert into learning_sources (
           source_identity_key, kind, provider, external_id, canonical_url,
           title, language_code, metadata
         ) values ($1, 'youtube_video', 'youtube', 'extra-video',
           'https://www.youtube.com/watch?v=extra-video', 'Extra video', 'nl', '{}'::jsonb)
         returning id`,
        [`extra-source-${userId}`],
      );
      const sourceId = sourceRows[0].id as string;
      await client.query(
        `insert into user_card_action_events (
           user_id, entry_id, card_type_id, action, client_event_id,
           source_id, action_payload_hash
         ) values ($1, $2, 'word-to-definition', 'record-view', $3, $4, 'extra-scope')`,
        [userId, adjective, randomUUID(), sourceId],
      );
      expect(await sourceEntries(client, userId, {
        ...selected, sourceId,
      })).toEqual([adjective]);
      expect(await sourceEntries(client, userId, {
        ...selected, sourceId, dateWindow: "today",
      })).toEqual([adjective]);
      expect(await sourceEntries(client, userId, {
        ...selected, sourceId, dateWindow: "yesterday",
      })).toEqual([]);
      expect(await sourceEntries(client, userId, {
        ...selected, sourceKind: "youtube", partOfSpeech: ["ww"],
      })).toEqual([]);
      expect(await sourceEntries(client, userId, {
        ...selected, sourceId: randomUUID(),
      })).toEqual([]);

      await client.query("savepoint malformed_extra_scope");
      await expect(sourceEntries(client, userId, {
        dictionaryScope: { mode: "selected", languageCode: "nl", dictionaryIds: [] },
      })).rejects.toThrow("training_material_unavailable");
      await client.query("rollback to savepoint malformed_extra_scope");

      await client.query("savepoint malformed_activity_scope");
      await expect(sourceEntries(client, userId, {
        ...selected, sourceId: "not-a-uuid",
      })).rejects.toThrow("invalid_training_source_id");
      await client.query("rollback to savepoint malformed_activity_scope");

      await client.query("savepoint malformed_date_scope");
      await expect(sourceEntries(client, userId, {
        ...selected, dateWindow: "unknown",
      })).rejects.toThrow("invalid_training_date_window");
      await client.query("rollback to savepoint malformed_date_scope");
    }, userId);
  });
});
