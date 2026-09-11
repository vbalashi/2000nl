import { randomUUID } from "crypto";
import { Pool, PoolClient } from "pg";
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

type SessionCard = {
  id: string;
  mode: string;
  trainingSessionId: string;
  trainingSessionOrdinal: number;
};

type TraceRow = {
  ordinal: number;
  phase: "presented" | "accepted" | "resumed" | "duplicate";
  action?: "start-learning";
  entryKey: string;
  receiptStatus?: "accepted" | "duplicate";
  eventKey?: string;
  remaining?: number;
};

/**
 * Every operation gets its own committed transaction. This deliberately
 * models separate browser requests, so a passing trace proves that the
 * session and action boundaries survive a connection/request interruption.
 */
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

describeDb("learning queue simulation", () => {
  const pool = new Pool({ connectionString: databaseUrl });

  beforeAll(async () => {
    await runMigrations(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  test("traces a five-card interruption/resume through DB action boundaries", async () => {
    const userId = randomUUID();
    let sessionId = "";
    const entryIds: string[] = [];
    const entryKeys = new Map<string, string>();

    try {
      await withCommittedTransaction(pool, userId, async (client) => {
        await ensureUserWithSettings(client, userId, {
          daily_new_limit: 10,
          daily_review_limit: 10,
        });
        for (let index = 0; index < 5; index += 1) {
          entryIds.push(await insertWord(client, `simulation-${userId}-${index}`));
        }

        const { rows: startRows } = await client.query(
          `select start_training_session(
            $1::uuid,
            ARRAY['word-to-definition']::text[],
            NULL::uuid,
            'curated',
            'both',
            '{}'::jsonb,
            '5'
          ) as session`,
          [userId],
        );
        const session = startRows[0]?.session;
        expect(session).toEqual(
          expect.objectContaining({
            sessionSize: "5",
            plannedNew: 5,
            plannedReview: 0,
            plannedTotal: 5,
          }),
        );
        sessionId = session.sessionId as string;

        const { rows: snapshotRows } = await client.query(
          `select get_training_session_snapshot($1::uuid, $2::uuid) as snapshot`,
          [userId, sessionId],
        );
        const snapshot = snapshotRows[0]?.snapshot;
        expect(snapshot.members).toHaveLength(5);
        for (const member of snapshot.members as Array<{ entryId: string; ordinal: number }>) {
          entryKeys.set(member.entryId, `entry-${member.ordinal}`);
        }
      });

      expect(sessionId).not.toBe("");
      expect(entryIds).toHaveLength(5);

      const nextCard = async (): Promise<SessionCard | undefined> =>
        withCommittedTransaction(pool, userId, async (client) => {
          const { rows } = await client.query(
            `select get_next_training_session_card(
              $1::uuid, $2::uuid, ARRAY[]::text[]
            ) as card`,
            [userId, sessionId],
          );
          return rows[0]?.card as SessionCard | undefined;
        });

      const readCardState = async (entryId: string, mode: string) =>
        withCommittedTransaction(pool, userId, async (client) => {
          const { rows } = await client.query(
            `select to_jsonb(state) as state
               from get_platform_v2_card_states_for_entries(
                 $1::uuid, ARRAY[$2::uuid], ARRAY[$3::text]
               ) state`,
            [userId, entryId, mode],
          );
          return rows[0]?.state as
            | { state_revision?: string; in_learning?: boolean }
            | undefined;
        });

      const performLearn = async (
        card: SessionCard,
        clientEventId: string,
        stateRevision: string,
      ) =>
        withCommittedTransaction(
          pool,
          userId,
          (client) =>
            client
              .query(
                `select perform_platform_v2_card_action_as_principal(
                  $1::uuid, 'start-learning', $2::uuid, $3::text, $4::text,
                  null, null, null, $5::uuid, null, 'first_party', null, $6::uuid
                ) as result`,
                [
                  userId,
                  card.id,
                  card.mode,
                  stateRevision,
                  clientEventId,
                  sessionId,
                ],
              )
              .then(({ rows }) => rows[0]?.result),
          "service_role",
        );

      const trace: TraceRow[] = [];
      const first = await nextCard();
      expect(first).toEqual(
        expect.objectContaining({
          trainingSessionId: sessionId,
          trainingSessionOrdinal: 1,
        }),
      );
      if (!first) throw new Error("simulation did not return first session card");
      expect(first.mode).toBe("word-to-definition");
      expect(entryKeys.get(first.id)).toBe("entry-1");
      trace.push({
        ordinal: first.trainingSessionOrdinal,
        phase: "presented",
        entryKey: entryKeys.get(first.id) ?? "unknown",
      });

      const clientEventId = randomUUID();
      const firstState = await readCardState(first.id, first.mode);
      const firstRevision = firstState?.state_revision ?? "untracked";
      const accepted = await performLearn(first, clientEventId, firstRevision);
      expect(accepted).toEqual(
        expect.objectContaining({
          status: "accepted",
          actionId: "start-learning",
          eventId: expect.any(String),
        }),
      );
      expect((await readCardState(first.id, first.mode))?.in_learning).toBe(true);
      trace.push({
        ordinal: first.trainingSessionOrdinal,
        phase: "accepted",
        action: "start-learning",
        entryKey: entryKeys.get(first.id) ?? "unknown",
        receiptStatus: "accepted",
        eventKey: "event-1",
        remaining: 4,
      });

      const duplicate = await performLearn(first, clientEventId, firstRevision);
      expect(duplicate).toEqual(
        expect.objectContaining({ status: "duplicate", actionId: "start-learning" }),
      );
      trace.push({
        ordinal: first.trainingSessionOrdinal,
        phase: "duplicate",
        action: "start-learning",
        entryKey: entryKeys.get(first.id) ?? "unknown",
        receiptStatus: "duplicate",
        eventKey: "event-1",
      });

      // Simulate a browser interruption: the next selector runs on a fresh
      // transaction and must continue at the first unconsumed member.
      const resumed = await nextCard();
      expect(resumed).toEqual(
        expect.objectContaining({
          trainingSessionId: sessionId,
          trainingSessionOrdinal: 2,
        }),
      );
      if (!resumed) throw new Error("simulation did not resume at ordinal 2");
      expect(resumed.mode).toBe("word-to-definition");
      expect(entryKeys.get(resumed.id)).toBe("entry-2");
      trace.push({
        ordinal: resumed.trainingSessionOrdinal,
        phase: "resumed",
        entryKey: entryKeys.get(resumed.id) ?? "unknown",
        remaining: 4,
      });

      for (let ordinal = 2; ordinal <= 5; ordinal += 1) {
        const card = ordinal === 2 ? resumed : await nextCard();
        expect(card).toEqual(
          expect.objectContaining({
            trainingSessionId: sessionId,
            trainingSessionOrdinal: ordinal,
          }),
        );
        if (!card) throw new Error(`simulation did not return ordinal ${ordinal}`);
        expect(card.mode).toBe("word-to-definition");
        expect(entryKeys.get(card.id)).toBe(`entry-${ordinal}`);
        const eventId = randomUUID();
        const state = await readCardState(card.id, card.mode);
        const result = await performLearn(card, eventId, state?.state_revision ?? "untracked");
        expect(result).toEqual(
          expect.objectContaining({
            status: "accepted",
            actionId: "start-learning",
            eventId: expect.any(String),
          }),
        );
        expect((await readCardState(card.id, card.mode))?.in_learning).toBe(true);
        trace.push({
          ordinal,
          phase: "accepted",
          action: "start-learning",
          entryKey: entryKeys.get(card.id) ?? "unknown",
          receiptStatus: "accepted",
          eventKey: `event-${ordinal}`,
          remaining: 5 - ordinal,
        });
      }

      expect(await nextCard()).toBeUndefined();

      const durableRows = await withCommittedTransaction(pool, userId, async (client) => {
        const { rows } = await client.query(
          `select
             (select count(*) from user_card_action_events
               where user_id = $1 and action = 'start-learning') as action_events,
             (select count(*) from platform_v2_action_receipts
               where user_id = $1) as receipts,
             (select count(*) from user_review_log
               where user_id = $1) as review_rows,
             (select count(*) from training_session_members
               where session_id = $2 and consumed_at is not null) as consumed,
             (select completed_at from training_sessions where id = $2) as completed_at`,
          [userId, sessionId],
        );
        return rows;
      });
      expect(durableRows[0]).toEqual({
        action_events: "5",
        receipts: "5",
        // This first slice characterizes Learn enrollment. FSRS review rows
        // remain intentionally out of scope until grade/time simulations.
        review_rows: "0",
        consumed: "5",
        completed_at: expect.any(Date),
      });

      const historyRows = await withCommittedTransaction(pool, userId, async (client) => {
        const { rows } = await client.query(`select * from get_recent_training_review_history(50)`);
        return rows;
      });
      expect(historyRows).toHaveLength(5);
      expect(historyRows.every((row) => row.review_result === "learning_started")).toBe(true);

      const statsRows = await withCommittedTransaction(pool, userId, async (client) => {
        const { rows } = await client.query(
          `select get_detailed_training_stats(
            $1::uuid, ARRAY['word-to-definition']::text[], NULL::uuid, 'curated'
          ) as stats`,
          [userId],
        );
        return rows;
      });
      expect(statsRows[0]?.stats).toEqual(
        expect.objectContaining({
          newWordsToday: 5,
          newCardsToday: 5,
          learningStartedToday: 5,
        }),
      );

      // Normalize UUIDs to deterministic keys so this trace can be compared
      // in CI while retaining durable receipt/event markers for each step.
      expect(
        trace.map(({ ordinal, phase, action, entryKey, receiptStatus, eventKey, remaining }) => ({
          ordinal,
          phase,
          ...(action === undefined ? {} : { action }),
          entryKey,
          ...(receiptStatus === undefined ? {} : { receiptStatus }),
          ...(eventKey === undefined ? {} : { eventKey }),
          ...(remaining === undefined ? {} : { remaining }),
        })),
      ).toEqual([
        { ordinal: 1, phase: "presented", entryKey: "entry-1" },
        {
          ordinal: 1,
          phase: "accepted",
          action: "start-learning",
          entryKey: "entry-1",
          receiptStatus: "accepted",
          eventKey: "event-1",
          remaining: 4,
        },
        {
          ordinal: 1,
          phase: "duplicate",
          action: "start-learning",
          entryKey: "entry-1",
          receiptStatus: "duplicate",
          eventKey: "event-1",
        },
        { ordinal: 2, phase: "resumed", entryKey: "entry-2", remaining: 4 },
        {
          ordinal: 2,
          phase: "accepted",
          action: "start-learning",
          entryKey: "entry-2",
          receiptStatus: "accepted",
          eventKey: "event-2",
          remaining: 3,
        },
        {
          ordinal: 3,
          phase: "accepted",
          action: "start-learning",
          entryKey: "entry-3",
          receiptStatus: "accepted",
          eventKey: "event-3",
          remaining: 2,
        },
        {
          ordinal: 4,
          phase: "accepted",
          action: "start-learning",
          entryKey: "entry-4",
          receiptStatus: "accepted",
          eventKey: "event-4",
          remaining: 1,
        },
        {
          ordinal: 5,
          phase: "accepted",
          action: "start-learning",
          entryKey: "entry-5",
          receiptStatus: "accepted",
          eventKey: "event-5",
          remaining: 0,
        },
      ]);
    } finally {
      // Cleanup is a separate committed transaction as well, so a failed
      // assertion cannot leave a fixture that contaminates later simulations.
      await withCommittedTransaction(pool, userId, async (client) => {
        // Latched membership is intentionally immutable in production. The
        // disposable fixture must still be removable, so suppress only that
        // user trigger during this explicit teardown transaction. Referential
        // integrity triggers stay enabled throughout cleanup.
        await client.query(
          `alter table training_session_members
             disable trigger training_session_members_identity_immutable`,
        );
        await client.query(
          `delete from platform_v2_action_receipts where user_id = $1::uuid`,
          [userId],
        );
        await client.query(
          `delete from user_card_known_marks where user_id = $1::uuid`,
          [userId],
        );
        await client.query(
          `delete from user_card_action_events where user_id = $1::uuid`,
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
        if (entryIds.length > 0) {
          await client.query(`delete from word_entries where id = any($1::uuid[])`, [entryIds]);
        }
      });
    }
  });
});
