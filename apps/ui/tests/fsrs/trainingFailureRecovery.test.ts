import { randomUUID } from "crypto";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import {
  ensureUserWithSettings,
  getDbUrl,
  insertWord,
  runMigrations,
} from "./dbTestUtils";

const databaseUrl = getDbUrl();
const describeDb = databaseUrl ? describe : describe.skip;

async function withCommittedTransaction<T>(
  pool: Pool,
  userId: string,
  fn: (client: PoolClient) => Promise<T>,
  jwtRole = "authenticated",
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `select set_config('request.jwt.claim.sub', $1, true),
              set_config('request.jwt.claim.role', $2, true)`,
      [userId, jwtRole],
    );
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

describeDb("training failure recovery", () => {
  const pool = new Pool({ connectionString: databaseUrl });

  beforeAll(async () => {
    await runMigrations(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  test("keeps an accepted action durable while the next-card load recovers", async () => {
    const userId = randomUUID();
    const entryIds: string[] = [];
    let privateDictionaryId = "";
    let listId = "";
    let sessionId = "";

    try {
      await withCommittedTransaction(pool, userId, async (client) => {
        await ensureUserWithSettings(client, userId, {
          daily_new_limit: 1,
          daily_review_limit: 1,
        });

        const firstEntryId = await insertWord(client, `recovery-first-${userId}`);
        entryIds.push(firstEntryId);

        const { rows: dictionaryRows } = await client.query(
          `insert into dictionaries (
             language_code, slug, name, kind, visibility, owner_user_id,
             minimum_subscription_tier, schema_key, schema_version
           ) values (
             'nl', $1, 'Recovery fixture', 'curated', 'private', null,
             'free', 'nl-vandale-v1', 1
           ) returning id`,
          [`recovery-${userId}`],
        );
        privateDictionaryId = dictionaryRows[0].id as string;
        await client.query(
          `insert into dictionary_entitlements (
             dictionary_id, subject_type, subject_key, permission
           ) values ($1, 'user', $2, 'read')`,
          [privateDictionaryId, userId],
        );
        const { rows: secondRows } = await client.query(
          `insert into word_entries (
             dictionary_id, language_code, headword, part_of_speech,
             is_nt2_2000, raw
           ) values ($1, 'nl', $2, 'noun', true, '{}'::jsonb)
           returning id`,
          [privateDictionaryId, `recovery-second-${userId}`],
        );
        const secondEntryId = secondRows[0].id as string;
        entryIds.push(secondEntryId);

        const thirdEntryId = await insertWord(client, `recovery-third-${userId}`);
        entryIds.push(thirdEntryId);

        const { rows: listRows } = await client.query(
          `insert into user_word_lists (
             user_id, language_code, primary_language_code, name
           ) values ($1, 'nl', 'nl', $2)
           returning id`,
          [userId, `Recovery list ${userId}`],
        );
        listId = listRows[0].id as string;
        for (const entryId of entryIds) {
          await client.query(
            `insert into user_word_list_items (list_id, word_id)
             values ($1, $2)`,
            [listId, entryId],
          );
        }

        const { rows: sessionRows } = await client.query(
          `insert into training_sessions (
             user_id, session_size, card_type_ids, list_id, list_type,
             card_filter, training_filter, requested_total,
             planned_new, planned_review, planned_total
           ) values (
             $1, '2', ARRAY['word-to-definition']::text[], $2, 'user',
             'both', '{}'::jsonb, 2, 2, 0, 2
           ) returning id`,
          [userId, listId],
        );
        sessionId = sessionRows[0].id as string;
        await client.query(
          `insert into training_session_members (
             session_id, ordinal, entry_id, card_type_id, queue_source
           ) values
             ($1, 1, $2, 'word-to-definition', 'new'),
             ($1, 2, $3, 'word-to-definition', 'new')`,
          [sessionId, firstEntryId, secondEntryId],
        );
      });

      const nextCard = async () =>
        withCommittedTransaction(pool, userId, async (client) => {
          const { rows } = await client.query(
            `select get_next_training_session_card(
              $1::uuid, $2::uuid, ARRAY[]::text[]
            ) as card`,
            [userId, sessionId],
          );
          return rows[0]?.card as Record<string, unknown> | undefined;
        });

      const readStateRevision = async (entryId: string) =>
        withCommittedTransaction(pool, userId, async (client) => {
          const { rows } = await client.query(
            `select state_revision
               from get_platform_v2_card_states_for_entries(
                 $1::uuid, ARRAY[$2::uuid], ARRAY['word-to-definition']::text[]
               )`,
            [userId, entryId],
          );
          return rows[0]?.state_revision as string;
        });

      const performLearn = async (
        entryId: string,
        eventId: string,
        stateRevision: string,
      ) =>
        withCommittedTransaction(
          pool,
          userId,
          async (client) => {
            const { rows } = await client.query(
              `select perform_platform_v2_card_action_as_principal(
                $1::uuid, 'start-learning', $2::uuid,
                'word-to-definition', $3::text, null, null, null,
                $4::uuid, null, 'first_party', null, $5::uuid
              ) as result`,
              [userId, entryId, stateRevision, eventId, sessionId],
            );
            return rows[0]?.result as Record<string, unknown>;
          },
          "service_role",
        );

      const first = await nextCard();
      expect(first).toEqual(
        expect.objectContaining({
          id: entryIds[0],
          trainingSessionId: sessionId,
          trainingSessionOrdinal: 1,
        }),
      );

      const clientEventId = randomUUID();
      const firstStateRevision = await readStateRevision(entryIds[0]);
      await expect(
        performLearn(entryIds[0], clientEventId, firstStateRevision),
      ).resolves.toEqual(
        expect.objectContaining({
          status: "accepted",
          actionId: "start-learning",
        }),
      );

      // The accepted Learn is committed before the next presentation request.
      // Revoke only the next member's dictionary access to model a permanent
      // content lookup failure after the first action has already succeeded.
      await withCommittedTransaction(pool, userId, async (client) => {
        await client.query(
          `delete from dictionary_entitlements
           where dictionary_id = $1
             and subject_type = 'user'
             and subject_key = $2`,
          [privateDictionaryId, userId],
        );
      });

      const failedNext = await nextCard();
      expect(failedNext).toEqual(
        expect.objectContaining({
          trainingSessionUnavailable: true,
          trainingSessionOrdinal: 2,
          entryId: entryIds[1],
          reason: "dictionary-access-revoked",
        }),
      );

      const { rows: unavailableRows } = await withCommittedTransaction(
        pool,
        userId,
        async (client) =>
          client.query(
            `select mark_training_session_member_unavailable(
              $1::uuid, $2::uuid, $3::uuid,
              'word-to-definition', 'dictionary-access-revoked'
            ) as result`,
            [userId, sessionId, entryIds[1]],
          ),
      );
      expect(unavailableRows[0].result).toEqual(
        expect.objectContaining({
          status: "unavailable-replaced",
          replacementOrdinal: 3,
        }),
      );

      const recovered = await nextCard();
      expect(recovered).toEqual(
        expect.objectContaining({
          id: entryIds[2],
          trainingSessionId: sessionId,
          trainingSessionOrdinal: 3,
        }),
      );
      expect(await nextCard()).toEqual(recovered);

      // A duplicate retry of the already accepted action is idempotent and
      // cannot consume a second member or create a second durable event.
      await expect(
        performLearn(entryIds[0], clientEventId, firstStateRevision),
      ).resolves.toEqual(
        expect.objectContaining({
          status: "duplicate",
          actionId: "start-learning",
        }),
      );

      const durableRows = await withCommittedTransaction(
        pool,
        userId,
        async (client) => {
          const { rows } = await client.query(
            `select
               (select count(*) from user_card_action_events
                 where user_id = $1 and action = 'start-learning') as action_events,
               (select count(*) from platform_v2_action_receipts
                 where user_id = $1) as receipts,
               (select count(*) from training_session_members
                 where session_id = $2 and consumed_at is not null) as consumed,
               (select consumed_at from training_session_members
                 where session_id = $2 and ordinal = 1) as first_consumed_at,
               (select unavailable_reason from training_session_members
                 where session_id = $2 and ordinal = 2) as unavailable_reason`,
            [userId, sessionId],
          );
          return rows[0];
        },
      );
      expect(durableRows).toEqual({
        action_events: "1",
        receipts: "1",
        consumed: "1",
        first_consumed_at: expect.any(Date),
        unavailable_reason: "dictionary-access-revoked",
      });
    } finally {
      await withCommittedTransaction(pool, userId, async (client) => {
        await client.query(
          `alter table training_session_members
             disable trigger training_session_members_identity_immutable`,
        );
        await client.query(
          `delete from platform_v2_action_receipts where user_id = $1::uuid`,
          [userId],
        );
        await client.query(
          `delete from user_card_action_events where user_id = $1::uuid`,
          [userId],
        );
        await client.query(
          `delete from user_card_status where user_id = $1::uuid`,
          [userId],
        );
        if (sessionId) {
          await client.query(
            `delete from training_session_members where session_id = $1::uuid`,
            [sessionId],
          );
          await client.query(
            `delete from training_sessions where id = $1::uuid`,
            [sessionId],
          );
        }
        if (listId) {
          await client.query(
            `delete from user_word_list_items where list_id = $1::uuid`,
            [listId],
          );
          await client.query(`delete from user_word_lists where id = $1::uuid`, [listId]);
        }
        await client.query(
          `alter table training_session_members
             enable trigger training_session_members_identity_immutable`,
        );
        await client.query(`delete from user_settings where user_id = $1::uuid`, [userId]);
        await client.query(`delete from auth.users where id = $1::uuid`, [userId]);
        if (entryIds.length > 0) {
          await client.query(`delete from word_entries where id = any($1::uuid[])`, [entryIds]);
        }
        if (privateDictionaryId) {
          await client.query(
            `delete from dictionary_entitlements where dictionary_id = $1::uuid`,
            [privateDictionaryId],
          );
          await client.query(`delete from dictionaries where id = $1::uuid`, [privateDictionaryId]);
        }
      });
    }
  });
});
