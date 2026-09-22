import { randomUUID } from "crypto";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import {
  ensureUserWithSettings,
  getDbUrl,
  insertWord,
  runMigrations,
  withTransaction,
} from "./dbTestUtils";

const databaseUrl = getDbUrl();
const describeDb = databaseUrl ? describe : describe.skip;
const modes = "ARRAY['word-to-definition']::text[]";

async function addDueReview(client: PoolClient, userId: string, entryId: string) {
  await client.query(
    `insert into user_card_status (
       user_id, entry_id, card_type_id, fsrs_stability, fsrs_difficulty,
       fsrs_reps, fsrs_lapses, fsrs_last_interval, fsrs_last_grade,
       fsrs_enabled, next_review_at, last_seen_at
     ) values ($1, $2, 'word-to-definition', 2, 5, 2, 0, 2, 3, true,
               now() - interval '1 day', now())`,
    [userId, entryId],
  );
}

describeDb("per-session ordinary Training rhythm", () => {
  const pool = new Pool({ connectionString: databaseUrl });

  beforeAll(async () => {
    await runMigrations(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  test("previews and latches every mixed stop independently of global settings", async () => {
    const userId = randomUUID();
    await withTransaction(pool, async (client) => {
      await ensureUserWithSettings(client, userId, { new_review_ratio: 5 });
      for (let index = 0; index < 12; index += 1) {
        await insertWord(client, `ratio-new-${userId}-${index}`);
        await addDueReview(
          client,
          userId,
          await insertWord(client, `ratio-review-${userId}-${index}`),
        );
      }

      for (const [ratio, expected] of [
        [1, ["new", "review", "new", "review", "new", "review"]],
        [2, ["new", "review", "review", "new", "review", "review"]],
        [3, ["new", "review", "review", "review", "new", "review"]],
        [4, ["new", "review", "review", "review", "review", "new"]],
        [5, ["new", "review", "review", "review", "review", "review"]],
      ] as const) {
        const { rows: planRows } = await client.query(
          `select get_training_session_plan(
             p_user_id => $1::uuid,
             p_card_type_ids => ${modes},
             p_list_id => NULL::uuid,
             p_list_type => 'curated',
             p_card_filter => 'both',
             p_training_filter => '{}'::jsonb,
             p_session_size => '6',
             p_new_review_ratio => $2::integer
           ) as plan`,
          [userId, ratio],
        );
        const { rows: startRows } = await client.query(
          `select start_training_session(
             p_user_id => $1::uuid,
             p_card_type_ids => ${modes},
             p_list_id => NULL::uuid,
             p_list_type => 'curated',
             p_card_filter => 'both',
             p_training_filter => '{}'::jsonb,
             p_session_size => '6',
             p_request_id => $2::uuid,
             p_new_review_ratio => $3::integer
           ) as session`,
          [userId, randomUUID(), ratio],
        );
        const sessionId = startRows[0].session.sessionId as string;
        const { rows: memberRows } = await client.query(
          `select member.queue_source
             from training_session_members member
            where member.session_id = $1
            order by member.ordinal`,
          [sessionId],
        );
        const { rows: latchRows } = await client.query(
          `select new_review_ratio from training_sessions where id = $1`,
          [sessionId],
        );
        expect(memberRows.map((row) => row.queue_source)).toEqual(expected);
        expect(latchRows[0].new_review_ratio).toBe(ratio);
        expect(planRows[0].plan).toEqual(expect.objectContaining({
          plannedNew: startRows[0].session.plannedNew,
          plannedReview: startRows[0].session.plannedReview,
          plannedTotal: 6,
        }));
      }
    }, userId);
  });

  test("uses cardFilter for the slider endpoints and rejects invalid mixed ratios", async () => {
    const userId = randomUUID();
    await withTransaction(pool, async (client) => {
      await ensureUserWithSettings(client, userId);
      await insertWord(client, `ratio-endpoint-new-${userId}`);
      await addDueReview(
        client,
        userId,
        await insertWord(client, `ratio-endpoint-review-${userId}`),
      );

      for (const [filter, source] of [
        ["new", "new"],
        ["review", "review"],
      ] as const) {
        const { rows } = await client.query(
          `select start_training_session(
             $1::uuid, ${modes}, NULL::uuid, 'curated', $2::text,
             '{}'::jsonb, '2', $3::uuid, NULL::integer
           ) as session`,
          [userId, filter, randomUUID()],
        );
        const { rows: members } = await client.query(
          `select queue_source from training_session_members
            where session_id = $1 order by ordinal`,
          [rows[0].session.sessionId],
        );
        expect(members.map((row) => row.queue_source)).toEqual([source]);
      }

      for (const ratio of [null, -1, 0, 6]) {
        await client.query("savepoint invalid_ratio");
        await expect(client.query(
          `select start_training_session(
             $1::uuid, ${modes}, NULL::uuid, 'curated', 'both',
             '{}'::jsonb, '2', $2::uuid, $3::integer
           )`,
          [userId, randomUUID(), ratio],
        )).rejects.toThrow("invalid new/review ratio");
        await client.query("rollback to savepoint invalid_ratio");
      }
    }, userId);
  });

  test("includes the selected ratio in start idempotency", async () => {
    const userId = randomUUID();
    await withTransaction(pool, async (client) => {
      await ensureUserWithSettings(client, userId, { new_review_ratio: 5 });
      await insertWord(client, `ratio-retry-${userId}`);
      const requestId = randomUUID();
      const start = (ratio: number) => client.query(
        `select start_training_session(
           $1::uuid, ${modes}, NULL::uuid, 'curated', 'both',
           '{}'::jsonb, '1', $2::uuid, $3::integer
         ) as session`,
        [userId, requestId, ratio],
      );
      const first = await start(1);
      const retry = await start(1);
      expect(retry.rows[0].session.sessionId).toBe(first.rows[0].session.sessionId);
      await client.query("savepoint changed_ratio");
      await expect(start(3)).rejects.toThrow("training_run_start_idempotency_conflict");
      await client.query("rollback to savepoint changed_ratio");
      const { rows } = await client.query(
        `select count(*)::integer as receipts
           from training_run_start_receipts
          where user_id = $1 and request_id = $2`,
        [userId, requestId],
      );
      expect(rows[0].receipts).toBe(1);
    }, userId);
  });

  test("uses the session latch rather than changed settings for unavailable replacement", async () => {
    const userId = randomUUID();
    await withTransaction(pool, async (client) => {
      await ensureUserWithSettings(client, userId, { new_review_ratio: 2 });
      const completedIds = [
        await insertWord(client, `ratio-completed-a-${userId}`),
        await insertWord(client, `ratio-completed-b-${userId}`),
      ];
      await insertWord(client, `ratio-replacement-new-${userId}`);
      await addDueReview(
        client,
        userId,
        await insertWord(client, `ratio-replacement-review-${userId}`),
      );
      const { rows: dictionaries } = await client.query(
        `insert into dictionaries (
           language_code, slug, name, kind, visibility, owner_user_id,
           minimum_subscription_tier, schema_key, schema_version
         ) values (
           'nl', $1, 'Ratio unavailable fixture', 'curated', 'private', null,
           'free', 'nl-vandale-v1', 1
         ) returning id`,
        [`ratio-unavailable-${userId}`],
      );
      const dictionaryId = dictionaries[0].id as string;
      await client.query(
        `insert into dictionary_entitlements (
           dictionary_id, subject_type, subject_key, permission
         ) values ($1, 'user', $2, 'read')`,
        [dictionaryId, userId],
      );
      const { rows: invalidEntries } = await client.query(
        `insert into word_entries (
           dictionary_id, language_code, headword, part_of_speech,
           is_nt2_2000, raw
         ) values ($1, 'nl', $2, 'noun', true, '{}'::jsonb)
         returning id`,
        [dictionaryId, `ratio-invalid-${userId}`],
      );
      const invalidId = invalidEntries[0].id as string;
      const { rows: sessions } = await client.query(
        `insert into training_sessions (
           user_id, session_size, card_type_ids, list_type, card_filter,
           training_filter, requested_total, planned_new, planned_total,
           new_review_ratio
         ) values (
           $1, '4', ${modes}, 'curated', 'both', '{}'::jsonb, 4, 3, 3, 1
         ) returning id`,
        [userId],
      );
      const sessionId = sessions[0].id as string;
      await client.query(
        `insert into training_session_members (
           session_id, ordinal, entry_id, card_type_id, queue_source,
           consumed_at
         ) values
           ($1, 1, $2, 'word-to-definition', 'new', now()),
           ($1, 2, $3, 'word-to-definition', 'new', now()),
           ($1, 3, $4, 'word-to-definition', 'new', null)`,
        [sessionId, ...completedIds, invalidId],
      );
      await client.query(
        `update user_settings set new_review_ratio = 5 where user_id = $1`,
        [userId],
      );
      const { rows: unavailable } = await client.query(
        `select mark_training_session_member_unavailable(
           $1::uuid, $2::uuid, $3::uuid, 'word-to-definition', 'model-invalid'
         ) as result`,
        [userId, sessionId, invalidId],
      );
      expect(unavailable[0].result).toEqual(
        expect.objectContaining({ status: "unavailable-replaced", replacementOrdinal: 4 }),
      );
      const { rows: replacement } = await client.query(
        `select queue_source from training_session_members
          where session_id = $1 and ordinal = 4`,
        [sessionId],
      );
      expect(replacement[0].queue_source).toBe("new");
    }, userId);
  });
});
