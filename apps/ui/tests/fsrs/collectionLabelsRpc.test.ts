import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import {
  ensureUserWithSettings,
  getDbUrl,
  insertWord,
  runMigrations,
  withTransaction,
} from "./dbTestUtils";

type Snapshot = {
  revision: number;
  labels: Array<{
    id: string;
    parent_id: string | null;
    name: string;
    description: string | null;
  }>;
  assignments: Array<{ collection_id: string; label_id: string }>;
};
const dbUrl = getDbUrl();
const describeIfDb = dbUrl ? describe : describe.skip;

async function asUser(client: PoolClient, user: string | null) {
  await client.query("select set_config('request.jwt.claim.sub',$1,true)", [
    user ?? "",
  ]);
  await client.query("set local role authenticated");
  expect((await client.query("select current_user as role")).rows[0].role).toBe(
    "authenticated",
  );
}
async function read(client: PoolClient, user: string): Promise<Snapshot> {
  return (
    await client.query("select read_collection_labels_v1($1) as snapshot", [
      user,
    ])
  ).rows[0].snapshot;
}
async function mutate(
  client: PoolClient,
  user: string,
  revision: number,
  operation: object,
): Promise<Snapshot> {
  return (
    await client.query(
      "select mutate_collection_labels_v1($1,$2,$3::jsonb) as snapshot",
      [user, revision, JSON.stringify(operation)],
    )
  ).rows[0].snapshot;
}
async function reject(
  client: PoolClient,
  action: () => Promise<unknown>,
  error: RegExp,
) {
  await client.query("savepoint expected_failure");
  await expect(action()).rejects.toThrow(error);
  await client.query("rollback to savepoint expected_failure");
  await client.query("release savepoint expected_failure");
}
async function collection(client: PoolClient, user: string) {
  return (
    await client.query("select create_user_word_list($1,$2) as list", [
      user,
      randomUUID(),
    ])
  ).rows[0].list.id as string;
}
async function learningAndMembership(client: PoolClient, user: string) {
  await client.query("reset role");
  const snapshot: Record<string, unknown> = {};
  for (const table of [
    "public.user_card_status",
    "public.user_review_log",
    "public.user_card_known_marks",
    "public.user_card_action_events",
    "private.training_pair_exclusions",
    "private.training_headword_exclusions",
  ]) {
    snapshot[table] = (
      await client.query(
        `select to_jsonb(t) as row from ${table} t where user_id=$1 order by to_jsonb(t)::text`,
        [user],
      )
    ).rows;
  }
  snapshot.membership = (
    await client.query(
      "select to_jsonb(i) as row from user_word_list_items i join user_word_lists l on l.id=i.list_id where l.user_id=$1 order by i.list_id,i.word_id",
      [user],
    )
  ).rows;
  return snapshot;
}

