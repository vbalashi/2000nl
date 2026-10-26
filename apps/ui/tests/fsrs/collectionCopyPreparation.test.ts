import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import {
  getDbUrl,
  runMigrations,
  withTransaction,
  ensureUserWithSettings,
} from "./dbTestUtils";
const url = getDbUrl();
async function entry(c: PoolClient, owner: string, word: string) {
  await ensureUserWithSettings(c, owner);
  return (
    await c.query("select create_user_dictionary_entry($1,null,$2) id", [
      owner,
      { headword: word, languageCode: "nl", definition: "definition" },
    ])
  ).rows[0].id;
}
async function list(c: PoolClient, owner: string, name: string, ids: string[]) {
  const id = (
    await c.query(
      "insert into user_word_lists(user_id,name,language_code) values($1,$2,'nl') returning id",
      [owner, name],
    )
  ).rows[0].id;
  for (const word of ids)
    await c.query(
      "insert into user_word_list_items(list_id,word_id) values($1,$2)",
      [id, word],
    );
  return id;
}
async function internalPlan(
  c: PoolClient,
  owner: string,
  listId: string,
  ids: string[],
) {
  const candidates = [];
  for (const id of ids) {
    const snapshot = (
      await c.query(
        "select private.independent_copy_snapshot_v1($1,$2) value",
        [owner, id],
      )
    ).rows[0].value;
    candidates.push({ entryId: id, revision: snapshot.revision, snapshot });
  }
  const digest = (
    await c.query("select private.collection_membership_digest_v1($1) value", [
      listId,
    ])
  ).rows[0].value;
  return {
    listId,
    revision: "a".repeat(64),
    membershipDigest: digest,
    canCopy: true,
    candidates,
  };
}
(url ? describe : describe.skip)(
  "collection independent copy preparation",
  () => {
    const pool = new Pool({ connectionString: url });
    beforeAll(() => runMigrations(pool));
    afterAll(() => pool.end());
    test("owned preflight is read-only and exposes no private plan or content", async () => {
      const owner = randomUUID();
      await withTransaction(
        pool,
        async (c) => {
          const original = await entry(c, owner, "own");
          const collection = await list(c, owner, "own", [original]);
          await c.query("set local role authenticated");
          const before = (
            await c.query(
              "select preview_collection_independent_copy_v1($1) value",
              [collection],
            )
          ).rows[0].value;
          expect(before).toMatchObject({
            listId: collection,
            borrowedCount: 0,
            canCopy: true,
          });
          expect(Object.keys(before).sort()).toEqual([
            "borrowedCount",
            "canCopy",
            "listId",
            "revision",
          ]);
          await c.query("reset role");
          expect(
            (
              await c.query(
                "select word_id from user_word_list_items where list_id=$1",
                [collection],
              )
            ).rows,
          ).toEqual([{ word_id: original }]);
          expect(
            (
              await c.query(
                "select count(*)::int n from private.collection_copy_receipts where user_id=$1",
                [owner],
              )
            ).rows[0].n,
          ).toBe(0);
        },
        owner,
      );
    });
    test("membership in an owned list grants no foreign-private copy authority", async () => {
      const owner = randomUUID(),
        author = randomUUID();
      await withTransaction(
        pool,
        async (c) => {
          await c.query("select set_config('request.jwt.claim.sub',$1,true)", [
            author,
          ]);
          const foreign = await entry(c, author, "private foreign");
          await ensureUserWithSettings(c, owner);
          await c.query("select set_config('request.jwt.claim.sub',$1,true)", [
            owner,
          ]);
          const collection = await list(c, owner, "borrowed", [foreign]);
          await c.query("set local role authenticated");
          const preview = (
            await c.query(
              "select preview_collection_independent_copy_v1($1) value",
              [collection],
            )
          ).rows[0].value;
          expect(preview).toMatchObject({ borrowedCount: 1, canCopy: false });
          expect(JSON.stringify(preview)).not.toContain("private foreign");
          await c.query("savepoint denied");
          await expect(
            c.query("select copy_collection_independent_entries_v1($1,$2,$3)", [
              randomUUID(),
              collection,
              preview.revision,
            ]),
          ).rejects.toThrow("copy_source_unavailable");
          await c.query("rollback to savepoint denied");
        },
        owner,
      );
    });
    test("the private atomic mutation seam replaces only the selected collection and replays its receipt", async () => {
      const owner = randomUUID();
      await withTransaction(
        pool,
        async (c) => {
          const original = await entry(c, owner, "atomic");
          const selected = await list(c, owner, "selected", [original]);
          const other = await list(c, owner, "other", [original]);
          // Exercise the deep mutation seam with truly authorized source material.
          // No fabricated foreign grant is used to claim #756 selected-private support.
          const plan = await internalPlan(c, owner, selected, [original]),
            operation = randomUUID();
          const result = (
            await c.query(
              "select private.commit_collection_copy_plan_v1($1,$2,$3,$4,$5) value",
              [owner, operation, selected, plan.revision, plan],
            )
          ).rows[0].value;
          expect(result).toMatchObject({
            operationId: operation,
            listId: selected,
            status: "completed",
            copiedCount: 1,
          });
          const replacement = (
            await c.query(
              "select word_id from user_word_list_items where list_id=$1",
              [selected],
            )
          ).rows[0].word_id;
          expect(replacement).not.toBe(original);
          expect(
            (
              await c.query(
                "select word_id from user_word_list_items where list_id=$1",
                [other],
              )
            ).rows,
          ).toEqual([{ word_id: original }]);
          await c.query("set local role authenticated");
          expect(
            (
              await c.query(
                "select copy_collection_independent_entries_v1($1,$2,$3) value",
                [operation, selected, plan.revision],
              )
            ).rows[0].value,
          ).toEqual(result);
          expect(
            (
              await c.query(
                "select read_collection_copy_receipt_v1($1) value",
                [operation],
              )
            ).rows[0].value,
          ).toEqual(result);
        },
        owner,
      );
    });
    test("a later failing source rolls back all copies and replacements", async () => {
      const owner = randomUUID();
      await withTransaction(
        pool,
        async (c) => {
          const ids = [
            await entry(c, owner, "atomic one"),
            await entry(c, owner, "atomic two"),
          ].sort();
          const selected = await list(c, owner, "rollback", ids);
          const plan = await internalPlan(c, owner, selected, ids);
          plan.candidates[1].revision = "b".repeat(64);
          const before = (
            await c.query(
              "select count(*)::int n from word_entries where dictionary_id in (select id from dictionaries where owner_user_id=$1)",
              [owner],
            )
          ).rows[0].n;
          await c.query("savepoint batch");
          await expect(
            c.query(
              "select private.commit_collection_copy_plan_v1($1,$2,$3,$4,$5)",
              [owner, randomUUID(), selected, plan.revision, plan],
            ),
          ).rejects.toThrow("copy_source_changed");
          await c.query("rollback to savepoint batch");
          expect(
            (
              await c.query(
                "select word_id from user_word_list_items where list_id=$1 order by word_id",
                [selected],
              )
            ).rows.map((row) => row.word_id),
          ).toEqual(ids);
          expect(
            (
              await c.query(
                "select count(*)::int n from word_entries where dictionary_id in (select id from dictionaries where owner_user_id=$1)",
                [owner],
              )
            ).rows[0].n,
          ).toBe(before);
          expect(
            (
              await c.query(
                "select count(*)::int n from private.collection_copy_receipts where user_id=$1",
                [owner],
              )
            ).rows[0].n,
          ).toBe(0);
        },
        owner,
      );
    });
    test("changed membership aborts before copying", async () => {
      const owner = randomUUID();
      await withTransaction(
        pool,
        async (c) => {
          const original = await entry(c, owner, "stale");
          const selected = await list(c, owner, "stale", [original]);
          const plan = await internalPlan(c, owner, selected, [original]);
          await c.query("delete from user_word_list_items where list_id=$1", [
            selected,
          ]);
          await c.query("savepoint stale");
          await expect(
            c.query(
              "select private.commit_collection_copy_plan_v1($1,$2,$3,$4,$5)",
              [owner, randomUUID(), selected, plan.revision, plan],
            ),
          ).rejects.toThrow("copy_collection_changed");
          await c.query("rollback to savepoint stale");
        },
        owner,
      );
    });
  },
);

