import { randomUUID } from "crypto";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import {
  ensureUserWithSettings,
  insertWord,
  runMigrations,
} from "./dbTestUtils";

const databaseUrl =
  process.env.FSRS_TEST_DB_URL ??
  process.env.SUPABASE_DB_URL ??
  process.env.DATABASE_URL;
const describeDb = databaseUrl ? describe : describe.skip;

async function committed<T>(
  pool: Pool,
  userId: string,
  fn: (client: PoolClient) => Promise<T>,
  role = "authenticated",
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(
      `select set_config('request.jwt.claim.sub', $1, true),
              set_config('request.jwt.claim.role', $2, true)`,
      [userId, role],
    );
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

describeDb("active Training run authority", () => {
  const pool = new Pool({ connectionString: databaseUrl });

  beforeAll(async () => {
    await runMigrations(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  test("supersedes an earlier queue before it can grade another card", async () => {
    const userId = randomUUID();
    const entryIds: string[] = [];
    let firstSessionId = "";
    let secondSessionId = "";

    try {
      await committed(pool, userId, async (client) => {
        await ensureUserWithSettings(client, userId, {
          daily_new_limit: 20,
          daily_review_limit: 20,
        });
        entryIds.push(await insertWord(client, `run-authority-a-${userId}`));
        entryIds.push(await insertWord(client, `run-authority-b-${userId}`));
      });

      const start = async (requestId: string) =>
        committed(pool, userId, async (client) => {
          const { rows } = await client.query(
            `select start_training_session(
               $1::uuid, array['word-to-definition']::text[],
               null, 'curated', 'new', '{}'::jsonb, '2', $2::uuid
             ) as session`,
            [userId, requestId],
          );
          return rows[0].session;
        });

      const firstRequestId = randomUUID();
      const first = await start(firstRequestId);
      firstSessionId = first.sessionId;
      expect(first).toEqual(
        expect.objectContaining({ runStatus: "active", sessionId: expect.any(String) }),
      );

      const retriedFirst = await start(firstRequestId);
      expect(retriedFirst).toEqual(
        expect.objectContaining({
          sessionId: firstSessionId,
          runStatus: "active",
          runGeneration: first.runGeneration,
        }),
      );
      const sessionsAfterRetry = await committed(pool, userId, async (client) => {
        const { rows } = await client.query(
          `select count(*) as sessions from training_sessions where user_id = $1::uuid`,
          [userId],
        );
        return rows[0].sessions;
      });
      expect(sessionsAfterRetry).toBe("1");

      const second = await start(randomUUID());
      secondSessionId = second.sessionId;
      expect(second).toEqual(
        expect.objectContaining({ runStatus: "active", sessionId: expect.any(String) }),
      );
      expect(secondSessionId).not.toBe(firstSessionId);

      const staleSnapshot = await committed(pool, userId, async (client) => {
        const { rows } = await client.query(
          `select get_training_session_snapshot($1::uuid, $2::uuid) as snapshot`,
          [userId, firstSessionId],
        );
        return rows[0].snapshot;
      });
      expect(staleSnapshot).toEqual(
        expect.objectContaining({ runStatus: "superseded" }),
      );

      const staleCard = await committed(pool, userId, async (client) => {
        const { rows } = await client.query(
          `select get_next_training_session_card(
             $1::uuid, $2::uuid, array[]::text[]
           ) as card`,
          [userId, firstSessionId],
        );
        return rows[0]?.card;
      });
      expect(staleCard).toBeUndefined();

      const currentCard = await committed(pool, userId, async (client) => {
        const { rows } = await client.query(
          `select get_next_training_session_card(
             $1::uuid, $2::uuid, array[]::text[]
           ) as card`,
          [userId, secondSessionId],
        );
        return rows[0]?.card;
      });
      expect(currentCard).toEqual(
        expect.objectContaining({ trainingSessionId: secondSessionId }),
      );

      await expect(
        committed(pool, userId, async (client) =>
          client.query(
            `select perform_platform_v2_card_action_as_principal(
               $1::uuid, 'start-learning', $2::uuid, $3::text, $4::text,
               null, null, null, $5::uuid, null, 'first_party', null, $6::uuid
             )`,
            [
              userId,
              currentCard.id,
              currentCard.mode,
              currentCard.stateRevision,
              randomUUID(),
              firstSessionId,
            ],
          ),
          "service_role",
        ),
      ).rejects.toThrow("training_session_superseded");

      const stateAfterRejectedOldGrade = await committed(pool, userId, async (client) => {
        const { rows } = await client.query(
          `select count(*) as events
             from user_card_action_events
            where user_id = $1::uuid`,
          [userId],
        );
        return rows[0].events;
      });
      expect(stateAfterRejectedOldGrade).toBe("0");
    } finally {
      await committed(pool, userId, async (client) => {
        await client.query(`delete from training_active_runs where user_id = $1::uuid`, [userId]);
        await client.query(`delete from training_run_start_receipts where user_id = $1::uuid`, [userId]);
        await client.query(
          `alter table training_session_members
             disable trigger training_session_members_identity_immutable`,
        );
        await client.query(`delete from training_session_members where session_id in ($1::uuid, $2::uuid)`, [
          firstSessionId || null,
          secondSessionId || null,
        ]);
        await client.query(`delete from training_sessions where id in ($1::uuid, $2::uuid)`, [
          firstSessionId || null,
          secondSessionId || null,
        ]);
        await client.query(`delete from user_card_action_events where user_id = $1::uuid`, [userId]);
        await client.query(`delete from user_card_status where user_id = $1::uuid`, [userId]);
        await client.query(`delete from user_settings where user_id = $1::uuid`, [userId]);
        await client.query(`delete from auth.users where id = $1::uuid`, [userId]);
        await client.query(`delete from word_entries where id = any($1::uuid[])`, [entryIds]);
        await client.query(
          `alter table training_session_members
             enable trigger training_session_members_identity_immutable`,
        );
      });
    }
  });
});
