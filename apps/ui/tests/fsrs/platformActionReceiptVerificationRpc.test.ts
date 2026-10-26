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

describeIfDb("Platform V2 action receipt verification RPC", () => {
  const pool = new Pool({ connectionString: dbUrl });
  const cardTypeId = "word-to-definition";

  async function resolveInFlightAction(disposition: "commit" | "rollback") {
    const userId = randomUUID();
    const clientEventId = randomUUID();
    const setup = await pool.connect();
    const action = await pool.connect();
    const verifier = await pool.connect();
    let entryId: string | undefined;

    try {
      await setup.query("begin");
      await ensureUserWithSettings(setup, userId);
      entryId = await insertWord(
        setup,
        `platform-action-receipt-in-flight-${disposition}-${Date.now()}`,
      );
      await setup.query("commit");

      await action.query("begin");
      await action.query(
        "select set_config('request.jwt.claim.sub', $1, true)",
        [userId],
      );
      await action.query(
        `select perform_platform_v2_card_action(
           $1::uuid, 'mark-known', $2::uuid, $3::text, 'untracked',
           null, null, null, $4::uuid, null, 'first_party', null
         )`,
        [userId, entryId, cardTypeId, clientEventId],
      );

      await verifier.query("begin");
      await verifier.query(
        "select set_config('request.jwt.claim.role', 'service_role', true)",
      );
      await verifier.query("set local role service_role");
      await verifier.query("set local statement_timeout = '2s'");
      let verificationSettled = false;
      const verification = verifier
        .query(
          `select verify_platform_v2_action_receipt_as_principal(
             $1::uuid, $2::jsonb
           ) as result`,
          [
            userId,
            JSON.stringify({
              contractVersion: "platform-action-report-verification-v1",
              entryId,
              cardTypeId,
              stateRevision: "untracked",
              actionId: "mark-known",
              clientEventId,
              reviewResult: null,
              activeKnownMarkId: null,
              knownMarkRevision: null,
            }),
          ],
        )
        .then((result) => {
          verificationSettled = true;
          return result;
        });

      await new Promise((resolve) => setTimeout(resolve, 50));
      const settledBeforeDisposition = verificationSettled;
      await action.query(disposition);
      const verified = await verification;
      await verifier.query("rollback");

      return {
        settledBeforeDisposition,
        verified: verified.rows[0].result as boolean,
      };
    } finally {
      await action.query("rollback").catch(() => undefined);
      await verifier.query("rollback").catch(() => undefined);
      action.release();
      verifier.release();
      setup.release();
      await pool.query("delete from auth.users where id = $1", [userId]);
      if (entryId) {
        await pool.query("delete from word_entries where id = $1", [entryId]);
      }
    }
  }

  beforeAll(async () => {
    await runMigrations(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  test("verifies the exact original action after the card state changes", async () => {
    const userId = randomUUID();
    const startEventId = randomUUID();
    const reviewEventId = randomUUID();

    await withTransaction(
      pool,
      async (client) => {
        await ensureUserWithSettings(client, userId);
        const entryId = await insertWord(
          client,
          `platform-action-receipt-delayed-${Date.now()}`,
        );

        const started = await client.query(
          `select perform_platform_v2_card_action(
             $1::uuid, 'start-learning', $2::uuid, $3::text, 'untracked',
             null, null, null, $4::uuid, null, 'first_party', null
           ) as result`,
          [userId, entryId, cardTypeId, startEventId],
        );
        const startedStateRevision = started.rows[0].result.card.stateRevision;

        await client.query(
          `select perform_platform_v2_card_action(
             $1::uuid, 'review-card', $2::uuid, $3::text, $4::text,
             null, null, 'success', $5::uuid, null, 'first_party', null
           )`,
          [
            userId,
            entryId,
            cardTypeId,
            startedStateRevision,
            reviewEventId,
          ],
        );

        await client.query(
          "select set_config('request.jwt.claim.role', 'service_role', true)",
        );
        await client.query("set local role service_role");
        const verified = await client.query(
          `select verify_platform_v2_action_receipt_as_principal(
             $1::uuid,
             jsonb_build_object(
               'contractVersion', 'platform-action-report-verification-v1',
               'entryId', $2::uuid,
               'cardTypeId', $3::text,
               'stateRevision', 'untracked',
               'actionId', 'start-learning',
               'clientEventId', $4::uuid,
               'reviewResult', null,
               'activeKnownMarkId', null,
               'knownMarkRevision', null
             )
           ) as started,
           verify_platform_v2_action_receipt_as_principal(
             $1::uuid,
             jsonb_build_object(
               'contractVersion', 'platform-action-report-verification-v1',
               'entryId', $2::uuid,
               'cardTypeId', $3::text,
               'stateRevision', $5::text,
               'actionId', 'review-card',
               'clientEventId', $6::uuid,
               'reviewResult', 'success',
               'activeKnownMarkId', null,
               'knownMarkRevision', null
             )
           ) as reviewed`,
          [
            userId,
            entryId,
            cardTypeId,
            startEventId,
            startedStateRevision,
            reviewEventId,
          ],
        );

        expect(verified.rows[0]).toEqual({ started: true, reviewed: true });
      },
      userId,
    );
  });

  test("keeps one exact projection for a duplicate and fails closed on drift or an unknown receipt", async () => {
    const userId = randomUUID();
    const clientEventId = randomUUID();

    await withTransaction(
      pool,
      async (client) => {
        await ensureUserWithSettings(client, userId);
        const entryId = await insertWord(
          client,
          `platform-action-receipt-duplicate-${Date.now()}`,
        );
        const parameters = [userId, entryId, cardTypeId, clientEventId];
        const actionSql = `select perform_platform_v2_card_action(
          $1::uuid, 'mark-known', $2::uuid, $3::text, 'untracked',
          null, null, null, $4::uuid, null, 'first_party', null
        ) as result`;

        const accepted = await client.query(actionSql, parameters);
        const duplicate = await client.query(actionSql, parameters);
        expect(accepted.rows[0].result.status).toBe("accepted");
        expect(duplicate.rows[0].result.status).toBe("duplicate");

        const projection = {
          contractVersion: "platform-action-report-verification-v1",
          entryId,
          cardTypeId,
          stateRevision: "untracked",
          actionId: "mark-known",
          clientEventId,
          reviewResult: null,
          activeKnownMarkId: null,
          knownMarkRevision: null,
        };

        await client.query(
          "select set_config('request.jwt.claim.role', 'service_role', true)",
        );
        await client.query("set local role service_role");
        const verified = await client.query(
          `select verify_platform_v2_action_receipt_as_principal(
             $1::uuid, $2::jsonb
           ) as exact,
           verify_platform_v2_action_receipt_as_principal(
             $1::uuid, $3::jsonb
           ) as drifted,
           verify_platform_v2_action_receipt_as_principal(
             $1::uuid, $4::jsonb
           ) as unknown,
           verify_platform_v2_action_receipt_as_principal(
             $1::uuid, $5::jsonb
           ) as extra_field,
           verify_platform_v2_action_receipt_as_principal(
             $6::uuid, $2::jsonb
           ) as wrong_principal`,
          [
            userId,
            JSON.stringify(projection),
            JSON.stringify({ ...projection, stateRevision: randomUUID() }),
            JSON.stringify({ ...projection, clientEventId: randomUUID() }),
            JSON.stringify({ ...projection, unexpected: "not-closed" }),
            randomUUID(),
          ],
        );

        expect(verified.rows[0]).toEqual({
          exact: true,
          drifted: false,
          unknown: false,
          extra_field: false,
          wrong_principal: false,
        });
      },
      userId,
    );
  });

  test("binds Undo Known to the original mark identity and revision", async () => {
    const userId = randomUUID();

    await withTransaction(
      pool,
      async (client) => {
        await ensureUserWithSettings(client, userId);
        const entryId = await insertWord(
          client,
          `platform-action-receipt-undo-${Date.now()}`,
        );
        const marked = await client.query(
          `select perform_platform_v2_card_action(
             $1::uuid, 'mark-known', $2::uuid, $3::text, 'untracked',
             null, null, null, $4::uuid, null, 'first_party', null
           ) as result`,
          [userId, entryId, cardTypeId, randomUUID()],
        );
        const markedCard = marked.rows[0].result.card;
        const undoEventId = randomUUID();

        await client.query(
          `select perform_platform_v2_card_action(
             $1::uuid, 'undo-known', $2::uuid, $3::text, $4::text,
             $5::uuid, $6::text, null, $7::uuid, null, 'first_party', null
           )`,
          [
            userId,
            entryId,
            cardTypeId,
            markedCard.stateRevision,
            markedCard.knownMark.markId,
            markedCard.knownMark.revision,
            undoEventId,
          ],
        );
        const projection = {
          contractVersion: "platform-action-report-verification-v1",
          entryId,
          cardTypeId,
          stateRevision: markedCard.stateRevision,
          actionId: "undo-known",
          clientEventId: undoEventId,
          reviewResult: null,
          activeKnownMarkId: markedCard.knownMark.markId,
          knownMarkRevision: markedCard.knownMark.revision,
        };

        await client.query(
          "select set_config('request.jwt.claim.role', 'service_role', true)",
        );
        await client.query("set local role service_role");
        const verified = await client.query(
          `select verify_platform_v2_action_receipt_as_principal(
             $1::uuid, $2::jsonb
           ) as exact,
           verify_platform_v2_action_receipt_as_principal(
             $1::uuid, $3::jsonb
           ) as wrong_mark,
           verify_platform_v2_action_receipt_as_principal(
             $1::uuid, $4::jsonb
           ) as wrong_revision`,
          [
            userId,
            JSON.stringify(projection),
            JSON.stringify({
              ...projection,
              activeKnownMarkId: randomUUID(),
            }),
            JSON.stringify({
              ...projection,
              knownMarkRevision: randomUUID(),
            }),
          ],
        );

        expect(verified.rows[0]).toEqual({
          exact: true,
          wrong_mark: false,
          wrong_revision: false,
        });
      },
      userId,
    );
  });

  test("fails closed for a pre-migration receipt without a stored projection", async () => {
    const userId = randomUUID();
    const clientEventId = randomUUID();

    await withTransaction(
      pool,
      async (client) => {
        await ensureUserWithSettings(client, userId);
        const entryId = await insertWord(
          client,
          `platform-action-receipt-historical-${Date.now()}`,
        );
        await client.query(
          `select private.perform_platform_v2_card_action_without_verifiable_receipt(
             $1::uuid, 'mark-known', $2::uuid, $3::text, 'untracked',
             null, null, null, $4::uuid, null, 'first_party', null
           )`,
          [userId, entryId, cardTypeId, clientEventId],
        );

        await client.query(
          "select set_config('request.jwt.claim.role', 'service_role', true)",
        );
        await client.query("set local role service_role");
        const verified = await client.query(
          `select verify_platform_v2_action_receipt_as_principal(
             $1::uuid, $2::jsonb
           ) as result`,
          [
            userId,
            JSON.stringify({
              contractVersion: "platform-action-report-verification-v1",
              entryId,
              cardTypeId,
              stateRevision: "untracked",
              actionId: "mark-known",
              clientEventId,
              reviewResult: null,
              activeKnownMarkId: null,
              knownMarkRevision: null,
            }),
          ],
        );

        expect(verified.rows[0].result).toBe(false);
      },
      userId,
    );
  });

  test("waits for an in-flight action and fails closed when it rolls back", async () => {
    await expect(resolveInFlightAction("rollback")).resolves.toEqual({
      settledBeforeDisposition: false,
      verified: false,
    });
  });

  test("waits for an in-flight action and verifies it after commit", async () => {
    await expect(resolveInFlightAction("commit")).resolves.toEqual({
      settledBeforeDisposition: false,
      verified: true,
    });
  });

  test("keeps verification service-only and hides the legacy mutation helper", async () => {
    const privileges = await pool.query(`select
      has_function_privilege(
        'service_role',
        'verify_platform_v2_action_receipt_as_principal(uuid,jsonb)',
        'EXECUTE'
      ) as service_verify,
      has_function_privilege(
        'authenticated',
        'verify_platform_v2_action_receipt_as_principal(uuid,jsonb)',
        'EXECUTE'
      ) as authenticated_verify,
      has_function_privilege(
        'service_role',
        'private.perform_platform_v2_card_action_without_verifiable_receipt(uuid,text,uuid,text,text,uuid,text,text,uuid,jsonb,text,text)',
        'EXECUTE'
      ) as legacy_mutation
    `);

    expect(privileges.rows[0]).toEqual({
      service_verify: true,
      authenticated_verify: false,
      legacy_mutation: false,
    });
  });

  test("rejects rewriting a persisted original request projection", async () => {
    const userId = randomUUID();
    const clientEventId = randomUUID();

    await withTransaction(
      pool,
      async (client) => {
        await ensureUserWithSettings(client, userId);
        const entryId = await insertWord(
          client,
          `platform-action-receipt-immutable-${Date.now()}`,
        );
        await client.query(
          `select perform_platform_v2_card_action(
             $1::uuid, 'mark-known', $2::uuid, $3::text, 'untracked',
             null, null, null, $4::uuid, null, 'first_party', null
           )`,
          [userId, entryId, cardTypeId, clientEventId],
        );

        await client.query("savepoint rewrite_projection");
        await expect(
          client.query(
            `update platform_v2_action_receipts
                set request_projection = jsonb_set(
                  request_projection,
                  '{stateRevision}',
                  to_jsonb($3::text)
                )
              where user_id = $1 and client_event_id = $2`,
            [userId, clientEventId, randomUUID()],
          ),
        ).rejects.toThrow(/platform_action_receipt_projection_immutable/);
        await client.query("rollback to savepoint rewrite_projection");
        await client.query("release savepoint rewrite_projection");
      },
      userId,
    );
  });
});
