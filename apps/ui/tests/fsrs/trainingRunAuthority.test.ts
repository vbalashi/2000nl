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

type TrainingRun = {
  sessionId: string;
  plannedTotal: number;
  runStatus: "active" | "superseded";
};

type TrainingCard = {
  id: string;
  mode: string;
  stateRevision: string;
  trainingSessionId: string;
};

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

async function beginAs(
  pool: Pool,
  userId: string,
  role: "authenticated" | "service_role",
) {
  const client = await pool.connect();
  await client.query("begin");
  await client.query(
    `select set_config('request.jwt.claim.sub', $1, true),
            set_config('request.jwt.claim.role', $2, true)`,
    [userId, role],
  );
  const { rows } = await client.query(`select pg_backend_pid() as pid`);
  return { client, pid: rows[0].pid as number };
}

async function waitUntilBlocked(pool: Pool, pid: number) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const { rows } = await pool.query(
      `select cardinality(pg_blocking_pids($1)) > 0 as blocked`,
      [pid],
    );
    if (rows[0].blocked) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`backend ${pid} did not enter a blocked state`);
}

async function startTrainingRun(
  client: PoolClient,
  userId: string,
  sessionSize = "4",
) {
  const { rows } = await client.query(
    `select start_training_session(
       $1::uuid, array['word-to-definition']::text[],
       null, 'curated', 'new', '{}'::jsonb, $2::text, $3::uuid
     ) as session`,
    [userId, sessionSize, randomUUID()],
  );
  return rows[0].session as TrainingRun;
}

async function nextTrainingCard(
  client: PoolClient,
  userId: string,
  sessionId: string,
) {
  const { rows } = await client.query(
    `select get_next_training_session_card(
       $1::uuid, $2::uuid, array[]::text[]
     ) as card`,
    [userId, sessionId],
  );
  return rows[0]?.card as TrainingCard | undefined;
}

async function gradeTrainingCard(
  client: PoolClient,
  userId: string,
  card: TrainingCard,
  sessionId: string,
  clientEventId = randomUUID(),
) {
  const { rows } = await client.query(
    `select perform_platform_v2_card_action_as_principal(
       $1::uuid, 'start-learning', $2::uuid, $3::text, $4::text,
       null, null, null, $5::uuid, null, 'first_party', null, $6::uuid
     ) as result`,
    [
      userId,
      card.id,
      card.mode,
      card.stateRevision,
      clientEventId,
      sessionId,
    ],
  );
  return rows[0].result as { status: "accepted" | "duplicate" };
}

async function createRunFixture(pool: Pool, wordCount = 4) {
  const userId = randomUUID();
  const entryIds: string[] = [];
  await committed(pool, userId, async (client) => {
    await ensureUserWithSettings(client, userId, {
      daily_new_limit: 20,
      daily_review_limit: 20,
    });
    for (let index = 0; index < wordCount; index += 1) {
      entryIds.push(
        await insertWord(client, `run-authority-${index}-${userId}`),
      );
    }
  });
  return { userId, entryIds };
}

async function cleanupRunFixture(
  pool: Pool,
  userId: string,
  entryIds: string[],
) {
  await committed(pool, userId, async (client) => {
    await client.query(`delete from training_active_runs where user_id = $1`, [userId]);
    await client.query(`delete from training_run_start_receipts where user_id = $1`, [userId]);
    await client.query(`delete from training_session_action_bindings where user_id = $1`, [userId]);
    await client.query(`delete from platform_v2_action_receipts where user_id = $1`, [userId]);
    await client.query(
      `alter table training_session_members
         disable trigger training_session_members_identity_immutable`,
    );
    try {
      await client.query(
        `delete from training_session_members
          where session_id in (select id from training_sessions where user_id = $1)`,
        [userId],
      );
    } finally {
      await client.query(
        `alter table training_session_members
           enable trigger training_session_members_identity_immutable`,
      );
    }
    await client.query(`delete from training_sessions where user_id = $1`, [userId]);
    await client.query(`delete from user_card_known_marks where user_id = $1`, [userId]);
    await client.query(`delete from user_card_action_events where user_id = $1`, [userId]);
    await client.query(`delete from user_card_status where user_id = $1`, [userId]);
    await client.query(`delete from user_settings where user_id = $1`, [userId]);
    await client.query(`delete from auth.users where id = $1`, [userId]);
    await client.query(`delete from connected_clients where client_id = $1`, [
      `run-authority-${userId}`,
    ]);
    await client.query(`delete from word_entries where id = any($1::uuid[])`, [entryIds]);
  });
}