(url ? describe : describe.skip)("collection membership interleavings", () => {
  const pool = new Pool({ connectionString: url });
  beforeAll(() => runMigrations(pool));
  afterAll(() => pool.end());
  test.each(["insert", "remove"] as const)(
    "public preparation serializes a committed concurrent %s",
    async (action) => {
      const owner = randomUUID(),
        c = await pool.connect(),
        editor = await pool.connect();
      let pending: Promise<unknown> | undefined;
      try {
        await c.query("begin");
        await c.query("select set_config('request.jwt.claim.sub',$1,true)", [
          owner,
        ]);
        const original = await entry(c, owner, `interleave original ${action}`),
          extra = await entry(c, owner, `interleave extra ${action}`);
        const collection = await list(c, owner, `interleave ${action}`, [
          original,
        ]);
        await c.query("commit");
        await c.query("begin");
        await c.query("select set_config('request.jwt.claim.sub',$1,true)", [
          owner,
        ]);
        await c.query("set local role authenticated");
        const preview = (
          await c.query(
            "select preview_collection_independent_copy_v1($1) value",
            [collection],
          )
        ).rows[0].value;
        const result = (
          await c.query(
            "select copy_collection_independent_entries_v1($1,$2,$3) value",
            [randomUUID(), collection, preview.revision],
          )
        ).rows[0].value;
        expect(result.copiedCount).toBe(0);
        const pid = (await editor.query("select pg_backend_pid() id")).rows[0]
          .id;
        pending =
          action === "insert"
            ? editor.query(
                "insert into user_word_list_items(list_id,word_id) values($1,$2)",
                [collection, extra],
              )
            : editor.query(
                "delete from user_word_list_items where list_id=$1 and word_id=$2",
                [collection, original],
              );
        const outcome = pending.then(
          () => true,
          () => false,
        );
        await c.query("reset role");
        let blocked = false;
        for (let i = 0; i < 100; i++) {
          if (
            (
              await c.query(
                "select wait_event_type from pg_stat_activity where pid=$1",
                [pid],
              )
            ).rows[0]?.wait_event_type === "Lock"
          ) {
            blocked = true;
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
        expect(blocked).toBe(true);
        await c.query("commit");
        expect(await outcome).toBe(true);
        const members = (
          await editor.query(
            "select word_id from user_word_list_items where list_id=$1 order by word_id",
            [collection],
          )
        ).rows.map((row) => row.word_id);
        expect(members).toEqual(
          action === "insert" ? [original, extra].sort() : [],
        );
      } finally {
        await c.query("rollback");
        if (pending) await pending.catch(() => undefined);
        c.release();
        editor.release();
        await pool.query("delete from user_word_lists where user_id=$1", [
          owner,
        ]);
        await pool.query(
          "delete from word_entries where dictionary_id in(select id from dictionaries where owner_user_id=$1)",
          [owner],
        );
        await pool.query("delete from auth.users where id=$1", [owner]);
      }
    },
  );
});
