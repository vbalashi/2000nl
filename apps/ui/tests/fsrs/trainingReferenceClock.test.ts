import { randomUUID } from "crypto";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import {
  ensureUserWithSettings,
  insertWord,
  runMigrations,
  withTransaction,
} from "./dbTestUtils";

const databaseUrl =
  process.env.FSRS_TEST_DB_URL ??
  process.env.SUPABASE_DB_URL ??
  process.env.DATABASE_URL;
const describeDb = databaseUrl ? describe : describe.skip;

async function withCommittedReferenceTransaction<T>(
  pool: Pool,
  userId: string,
  referenceNow: string,
  fn: (client: PoolClient) => Promise<T>,
  jwtRole = "authenticated",
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `select set_config('request.jwt.claim.sub', $1, true),
              set_config('request.jwt.claim.role', $2, true),
              set_config('training.test_reference_now', $3, true)`,
      [userId, jwtRole, referenceNow],
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

describeDb("training reference clock seam", () => {
  const pool = new Pool({ connectionString: databaseUrl });

  beforeAll(async () => {
    await runMigrations(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  test("uses the transaction-local instant and rejects malformed overrides", async () => {
    await withTransaction(pool, async (client) => {
      const referenceNow = "2026-03-29T01:02:03.456Z";
      await client.query(
        `select set_config('training.test_reference_now', $1, true)`,
        [referenceNow],
      );

      const { rows } = await client.query(
        `select private.training_reference_now_v1() as reference_now`,
      );
      expect(new Date(rows[0].reference_now).toISOString()).toBe(referenceNow);

      await client.query(
        `select set_config('training.test_reference_now', 'not-a-timestamp', true)`,
      );
      await expect(
        client.query(`select private.training_reference_now_v1()`),
      ).rejects.toThrow("invalid training.test_reference_now");
    });
  });

  test("drives FSRS same-day classification at an exact boundary", async () => {
    await withTransaction(pool, async (client) => {
      const compute = async (referenceNow: string, lastReviewAt: string) => {
        await client.query(
          `select set_config('training.test_reference_now', $1, true)`,
          [referenceNow],
        );
        const { rows } = await client.query(
          `select fsrs6_compute(
             2.0, 5.0, $1::timestamptz, 3::smallint, 0.9, 1, 0,
             fsrs6_parameters()
           ) as result`,
          [lastReviewAt],
        );
        return rows[0].result as { same_day: boolean; elapsed: number };
      };

      await expect(
        compute("2026-03-29T00:00:00Z", "2026-03-28T23:59:59Z"),
      ).resolves.toMatchObject({ same_day: false });
      await expect(
        compute("2026-03-29T00:00:00Z", "2026-03-29T00:00:00Z"),
      ).resolves.toMatchObject({ same_day: true, elapsed: 0 });
    });
  });

  test("drives the real selector across a just-before/at due boundary", async () => {
    const userId = randomUUID();
    await withTransaction(pool, async (client) => {
      await ensureUserWithSettings(client, userId, {
        daily_new_limit: 10,
        daily_review_limit: 10,
      });
      const entryId = await insertWord(client, `clock-seam-${userId}`);
      const { rows: listRows } = await client.query(
        `insert into user_word_lists (
           user_id, language_code, primary_language_code, name
         ) values ($1, 'nl', 'nl', $2)
         returning id`,
        [userId, `Clock seam ${userId}`],
      );
      const listId = listRows[0].id as string;
      await client.query(
        `insert into user_word_list_items (list_id, word_id)
         values ($1, $2)`,
        [listId, entryId],
      );
      await client.query(
        `insert into user_card_status (
           user_id, entry_id, card_type_id, fsrs_enabled,
           fsrs_stability, fsrs_difficulty, fsrs_reps, fsrs_lapses,
           fsrs_last_interval, next_review_at, last_reviewed_at
         ) values (
           $1, $2, 'word-to-definition', true,
           2.0, 5.0, 1, 0, 2.0, $3::timestamptz, $4::timestamptz
         )`,
        [
          userId,
          entryId,
          "2026-03-29T00:00:00Z",
          "2026-03-27T00:00:00Z",
        ],
      );

      const selectDue = async (referenceNow: string) => {
        await client.query(
          `select set_config('training.test_reference_now', $1, true)`,
          [referenceNow],
        );
        const { rows } = await client.query(
           `select entry_id, queue_source
             from private.training_scheduler_candidates_v2(
               $1, ARRAY['word-to-definition']::text[], $2::uuid,
               'user', 'both', 'auto', ARRAY[]::uuid[], ARRAY[]::text[],
               '{}'::jsonb, false, true
             )
             where queue_source = 'review'`,
          [userId, listId],
        );
        return rows;
      };

      await expect(
        selectDue("2026-03-28T23:59:59Z"),
      ).resolves.toEqual([]);
      await expect(
        selectDue("2026-03-29T00:00:00Z"),
      ).resolves.toEqual([
        expect.objectContaining({ entry_id: entryId, queue_source: "review" }),
      ]);
    }, userId);
  });

  test("uses one reference instant for session expiry and accepted action lifecycle", async () => {
    const userId = randomUUID();
    let sessionId = "";
    let entryId = "";
    let clientEventId = "";
    const sessionStartedAt = "2026-03-29T01:02:03.456Z";
    const actionAcceptedAt = "2026-03-29T12:00:00.789Z";
    const sessionExpiresAt = "2026-03-30T01:02:03.456Z";

    try {
      const session = await withCommittedReferenceTransaction(
        pool,
        userId,
        sessionStartedAt,
        async (client) => {
          await ensureUserWithSettings(client, userId, {
            daily_new_limit: 10,
            daily_review_limit: 10,
          });
          entryId = await insertWord(client, `lifecycle-clock-${userId}`);
          const { rows } = await client.query(
            `select start_training_session(
              $1::uuid, ARRAY['word-to-definition']::text[], NULL::uuid,
              'curated', 'new', '{}'::jsonb, '1'
            ) as session`,
            [userId],
          );
          return rows[0]?.session as {
            sessionId: string;
            plannedTotal: number;
            plannedAt: string;
          };
        },
      );
      sessionId = session.sessionId;
      expect(session).toEqual(
        expect.objectContaining({
          sessionId,
          plannedTotal: 1,
        }),
      );
      expect(new Date(session.plannedAt).toISOString()).toBe(sessionStartedAt);

      const sessionTimes = await withCommittedReferenceTransaction(
        pool,
        userId,
        sessionStartedAt,
        async (client) => {
          const { rows } = await client.query(
            `select created_at, expires_at
               from training_sessions
              where id = $1::uuid`,
            [sessionId],
          );
          return rows[0];
        },
      );
      expect(sessionTimes.created_at.toISOString()).toBe(sessionStartedAt);
      expect(sessionTimes.expires_at.toISOString()).toBe(sessionExpiresAt);

      const nextCard = await withCommittedReferenceTransaction(
        pool,
        userId,
        actionAcceptedAt,
        async (client) => {
          const { rows } = await client.query(
            `select get_next_training_session_card(
              $1::uuid, $2::uuid, ARRAY[]::text[]
            ) as card`,
            [userId, sessionId],
          );
          return rows[0]?.card as {
            id: string;
            mode: string;
          };
        },
      );
      expect(nextCard).toEqual(
        expect.objectContaining({ id: entryId, mode: "word-to-definition" }),
      );

      const stateRevision = await withCommittedReferenceTransaction(
        pool,
        userId,
        actionAcceptedAt,
        async (client) => {
          const { rows } = await client.query(
            `select state_revision
               from get_platform_v2_card_states_for_entries(
                 $1::uuid, ARRAY[$2::uuid], ARRAY[$3::text]
               )`,
            [userId, entryId, "word-to-definition"],
          );
          return rows[0]?.state_revision as string;
        },
      );
      clientEventId = randomUUID();
      const action = await withCommittedReferenceTransaction(
        pool,
        userId,
        actionAcceptedAt,
        async (client) => {
          const { rows } = await client.query(
            `select perform_platform_v2_card_action_as_principal(
              $1::uuid, 'start-learning', $2::uuid, $3::text, $4::text,
              null, null, null, $5::uuid, null, 'first_party', null, $6::uuid
            ) as result`,
            [
              userId,
              nextCard.id,
              nextCard.mode,
              stateRevision,
              clientEventId,
              sessionId,
            ],
          );
          return rows[0]?.result as { eventId: string; status: string };
        },
        "service_role",
      );
      expect(action).toEqual(
        expect.objectContaining({ status: "accepted", eventId: expect.any(String) }),
      );

      const lifecycleTimes = await withCommittedReferenceTransaction(
        pool,
        userId,
        actionAcceptedAt,
        async (client) => {
          const { rows } = await client.query(
            `select
               session.completed_at,
               member.consumed_at,
               binding.created_at as binding_created_at,
               event.created_at as event_created_at,
               receipt.created_at as receipt_created_at,
               status.last_seen_at
             from training_sessions session
             join training_session_members member
               on member.session_id = session.id
             join training_session_action_bindings binding
               on binding.session_id = session.id
             join user_card_action_events event
               on event.id = $2::uuid
             join platform_v2_action_receipts receipt
               on receipt.client_event_id = binding.client_event_id
             join user_card_status status
               on status.user_id = session.user_id
              and status.entry_id = member.entry_id
              and status.card_type_id = member.card_type_id
            where session.id = $1::uuid
              and binding.client_event_id = $3::uuid`,
            [sessionId, action.eventId, clientEventId],
          );
          return rows[0];
        },
      );
      for (const column of [
        "completed_at",
        "consumed_at",
        "binding_created_at",
        "event_created_at",
        "receipt_created_at",
        "last_seen_at",
      ]) {
        expect(lifecycleTimes[column].toISOString()).toBe(actionAcceptedAt);
      }

      const expired = await withCommittedReferenceTransaction(
        pool,
        userId,
        sessionExpiresAt,
        async (client) => {
          const { rows } = await client.query(
            `select get_next_training_session_card(
              $1::uuid, $2::uuid, ARRAY[]::text[]
            ) as card`,
            [userId, sessionId],
          );
          return rows[0]?.card;
        },
      );
      expect(expired).toBeUndefined();
    } finally {
      await withCommittedReferenceTransaction(
        pool,
        userId,
        actionAcceptedAt,
        async (client) => {
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
            `delete from training_run_start_receipts where user_id = $1::uuid`,
            [userId],
          );
          if (sessionId) {
            await client.query(
              `delete from training_session_members where session_id = $1::uuid`,
              [sessionId],
            );
            await client.query(`delete from training_sessions where id = $1::uuid`, [sessionId]);
          }
          await client.query(
            `alter table training_session_members
               enable trigger training_session_members_identity_immutable`,
          );
          await client.query(`delete from user_settings where user_id = $1::uuid`, [userId]);
          await client.query(`delete from auth.users where id = $1::uuid`, [userId]);
          if (entryId) {
            await client.query(`delete from word_entries where id = $1::uuid`, [entryId]);
          }
        },
      );
    }
  });
});
