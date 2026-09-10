import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import {
  ensureUserWithSettings,
  getDbUrl,
  insertWord,
  runMigrations,
  withTransaction,
} from "./dbTestUtils";

const dbUrl = getDbUrl();
const describeIfDb = dbUrl ? describe : describe.skip;

describeIfDb("Platform V2 Details action RPC", () => {
  const pool = new Pool({ connectionString: dbUrl });
  const cardTypeId = "word-to-definition";

  beforeAll(async () => {
    await runMigrations(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  test("freezes and hides without creating FSRS reviews, and duplicate is safe", async () => {
    const userId = randomUUID();
    const freezeEventId = randomUUID();
    const hideEventId = randomUUID();

    await withTransaction(pool, async (client) => {
      await ensureUserWithSettings(client, userId);
      const freezeEntryId = await insertWord(client, `details-freeze-${Date.now()}`);
      const hideEntryId = await insertWord(client, `details-hide-${Date.now()}`);

      const freeze = await client.query(
        `select perform_platform_v2_details_action(
           $1::uuid, 'freeze-card', $2::uuid, $3::text, 'untracked',
           $4::uuid, null, 'first_party', null
         ) as result`,
        [userId, freezeEntryId, cardTypeId, freezeEventId],
      );
      expect(freeze.rows[0].result).toEqual(
        expect.objectContaining({
          status: "accepted",
          actionId: "freeze-card",
          clientEventId: freezeEventId,
          card: expect.objectContaining({
            scheduler: expect.objectContaining({ phase: "frozen" }),
          }),
        }),
      );

      const duplicate = await client.query(
        `select perform_platform_v2_details_action(
           $1::uuid, 'freeze-card', $2::uuid, $3::text, 'untracked',
           $4::uuid, jsonb_build_object('contractVersion', 'source-context-v2', 'diagnostics', jsonb_build_object('latencyMs', 999)), 'first_party', null
         ) as result`,
        [userId, freezeEntryId, cardTypeId, freezeEventId],
      );
      expect(duplicate.rows[0].result).toEqual(
        expect.objectContaining({ status: "duplicate", actionId: "freeze-card" }),
      );

      const hide = await client.query(
        `select perform_platform_v2_details_action(
           $1::uuid, 'hide-card', $2::uuid, $3::text, 'untracked',
           $4::uuid, null, 'first_party', null
         ) as result`,
        [userId, hideEntryId, cardTypeId, hideEventId],
      );
      expect(hide.rows[0].result).toEqual(
        expect.objectContaining({
          status: "accepted",
          actionId: "hide-card",
          card: expect.objectContaining({
            scheduler: expect.objectContaining({ phase: "hidden" }),
          }),
        }),
      );

      const reviewLog = await client.query(
        `select count(*)::int as count
           from user_review_log
          where user_id = $1 and word_id in ($2, $3) and mode = $4`,
        [userId, freezeEntryId, hideEntryId, cardTypeId],
      );
      expect(reviewLog.rows[0].count).toBe(0);

      const events = await client.query(
        `select action, auth_kind, connected_client_id from user_card_action_events
          where user_id = $1 and entry_id in ($2, $3)
          order by created_at`,
        [userId, freezeEntryId, hideEntryId],
      );
      expect(events.rows).toEqual([
        { action: "freeze-card", auth_kind: "first_party", connected_client_id: null },
        { action: "hide-card", auth_kind: "first_party", connected_client_id: null },
      ]);

      const receipt = await client.query(
        `select request_projection->>'actionId' as action_id
           from platform_v2_action_receipts
          where user_id = $1 and client_event_id = $2`,
        [userId, freezeEventId],
      );
      expect(receipt.rows).toEqual([{ action_id: "freeze-card" }]);
    }, userId);
  });
});