describeDb("active Training run authority", () => {
  const pool = new Pool({ connectionString: databaseUrl });

  beforeAll(async () => {
    await runMigrations(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  test("keeps active-run authority tables private behind security-definer RPCs", async () => {
    const { rows } = await pool.query(
      `select c.relname, c.relrowsecurity,
              has_table_privilege('anon', c.oid, 'select,insert,update,delete') as anon_access,
              has_table_privilege('authenticated', c.oid, 'select,insert,update,delete') as authenticated_access,
              has_table_privilege('service_role', c.oid, 'select,insert,update,delete') as service_access
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relname in ('training_active_runs', 'training_run_start_receipts')
        order by c.relname`,
    );
    expect(rows).toEqual([
      {
        relname: "training_active_runs",
        relrowsecurity: true,
        anon_access: false,
        authenticated_access: false,
        service_access: false,
      },
      {
        relname: "training_run_start_receipts",
        relrowsecurity: true,
        anon_access: false,
        authenticated_access: false,
        service_access: false,
      },
    ]);
  });

  test("keeps the old first-party wire path during rollback while explicit Training remains fenced", async () => {
    const { userId, entryIds } = await createRunFixture(pool, 4);
    try {
      const first = await committed(pool, userId, (client) =>
        startTrainingRun(client, userId, "1"),
      );
      const card = await committed(pool, userId, (client) =>
        nextTrainingCard(client, userId, first.sessionId),
      );
      if (!card) throw new Error("expected one Training card");
      const takeover = await committed(pool, userId, (client) =>
        startTrainingRun(client, userId, "1"),
      );
      expect(takeover.sessionId).not.toBe(first.sessionId);
      const nonCardEntries = entryIds.filter((entryId) => entryId !== card.id);
      const legacyLibraryEntryId = nonCardEntries[0];
      const connectedClientEntryId = nonCardEntries[1];
      const legacyKnownEntryId = nonCardEntries[2];
      if (
        !legacyLibraryEntryId ||
        !connectedClientEntryId ||
        !legacyKnownEntryId
      ) {
        throw new Error("expected separate compatibility entries");
      }

      const rollbackLibrary = await committed(
        pool,
        userId,
        async (client) => {
          const { rows } = await client.query(
            `select perform_platform_v2_card_action_as_principal(
               $1::uuid, 'start-learning', $2::uuid, $3::text, $4::text,
               null, null, null, $5::uuid, null, 'first_party', null
             ) as result`,
            [
              userId,
              legacyLibraryEntryId,
              card.mode,
              "untracked",
              randomUUID(),
            ],
          );
          return rows[0].result;
        },
        "service_role",
      );
      expect(rollbackLibrary).toEqual(
        expect.objectContaining({ status: "accepted" }),
      );

      const rollbackKnown = await committed(
        pool,
        userId,
        async (client) => {
          const { rows } = await client.query(
            `select perform_platform_v2_card_action_as_principal(
               $1::uuid, 'mark-known', $2::uuid, $3::text, $4::text,
               null, null, null, $5::uuid, null, 'first_party', null
             ) as result`,
            [
              userId,
              legacyKnownEntryId,
              card.mode,
              "untracked",
              randomUUID(),
            ],
          );
          return rows[0].result;
        },
        "service_role",
      );
      expect(rollbackKnown).toEqual(
        expect.objectContaining({
          status: "accepted",
          card: expect.objectContaining({
            knownMark: expect.objectContaining({ markId: expect.any(String) }),
          }),
        }),
      );

      const library = await committed(
        pool,
        userId,
        async (client) => {
          const { rows } = await client.query(
            `select perform_platform_v2_card_action_as_principal(
               $1::uuid, 'start-learning', $2::uuid, $3::text, $4::text,
               null, null, null, $5::uuid, null,
               'first_party', null, null
             ) as result`,
            [userId, card.id, card.mode, card.stateRevision, randomUUID()],
          );
          return rows[0].result;
        },
        "service_role",
      );
      expect(library).toEqual(expect.objectContaining({ status: "accepted" }));

      const connectedClientId = `run-authority-${userId}`;
      await committed(pool, userId, async (client) => {
        await client.query(
          `insert into connected_clients (
             client_id, display_name, client_type,
             allowed_redirect_uris, allowed_scopes
           ) values (
             $1, 'Run authority test', 'chrome_extension',
             array['https://example.com/callback'],
             array['platform:read', 'platform:write']
           )`,
          [connectedClientId],
        );
        await client.query(
          `insert into connected_client_grants (client_id, user_id, scopes)
           values ($1, $2::uuid, array['platform:read', 'platform:write'])`,
          [connectedClientId, userId],
        );
      });

      const connectedClient = await committed(
        pool,
        userId,
        async (client) => {
          const { rows } = await client.query(
            `select perform_platform_v2_card_action_as_principal(
               $1::uuid, 'start-learning', $2::uuid, $3::text, $4::text,
               null, null, null, $5::uuid, null, 'connected_client', $6::text
             ) as result`,
            [
              userId,
              connectedClientEntryId,
              card.mode,
              "untracked",
              randomUUID(),
              connectedClientId,
            ],
          );
          return rows[0].result;
        },
        "service_role",
      );
      expect(connectedClient).toEqual(
        expect.objectContaining({ status: "accepted" }),
      );
    } finally {
      await cleanupRunFixture(pool, userId, entryIds);
    }
  });

  test("retains only the exact legacy RPC shapes needed by the app rollback window", async () => {
    const { rows } = await pool.query(
      `select p.oid::regprocedure::text as signature,
              p.pronargdefaults as default_count,
              has_function_privilege('authenticated', p.oid, 'execute') as authenticated_execute
         from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname in (
            'handle_card_review',
            'handle_review',
            'start_learning_entry_card',
            'start_learning_card'
          )
        order by p.proname, p.oid::regprocedure::text`,
    );
    expect(rows).toEqual([
      {
        signature: "handle_card_review(uuid,uuid,text,text,uuid)",
        default_count: 1,
        authenticated_execute: true,
      },
      {
        signature: "start_learning_entry_card(uuid,uuid,text)",
        default_count: 0,
        authenticated_execute: true,
      },
    ]);
  });

  test.each([
    {
      name: "review",
      signature: "handle_card_review(uuid,uuid,text,text,uuid)",
      sql: `select handle_card_review($1::uuid, $2::uuid, $3::text, 'easy', $4::uuid)`,
      expectedReviews: 1,
    },
    {
      name: "Learn",
      signature: "start_learning_entry_card(uuid,uuid,text)",
      sql: `select start_learning_entry_card($1::uuid, $2::uuid, $3::text)`,
      expectedReviews: 0,
    },
  ])("keeps previous-app legacy $name working during the rollback window", async ({
    signature,
    sql,
    expectedReviews,
  }) => {
    const { userId, entryIds } = await createRunFixture(pool, 2);
    try {
      await committed(pool, userId, (client) =>
        startTrainingRun(client, userId, "1"),
      );
      await committed(pool, userId, (client) =>
        startTrainingRun(client, userId, "1"),
      );

      await committed(pool, userId, async (client) => {
        await client.query("set local role authenticated");
        const { rows } = await client.query(
          `select has_function_privilege(current_user, $1::regprocedure, 'execute') as allowed`,
          [signature],
        );
        expect(rows[0].allowed).toBe(true);
        const parameters = [userId, entryIds[1], "word-to-definition"];
        await client.query(
          sql,
          expectedReviews === 1 ? [...parameters, randomUUID()] : parameters,
        );
      });

      const { rows } = await pool.query(
        `select
           (select count(*)::integer from user_review_log
             where user_id = $1::uuid and word_id = $2::uuid) as reviews,
           (select count(*)::integer from user_card_status
             where user_id = $1::uuid and entry_id = $2::uuid) as statuses`,
        [userId, entryIds[1]],
      );
      expect(rows[0].reviews).toBe(expectedReviews);
      expect(rows[0].statuses).toBeGreaterThan(0);
    } finally {
      await cleanupRunFixture(pool, userId, entryIds);
    }
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

  test("serializes an accepted grade before a concurrent takeover", async () => {
    const { userId, entryIds } = await createRunFixture(pool);
    let gradeClient: PoolClient | null = null;
    let startClient: PoolClient | null = null;
    try {
      const first = await committed(pool, userId, (client) =>
        startTrainingRun(client, userId),
      );
      const card = await committed(pool, userId, (client) =>
        nextTrainingCard(client, userId, first.sessionId),
      );
      if (!card) throw new Error("expected a Training card");

      ({ client: gradeClient } = await beginAs(pool, userId, "service_role"));
      const grade = await gradeTrainingCard(
        gradeClient,
        userId,
        card,
        first.sessionId,
      );
      expect(grade.status).toBe("accepted");

      const start = await beginAs(pool, userId, "authenticated");
      startClient = start.client;
      const takeoverPromise = startTrainingRun(startClient, userId);
      await waitUntilBlocked(pool, start.pid);

      await gradeClient.query("commit");
      gradeClient.release();
      gradeClient = null;

      const takeover = await takeoverPromise;
      await startClient.query("commit");
      startClient.release();
      startClient = null;

      expect(takeover).toEqual(
        expect.objectContaining({ runStatus: "active", plannedTotal: 3 }),
      );
      const { rows } = await pool.query(
        `select count(*)::integer as events
           from user_card_action_events
          where user_id = $1::uuid`,
        [userId],
      );
      expect(rows[0].events).toBe(1);
    } finally {
      if (gradeClient) {
        await gradeClient.query("rollback").catch(() => undefined);
        gradeClient.release();
      }
      if (startClient) {
        await startClient.query("rollback").catch(() => undefined);
        startClient.release();
      }
      await cleanupRunFixture(pool, userId, entryIds);
    }
  });

  test("serializes takeover before a concurrent stale grade", async () => {
    const { userId, entryIds } = await createRunFixture(pool);
    let startClient: PoolClient | null = null;
    let gradeClient: PoolClient | null = null;
    try {
      const first = await committed(pool, userId, (client) =>
        startTrainingRun(client, userId),
      );
      const card = await committed(pool, userId, (client) =>
        nextTrainingCard(client, userId, first.sessionId),
      );
      if (!card) throw new Error("expected a Training card");

      ({ client: startClient } = await beginAs(pool, userId, "authenticated"));
      const takeover = await startTrainingRun(startClient, userId);

      const grade = await beginAs(pool, userId, "service_role");
      gradeClient = grade.client;
      const staleGradePromise = gradeTrainingCard(
        gradeClient,
        userId,
        card,
        first.sessionId,
      );
      await waitUntilBlocked(pool, grade.pid);

      await startClient.query("commit");
      startClient.release();
      startClient = null;

      await expect(staleGradePromise).rejects.toThrow(
        "training_session_superseded",
      );
      await gradeClient.query("rollback");
      gradeClient.release();
      gradeClient = null;

      expect(takeover).toEqual(
        expect.objectContaining({ runStatus: "active", plannedTotal: 4 }),
      );
      const { rows } = await pool.query(
        `select count(*)::integer as events
           from user_card_action_events
          where user_id = $1::uuid`,
        [userId],
      );
      expect(rows[0].events).toBe(0);
    } finally {
      if (startClient) {
        await startClient.query("rollback").catch(() => undefined);
        startClient.release();
      }
      if (gradeClient) {
        await gradeClient.query("rollback").catch(() => undefined);
        gradeClient.release();
      }
      await cleanupRunFixture(pool, userId, entryIds);
    }
  });

  test("replays one accepted receipt after takeover without consuming the new run", async () => {
    const { userId, entryIds } = await createRunFixture(pool);
    try {
      const first = await committed(pool, userId, (client) =>
        startTrainingRun(client, userId),
      );
      const card = await committed(pool, userId, (client) =>
        nextTrainingCard(client, userId, first.sessionId),
      );
      if (!card) throw new Error("expected a Training card");
      const clientEventId = randomUUID();

      const accepted = await committed(
        pool,
        userId,
        (client) =>
          gradeTrainingCard(
            client,
            userId,
            card,
            first.sessionId,
            clientEventId,
          ),
        "service_role",
      );
      expect(accepted.status).toBe("accepted");

      const takeover = await committed(pool, userId, (client) =>
        startTrainingRun(client, userId),
      );
      const duplicate = await committed(
        pool,
        userId,
        (client) =>
          gradeTrainingCard(
            client,
            userId,
            card,
            first.sessionId,
            clientEventId,
          ),
        "service_role",
      );
      expect(duplicate.status).toBe("duplicate");

      const { rows } = await pool.query(
        `select
           (select count(*)::integer from user_card_action_events
             where user_id = $1::uuid and client_event_id = $2::text) as events,
           (select count(*)::integer from platform_v2_action_receipts
             where user_id = $1::uuid and client_event_id = $2::uuid) as receipts,
           (select count(*)::integer from training_session_members
             where session_id = $3::uuid and consumed_at is not null) as new_consumed`,
        [userId, clientEventId, takeover.sessionId],
      );
      expect(rows[0]).toEqual({ events: 1, receipts: 1, new_consumed: 0 });
    } finally {
      await cleanupRunFixture(pool, userId, entryIds);
    }
  });
});