async function expectQueryBlockedBy(
  observer: PoolClient,
  waitingPid: number,
  holdingPid: number,
  queryName: string,
) {
  const deadline = Date.now() + 2500;
  let observed: unknown;
  while (Date.now() < deadline) {
    await observer.query("select pg_stat_clear_snapshot()");
    const activity = (
      await observer.query(
        `select pg_blocking_pids(pid) as blockers, wait_event_type, query
         from pg_stat_activity where pid=$1`,
        [waitingPid],
      )
    ).rows[0];
    observed = activity;
    if (activity?.blockers.includes(holdingPid)) {
      expect(activity.wait_event_type).toBe("Lock");
      expect(activity.query).toContain(queryName);
      return;
    }
    // Poll actual database lock state; elapsed time alone is not evidence that
    // the competing operation reached its intended blocking point.
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(
    `backend ${waitingPid} never blocked on ${holdingPid}: ${JSON.stringify(observed)}`,
  );
}

describeIfDb("owner-only collection label RPCs", () => {
  const pool = new Pool({ connectionString: dbUrl });
  beforeAll(async () => {
    await runMigrations(pool);
    await pool.query(
      readFileSync(
        path.resolve(
          process.cwd(),
          "..",
          "..",
          "db",
          "deploy-contract",
          "collection-labels-probe.sql",
        ),
        "utf8",
      ),
    );
  });
  afterAll(async () => {
    await pool.end();
  });

  test("closed storage and authenticated owner checks reject foreign principals and references", async () => {
    const owner = randomUUID(),
      outsider = randomUUID(),
      label = randomUUID();
    await withTransaction(
      pool,
      async (client) => {
        await ensureUserWithSettings(client, owner);
        await ensureUserWithSettings(client, outsider);
        const privileges = (
          await client.query(`
        select relname, relrowsecurity,
          has_table_privilege('authenticated',c.oid,'select,insert,update,delete') as direct_access,
          has_table_privilege('anon',c.oid,'select,insert,update,delete') as anon_access
        from pg_class c join pg_namespace n on n.oid=c.relnamespace
        where n.nspname='private' and relname in ('collection_label_catalogs','collection_labels','collection_label_assignments')
        order by relname`)
        ).rows;
        expect(privileges).toHaveLength(3);
        for (const row of privileges)
          expect(row).toMatchObject({
            relrowsecurity: true,
            direct_access: false,
            anon_access: false,
          });
        expect(
          (
            await client.query(
              "select has_function_privilege('anon','public.read_collection_labels_v1(uuid)','execute') as read, has_function_privilege('anon','public.mutate_collection_labels_v1(uuid,bigint,jsonb)','execute') as write",
            )
          ).rows[0],
        ).toEqual({ read: false, write: false });
        await asUser(client, owner);
        const ownCollection = await collection(client, owner);
        const initial = await read(client, owner);
        expect(initial).toEqual({ revision: 0, labels: [], assignments: [] });
        const own = await mutate(client, owner, 0, {
          type: "create",
          id: label,
          name: "Owned",
        });
        await reject(
          client,
          () => client.query("select * from private.collection_labels"),
          /permission denied/,
        );
        await asUser(client, outsider);
        const otherCollection = await collection(client, outsider);
        expect(await read(client, outsider)).toEqual(initial);
        await reject(client, () => read(client, owner), /unauthorized/);
        await reject(
          client,
          () => mutate(client, owner, 1, { type: "delete", id: label }),
          /unauthorized/,
        );
        await reject(
          client,
          () =>
            mutate(client, outsider, 0, {
              type: "update",
              id: label,
              name: "Stolen",
            }),
          /label_not_found/,
        );
        await reject(
          client,
          () =>
            mutate(client, outsider, 0, {
              type: "create",
              name: "Foreign parent",
              parent_id: label,
            }),
          /label_not_found/,
        );
        await reject(
          client,
          () =>
            mutate(client, outsider, 0, {
              type: "set-collection-labels",
              collection_id: otherCollection,
              label_ids: [label],
            }),
          /label_not_found/,
        );
        await reject(
          client,
          () =>
            mutate(client, outsider, 0, {
              type: "set-collection-labels",
              collection_id: ownCollection,
              label_ids: [],
            }),
          /collection_not_found/,
        );
        await asUser(client, null);
        await reject(client, () => read(client, owner), /unauthorized/);
        await reject(
          client,
          () => mutate(client, owner, 1, { type: "delete", id: label }),
          /unauthorized/,
        );
        await asUser(client, owner);
        expect(await read(client, owner)).toEqual(own);

        // Fixture grants test defense-in-depth RLS without opening production access.
        await client.query("reset role");
        await client.query("grant usage on schema private to authenticated");
        await client.query(
          "grant select,insert on private.collection_labels to authenticated",
        );
        await asUser(client, owner);
        expect(
          (await client.query("select * from private.collection_labels")).rows,
        ).toEqual([]);
        await reject(
          client,
          () =>
            client.query(
              "insert into private.collection_labels(user_id,name) values($1,'Bypass')",
              [owner],
            ),
          /row-level security/,
        );
      },
      owner,
    );
  });

  test("stable IDs, multiple assignments, rename/move and splice deletion preserve collections and progress", async () => {
    const user = randomUUID(),
      root = randomUUID(),
      child = randomUUID(),
      leaf = randomUUID(),
      other = randomUUID();
    await withTransaction(
      pool,
      async (client) => {
        await ensureUserWithSettings(client, user);
        const entry = await insertWord(
          client,
          `labels-learning-${randomUUID()}`,
        );
        const list = await collection(client, user);
        await client.query("select add_entry_to_user_list($1,$2,$3)", [
          user,
          list,
          entry,
        ]);
        await client.query(
          "select handle_card_review($1,$2,'word-to-definition','success',$3)",
          [user, entry, randomUUID()],
        );
        const before = await learningAndMembership(client, user);
        await asUser(client, user);
        let state = await mutate(client, user, 0, {
          type: "create",
          id: root,
          name: "Root",
        });
        for (const op of [
          { type: "create", id: child, name: "Child", parent_id: root },
          { type: "create", id: leaf, name: "Leaf", parent_id: child },
          { type: "create", id: other, name: "Other" },
          {
            type: "set-collection-labels",
            collection_id: list,
            label_ids: [child, leaf, other, leaf],
          },
        ])
          state = await mutate(client, user, state.revision, op);
        expect(state.assignments).toHaveLength(3);
        const assigned = state;
        expect(
          await mutate(client, user, state.revision, {
            type: "set-collection-labels",
            collection_id: list,
            label_ids: [leaf, child, other],
          }),
        ).toEqual(assigned);
        state = await mutate(client, user, state.revision, {
          type: "update",
          id: child,
          name: "Renamed",
          description: "Description",
        });
        expect(state.labels.find((item) => item.id === child)).toMatchObject({
          name: "Renamed",
          parent_id: root,
        });
        state = await mutate(client, user, state.revision, {
          type: "update",
          id: other,
          parent_id: root,
        });
        expect(state.labels.find((item) => item.id === other)?.parent_id).toBe(
          root,
        );
        state = await mutate(client, user, state.revision, {
          type: "delete",
          id: child,
        });
        expect(state.labels.map((item) => item.id).sort()).toEqual(
          [root, leaf, other].sort(),
        );
        expect(state.labels.find((item) => item.id === leaf)?.parent_id).toBe(
          root,
        );
        expect(state.assignments).toEqual(
          expect.arrayContaining([
            { collection_id: list, label_id: leaf },
            { collection_id: list, label_id: other },
          ]),
        );
        expect(state.assignments).toHaveLength(2);
        state = await mutate(client, user, state.revision, {
          type: "delete",
          id: root,
        });
        expect(state.labels.every((item) => item.parent_id === null)).toBe(
          true,
        );
        state = await mutate(client, user, state.revision, {
          type: "set-collection-labels",
          collection_id: list,
          label_ids: [],
        });
        expect(state.assignments).toEqual([]);
        expect(
          (
            await client.query(
              "select get_available_word_lists($1,'nl','user') as lists",
              [user],
            )
          ).rows[0].lists.map((item: { id: string }) => item.id),
        ).toContain(list);
        expect(await learningAndMembership(client, user)).toEqual(before);
      },
      user,
    );
  });

  test("depth16 includes the whole moved subtree, and self/descendant cycles are atomic rejections", async () => {
    const user = randomUUID();
    await withTransaction(
      pool,
      async (client) => {
        await ensureUserWithSettings(client, user);
        await asUser(client, user);
        const chain = Array.from({ length: 16 }, () => randomUUID());
        let state = await read(client, user);
        for (const [index, id] of chain.entries())
          state = await mutate(client, user, state.revision, {
            type: "create",
            id,
            name: `Level ${index + 1}`,
            parent_id: chain[index - 1] ?? null,
          });
        await reject(
          client,
          () =>
            mutate(client, user, state.revision, {
              type: "create",
              name: "Too deep",
              parent_id: chain[15],
            }),
          /label_depth_limit/,
        );
        await reject(
          client,
          () =>
            mutate(client, user, state.revision, {
              type: "update",
              id: chain[0],
              parent_id: chain[0],
            }),
          /label_cycle/,
        );
        await reject(
          client,
          () =>
            mutate(client, user, state.revision, {
              type: "update",
              id: chain[0],
              parent_id: chain[15],
            }),
          /label_cycle/,
        );
        const branch = randomUUID(),
          tip = randomUUID();
        state = await mutate(client, user, state.revision, {
          type: "create",
          id: branch,
          name: "Branch",
        });
        state = await mutate(client, user, state.revision, {
          type: "create",
          id: tip,
          name: "Tip",
          parent_id: branch,
        });
        await reject(
          client,
          () =>
            mutate(client, user, state.revision, {
              type: "update",
              id: branch,
              parent_id: chain[14],
            }),
          /label_depth_limit/,
        );
        expect(await read(client, user)).toEqual(state);
        state = await mutate(client, user, state.revision, {
          type: "update",
          id: branch,
          parent_id: chain[13],
        });
        expect(state.labels.find((item) => item.id === tip)?.parent_id).toBe(
          branch,
        );
      },
      user,
    );
  });

  test("revision conflicts, semantic no-ops and invalid payloads have explicit atomic behavior", async () => {
    const user = randomUUID(),
      label = randomUUID();
    await withTransaction(
      pool,
      async (client) => {
        await ensureUserWithSettings(client, user);
        await asUser(client, user);
        const state = await mutate(client, user, 0, {
          type: "create",
          id: label,
          name: "Name",
        });
        expect(state.revision).toBe(1);
        await reject(
          client,
          () =>
            mutate(client, user, 0, {
              type: "update",
              id: label,
              name: "Stale",
            }),
          /label_catalog_conflict/,
        );
        expect(
          await mutate(client, user, 1, {
            type: "update",
            id: label,
            name: "Name",
            parent_id: null,
          }),
        ).toEqual(state);
        for (const operation of [
          { type: "create", name: " " },
          { type: "create", name: "a".repeat(101) },
          { type: "create", name: "Invalid", unknown: true },
          { type: "update", id: "invalid" },
          { type: "update", id: label, name: null },
          { type: "update", id: label, description: 42 },
          {
            type: "set-collection-labels",
            collection_id: randomUUID(),
            label_ids: [null],
          },
          { type: "unknown" },
        ])
          await reject(
            client,
            () => mutate(client, user, 1, operation),
            /invalid_label_operation/,
          );
        expect(await read(client, user)).toEqual(state);
        await client.query("reset role");
        await client.query(
          "update private.collection_label_catalogs set revision=2147483646 where user_id=$1",
          [user],
        );
        await asUser(client, user);
        await reject(
          client,
          () =>
            mutate(client, user, 2147483646, {
              type: "update",
              id: label,
              name: "Overflow",
            }),
          /label_catalog_limit/,
        );
        expect((await read(client, user)).labels[0].name).toBe("Name");
      },
      user,
    );
  });

  test("deleting an assigned collection invalidates the catalog without deleting labels or other assignments", async () => {
    const user = randomUUID(),
      label = randomUUID();
    await withTransaction(
      pool,
      async (client) => {
        await ensureUserWithSettings(client, user);
        await asUser(client, user);
        const deleted = await collection(client, user),
          kept = await collection(client, user);
        let state = await mutate(client, user, 0, {
          type: "create",
          id: label,
          name: "Keep label",
        });
        for (const id of [deleted, kept])
          state = await mutate(client, user, state.revision, {
            type: "set-collection-labels",
            collection_id: id,
            label_ids: [label],
          });
        const beforeDelete = state;
        await client.query("select delete_user_word_list($1,$2)", [
          user,
          deleted,
        ]);
        state = await read(client, user);
        expect(state.revision).toBe(beforeDelete.revision + 1);
        expect(state.labels).toEqual(beforeDelete.labels);
        expect(state.assignments).toEqual([
          { collection_id: kept, label_id: label },
        ]);
        await reject(
          client,
          () =>
            mutate(client, user, beforeDelete.revision, {
              type: "update",
              id: label,
              name: "Stale after delete",
            }),
          /label_catalog_conflict/,
        );
        const unassigned = await collection(client, user);
        await client.query("select delete_user_word_list($1,$2)", [
          user,
          unassigned,
        ]);
        expect(await read(client, user)).toEqual(state);
      },
      user,
    );
  });

  test("snapshot caps reject additions explicitly without truncating the existing catalog", async () => {
    const user = randomUUID();
    await withTransaction(
      pool,
      async (client) => {
        await ensureUserWithSettings(client, user);
        await client.query(
          "insert into private.collection_label_catalogs(user_id) values($1)",
          [user],
        );
        const labels = (
          await client.query(
            "insert into private.collection_labels(user_id,name) select $1,'Label '||n from generate_series(1,1000) n returning id",
            [user],
          )
        ).rows.map((item) => item.id as string);
        const lists = (
          await client.query(
            "insert into user_word_lists(user_id,name) select $1,'Collection '||n from generate_series(1,11) n returning id",
            [user],
          )
        ).rows.map((item) => item.id as string);
        await client.query(
          "insert into private.collection_label_assignments(user_id,collection_id,label_id) select $1,collection_id,label_id from unnest($2::uuid[]) collection_id cross join unnest($3::uuid[]) label_id",
          [user, lists.slice(0, 10), labels],
        );
        await asUser(client, user);
        const before = await read(client, user);
        expect(before.labels).toHaveLength(1000);
        expect(before.assignments).toHaveLength(10000);
        await reject(
          client,
          () => mutate(client, user, 0, { type: "create", name: "Label 1001" }),
          /label_catalog_limit/,
        );
        await reject(
          client,
          () =>
            mutate(client, user, 0, {
              type: "set-collection-labels",
              collection_id: lists[10],
              label_ids: [labels[0]],
            }),
          /label_catalog_limit/,
        );
        expect(await read(client, user)).toEqual(before);
      },
      user,
    );
  });

  test("opposing concurrent moves cannot create a cycle and the stale move fails on revision", async () => {
    const user = randomUUID();
    const labelA = randomUUID(),
      labelB = randomUUID();
    const setup = await pool.connect(),
      first = await pool.connect(),
      second = await pool.connect();
    try {
      await setup.query("begin");
      await ensureUserWithSettings(setup, user);
      await asUser(setup, user);
      await mutate(setup, user, 0, { type: "create", id: labelA, name: "A" });
      await mutate(setup, user, 1, { type: "create", id: labelB, name: "B" });
      await setup.query("commit");
      await first.query("begin");
      await second.query("begin");
      await first.query("set local statement_timeout='5s'");
      await second.query("set local statement_timeout='5s'");
      await asUser(first, user);
      await asUser(second, user);
      const winner = await mutate(first, user, 2, {
        type: "update",
        id: labelA,
        parent_id: labelB,
      });
      // The second backend must wait for the first transaction's catalog row,
      // then evaluate the expected revision against committed state.
      const blocked = mutate(second, user, 2, {
        type: "update",
        id: labelB,
        parent_id: labelA,
      });
      // Observe the expected rejection before releasing the lock. The loser
      // can reject before the winner's COMMIT acknowledgement reaches us.
      await Promise.all([
        expect(blocked).rejects.toThrow(/label_catalog_conflict/),
        first.query("commit").then(
          () => new Promise(resolve => setTimeout(resolve, 50)),
        ),
      ]);
      await second.query("rollback");
      await first.query("begin");
      await asUser(first, user);
      expect(await read(first, user)).toEqual(winner);
      expect(winner.revision).toBe(3);
      await reject(
        first,
        () =>
          mutate(first, user, winner.revision, {
            type: "update",
            id: labelB,
            parent_id: labelA,
          }),
        /label_cycle/,
      );
      expect(await read(first, user)).toEqual(winner);
      await first.query("rollback");
    } finally {
      await setup.query("rollback");
      await first.query("rollback");
      await second.query("rollback");
      await setup.query("delete from auth.users where id=$1", [user]);
      setup.release();
      first.release();
      second.release();
    }
  });

  test.each([
    {
      name: "assigned: assignment before delete",
      assigned: true,
      assignmentFirst: true,
    },
    {
      name: "unassigned: assignment before delete",
      assigned: false,
      assignmentFirst: true,
    },
    {
      name: "assigned: delete before assignment",
      assigned: true,
      assignmentFirst: false,
    },
    {
      name: "unassigned: delete before assignment",
      assigned: false,
      assignmentFirst: false,
    },
  ])(
    "$name preserves collection -> catalog lock order",
    async ({ assigned, assignmentFirst }) => {
      const user = randomUUID(),
        originalLabel = randomUUID(),
        replacementLabel = randomUUID();
      const observer = await pool.connect(),
        holder = await pool.connect(),
        waiter = await pool.connect();
      let pending:
        | Promise<{ ok: true } | { ok: false; error: unknown }>
        | undefined;
      try {
        // Commit setup so both authenticated backends observe identical starting
        // ownership, assignment and catalog state.
        await observer.query("begin");
        await ensureUserWithSettings(observer, user);
        await asUser(observer, user);
        const removedCollection = await collection(observer, user);
        const survivingCollection = await collection(observer, user);
        let before = await mutate(observer, user, 0, {
          type: "create",
          id: originalLabel,
          name: "Original label",
        });
        before = await mutate(observer, user, before.revision, {
          type: "create",
          id: replacementLabel,
          name: "Replacement label",
        });
        before = await mutate(observer, user, before.revision, {
          type: "set-collection-labels",
          collection_id: survivingCollection,
          label_ids: [originalLabel],
        });
        if (assigned)
          before = await mutate(observer, user, before.revision, {
            type: "set-collection-labels",
            collection_id: removedCollection,
            label_ids: [originalLabel],
          });
        await observer.query("commit");
        await observer.query("begin");
        await observer.query("set local statement_timeout='2s'");

        for (const client of [holder, waiter]) {
          await client.query("begin");
          await client.query("set local statement_timeout='5s'");
          await asUser(client, user);
        }
        const holdingPid = (
          await holder.query("select pg_backend_pid() as pid")
        ).rows[0].pid as number;
        const waitingPid = (
          await waiter.query("select pg_backend_pid() as pid")
        ).rows[0].pid as number;
        const assign = (client: PoolClient) =>
          mutate(client, user, before.revision, {
            type: "set-collection-labels",
            collection_id: removedCollection,
            label_ids: [replacementLabel],
          });
        const remove = (client: PoolClient) =>
          client.query("select delete_user_word_list($1,$2)", [
            user,
            removedCollection,
          ]);

        if (assignmentFirst) {
          const assignedState = await assign(holder);
          expect(assignedState.revision).toBe(before.revision + 1);
          expect(assignedState.assignments).toContainEqual({
            collection_id: removedCollection,
            label_id: replacementLabel,
          });
        } else {
          await remove(holder);
        }
        // Capture rejection immediately, including timeout/deadlock failures, so
        // an assertion failure can safely unwind and release both transactions.
        pending = (assignmentFirst ? remove(waiter) : assign(waiter)).then(
          () => ({ ok: true as const }),
          (error: unknown) => ({ ok: false as const, error }),
        );
        await expectQueryBlockedBy(
          observer,
          waitingPid,
          holdingPid,
          assignmentFirst
            ? "delete_user_word_list"
            : "mutate_collection_labels_v1",
        );
        await holder.query("commit");
        const result = await pending;
        if (assignmentFirst) {
          expect(result).toEqual({ ok: true });
          await waiter.query("commit");
        } else {
          expect(result.ok).toBe(false);
          if (result.ok)
            throw new Error(
              "assignment to deleted collection unexpectedly succeeded",
            );
          expect(result.error).toMatchObject({
            code: "P0001",
            message: "collection_not_found",
          });
          await waiter.query("rollback");
        }

        await asUser(observer, user);
        expect(await read(observer, user)).toEqual({
          ...before,
          revision: before.revision + (assignmentFirst ? 2 : Number(assigned)),
          assignments: [
            { collection_id: survivingCollection, label_id: originalLabel },
          ],
        });
        await observer.query("reset role");
        expect(
          (
            await observer.query(
              "select id from user_word_lists where user_id=$1",
              [user],
            )
          ).rows,
        ).toEqual([{ id: survivingCollection }]);
        expect(
          (
            await observer.query(
              `
        select count(*)::int as count from private.collection_label_assignments assignment
        left join public.user_word_lists collection
          on collection.user_id=assignment.user_id and collection.id=assignment.collection_id
        left join private.collection_labels label
          on label.user_id=assignment.user_id and label.id=assignment.label_id
        where assignment.user_id=$1 and (collection.id is null or label.id is null)`,
              [user],
            )
          ).rows[0].count,
        ).toBe(0);
        await observer.query("rollback");
      } finally {
        // Release the holder even when observing a lock or asserting a result
        // failed; queueing only the waiter's rollback would leave it blocked.
        try {
          await Promise.allSettled([
            holder.query("rollback"),
            waiter.query("rollback"),
          ]);
          await pending;
          await observer.query("rollback");
          await observer.query("delete from auth.users where id=$1", [user]);
        } finally {
          observer.release();
          holder.release();
          waiter.release();
        }
      }
    },
    15000,
  );
});
