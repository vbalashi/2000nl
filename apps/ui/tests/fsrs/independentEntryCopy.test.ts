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
async function source(c: PoolClient, owner: string) {
  await ensureUserWithSettings(c, owner);
  const raw = {
    headword: "kopie",
    languageCode: "nl",
    meanings: [
      { definition: "one", examples: ["first example"] },
      { definition: "two" },
    ],
    notes: "instruction",
  };
  const entry = (
    await c.query("select create_user_dictionary_entry($1,null,$2) id", [
      owner,
      raw,
    ])
  ).rows[0].id;
  await c.query(
    "insert into user_word_notes(user_id,word_entry_id,notes) values($1,$2,'overlay')",
    [owner, entry],
  );
  return entry;
}
(url ? describe : describe.skip)("independent rich entry copy", () => {
  const pool = new Pool({ connectionString: url });
  beforeAll(() => runMigrations(pool));
  afterAll(() => pool.end());
  test("fresh identities, full content, no progress, receipt replay survives source archive", async () => {
    const owner = randomUUID();
    await withTransaction(
      pool,
      async (c) => {
        const original = await source(c, owner);
        const operation = randomUUID();
        await c.query("set local role authenticated");
        const preview = (
          await c.query("select preview_independent_entry_copy_v1($1) value", [
            original,
          ])
        ).rows[0].value;
        expect(preview).toMatchObject({
          headword: "kopie",
          meaningCount: 2,
          sourceDictionaryName: "My dictionary",
        });
        const args = [operation, original, preview.revision];
        const result = (
          await c.query(
            "select copy_independent_entry_v1($1,$2,$3) value",
            args,
          )
        ).rows[0].value;
        expect(result.entryId).not.toBe(original);
        const another = (
          await c.query("select copy_independent_entry_v1($1,$2,$3) value", [
            randomUUID(),
            original,
            preview.revision,
          ])
        ).rows[0].value;
        expect(another.entryId).not.toBe(result.entryId);
        await c.query("select delete_user_dictionary_entry($1,$2)", [
          owner,
          original,
        ]);
        expect(
          (
            await c.query(
              "select copy_independent_entry_v1($1,$2,$3) value",
              args,
            )
          ).rows[0].value,
        ).toEqual(result);
        expect(
          (
            await c.query(
              "select read_independent_entry_copy_receipt_v1($1) value",
              [operation],
            )
          ).rows[0].value,
        ).toEqual(result);
        await c.query("reset role");
        const copied = (
          await c.query("select raw from word_entries where id=$1", [
            result.entryId,
          ])
        ).rows[0].raw;
        expect(copied.meanings).toEqual([
          { definition: "one", examples: ["first example"] },
          { definition: "two" },
        ]);
        expect(copied.notes).toBe("instruction\n\noverlay");
        expect(copied).not.toHaveProperty("sourceEntryId");
        expect(
          (
            await c.query(
              "select count(*)::int n from user_review_log where word_id=$1",
              [result.entryId],
            )
          ).rows[0].n,
        ).toBe(0);
      },
      owner,
    );
  });
  test("legacy copy retries retain one rich copy and never overwrite a same-headword article", async () => {
    const owner = randomUUID();
    await withTransaction(
      pool,
      async (c) => {
        const original = await source(c, owner);
        const before = (
          await c.query("select raw from word_entries where id=$1", [original])
        ).rows[0].raw;
        await c.query("set local role authenticated");
        const copied = (
          await c.query(
            "select copy_entry_to_user_dictionary($1,$2,null,'{}') id",
            [owner, original],
          )
        ).rows[0].id;
        expect(copied).not.toBe(original);
        expect(
          (
            await c.query(
              "select copy_entry_to_user_dictionary($1,$2,null,'{}') id",
              [owner, original],
            )
          ).rows[0].id,
        ).toBe(copied);
        await c.query("reset role");
        expect(
          (
            await c.query("select raw from word_entries where id=$1", [
              original,
            ])
          ).rows[0].raw,
        ).toEqual(before);
        expect(
          (await c.query("select raw from word_entries where id=$1", [copied]))
            .rows[0].raw.meanings,
        ).toEqual(before.meanings);
      },
      owner,
    );
  });

  test("public hybrid parser content survives the complete authorized copy command", async () => {
    const owner = randomUUID();
    await withTransaction(
      pool,
      async (c) => {
        await ensureUserWithSettings(c, owner);
        const dictionary = (
          await c.query(
            "insert into dictionaries(language_code,slug,name,kind,visibility,publication_state,is_editable) values('nl',$1,'Hybrid public source','curated','public','general',false) returning id",
            [`hybrid-${randomUUID()}`],
          )
        ).rows[0].id;
        const original = (
          await c.query(
            "insert into word_entries(dictionary_id,language_code,headword,meaning_id,raw) values($1,'nl','hybride',1,$2) returning id",
            [
              dictionary,
              {
                definition: "visible legacy definition",
                example: {
                  source: "legacy example",
                  translation: "translated example",
                },
                meanings: [{ translations: { en: "word" } }],
              },
            ],
          )
        ).rows[0].id;
        await c.query("set local role authenticated");
        const preview = (
          await c.query("select preview_independent_entry_copy_v1($1) value", [
            original,
          ])
        ).rows[0].value;
        const copied = (
          await c.query("select copy_independent_entry_v1($1,$2,$3) value", [
            randomUUID(),
            original,
            preview.revision,
          ])
        ).rows[0].value;
        await c.query("reset role");
        const raw = (
          await c.query("select raw from word_entries where id=$1", [
            copied.entryId,
          ])
        ).rows[0].raw;
        expect(raw.meanings[0]).toMatchObject({
          definition: "visible legacy definition",
          examples: ["legacy example"],
          translations: { en: "word" },
        });
        expect(raw.example.translation).toBe("translated example");
      },
      owner,
    );
  });

  test("an overlay edit invalidates preview and never creates a partial copy", async () => {
    const owner = randomUUID();
    await withTransaction(
      pool,
      async (c) => {
        const original = await source(c, owner);
        const revision = (
          await c.query("select preview_independent_entry_copy_v1($1) value", [
            original,
          ])
        ).rows[0].value.revision;
        await c.query(
          "update user_word_notes set notes='new overlay' where word_entry_id=$1",
          [original],
        );
        await c.query("savepoint stale");
        await expect(
          c.query("select copy_independent_entry_v1($1,$2,$3)", [
            randomUUID(),
            original,
            revision,
          ]),
        ).rejects.toThrow("copy_source_changed");
        await c.query("rollback to savepoint stale");
        expect(
          (
            await c.query(
              "select count(*)::int n from private.independent_entry_copy_receipts where user_id=$1",
              [owner],
            )
          ).rows[0].n,
        ).toBe(0);
      },
      owner,
    );
  });
  test("foreign private articles and another user's receipts are inaccessible", async () => {
    const owner = randomUUID(),
      other = randomUUID();
    await withTransaction(
      pool,
      async (c) => {
        const original = await source(c, owner);
        await ensureUserWithSettings(c, other);
        await c.query("select set_config('request.jwt.claim.sub',$1,true)", [
          other,
        ]);
        await c.query("set local role authenticated");
        await c.query("savepoint denied");
        await expect(
          c.query("select preview_independent_entry_copy_v1($1)", [original]),
        ).rejects.toThrow("copy_source_unavailable");
        await c.query("rollback to savepoint denied");
        expect(
          (
            await c.query(
              "select read_independent_entry_copy_receipt_v1($1) value",
              [randomUUID()],
            )
          ).rows[0].value.status,
        ).toBe("unknown");
      },
      owner,
    );
  });
});

(url ? describe : describe.skip)(
  "independent copy concurrent snapshots",
  () => {
    const pool = new Pool({ connectionString: url });
    beforeAll(() => runMigrations(pool));
    afterAll(() => pool.end());
    async function cleanupOwners(owners: string[]) {
      await pool.query(
        "delete from word_entries where dictionary_id in (select id from dictionaries where owner_user_id=any($1::uuid[]))",
        [owners],
      );
      await pool.query("delete from auth.users where id=any($1::uuid[])", [
        owners,
      ]);
    }
    async function committedSource() {
      const c = await pool.connect(),
        owner = randomUUID();
      try {
        await c.query("begin");
        await c.query("select set_config('request.jwt.claim.sub',$1,true)", [
          owner,
        ]);
        const entry = await source(c, owner);
        await c.query("commit");
        return { owner, entry };
      } catch (error) {
        await c.query("rollback");
        throw error;
      } finally {
        c.release();
      }
    }
    async function waitForLock(c: PoolClient, pid: number) {
      for (let i = 0; i < 100; i++) {
        const row = (
          await c.query(
            "select wait_event_type from pg_stat_activity where pid=$1",
            [pid],
          )
        ).rows[0];
        if (row?.wait_event_type === "Lock") return;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      throw new Error("copy did not wait for the concurrent writer");
    }
    test("note edit committed during copy invalidates the snapshot without a partial result", async () => {
      const f = await committedSource(),
        editor = await pool.connect(),
        copier = await pool.connect();
      let pending: Promise<unknown> | undefined;
      try {
        await copier.query(
          "select set_config('request.jwt.claim.sub',$1,false)",
          [f.owner],
        );
        const revision = (
          await copier.query(
            "select preview_independent_entry_copy_v1($1) value",
            [f.entry],
          )
        ).rows[0].value.revision;
        await editor.query("begin");
        await editor.query(
          "update user_word_notes set notes='concurrent note' where word_entry_id=$1",
          [f.entry],
        );
        const pid = (await copier.query("select pg_backend_pid() id")).rows[0]
          .id;
        pending = copier.query("select copy_independent_entry_v1($1,$2,$3)", [
          randomUUID(),
          f.entry,
          revision,
        ]);
        // Attach a rejection handler immediately while the assertion waits for the lock.
        const outcome = pending.then(
          () => "committed",
          (error) => (error as Error).message,
        );
        await waitForLock(editor, pid);
        await editor.query("commit");
        expect(await outcome).toBe("copy_source_changed");
        expect(
          (
            await copier.query(
              "select count(*)::int n from private.independent_entry_copy_receipts where user_id=$1",
              [f.owner],
            )
          ).rows[0].n,
        ).toBe(0);
      } finally {
        await editor.query("rollback");
        if (pending) await pending.catch(() => undefined);
        editor.release();
        copier.release();
        await cleanupOwners([f.owner]);
      }
    });
    test("a source edit waits for an in-flight atomic copy and cannot change its content", async () => {
      const f = await committedSource(),
        copier = await pool.connect(),
        editor = await pool.connect();
      let pending: Promise<unknown> | undefined;
      try {
        await copier.query("begin");
        await copier.query(
          "select set_config('request.jwt.claim.sub',$1,true)",
          [f.owner],
        );
        const revision = (
          await copier.query(
            "select preview_independent_entry_copy_v1($1) value",
            [f.entry],
          )
        ).rows[0].value.revision;
        const result = (
          await copier.query(
            "select copy_independent_entry_v1($1,$2,$3) value",
            [randomUUID(), f.entry, revision],
          )
        ).rows[0].value;
        const pid = (await editor.query("select pg_backend_pid() id")).rows[0]
          .id;
        pending = editor.query(
          "update word_entries set raw=jsonb_set(raw,'{meanings,0,definition}','\"changed later\"') where id=$1",
          [f.entry],
        );
        const outcome = pending.then(
          () => "updated",
          (error) => (error as Error).message,
        );
        await waitForLock(copier, pid);
        await copier.query("commit");
        expect(await outcome).toBe("updated");
        const copied = (
          await editor.query("select raw from word_entries where id=$1", [
            result.entryId,
          ])
        ).rows[0].raw;
        expect(copied.meanings[0].definition).toBe("one");
        const ids = (
          await editor.query(
            "select entry_id,id from private.platform_v2_content_nodes where entry_id=any($1::uuid[])",
            [[f.entry, result.entryId]],
          )
        ).rows;
        const original = new Set(
          ids.filter((row) => row.entry_id === f.entry).map((row) => row.id),
        );
        const target = ids.filter((row) => row.entry_id === result.entryId);
        expect(target.length).toBeGreaterThan(2);
        expect(target.every((row) => !original.has(row.id))).toBe(true);
      } finally {
        await copier.query("rollback");
        if (pending) await pending.catch(() => undefined);
        copier.release();
        editor.release();
        await cleanupOwners([f.owner]);
      }
    });
    test("public source revocation preserves the copy and never imports another user's overlay", async () => {
      const f = await committedSource(),
        recipient = randomUUID(),
        c = await pool.connect();
      try {
        await ensureUserWithSettings(c, recipient);
        const dictionary = (
          await c.query("select dictionary_id from word_entries where id=$1", [
            f.entry,
          ])
        ).rows[0].dictionary_id;
        await c.query(
          "update dictionaries set kind='curated',publication_state='general' where id=$1",
          [dictionary],
        );
        await c.query("select set_config('request.jwt.claim.sub',$1,false)", [
          recipient,
        ]);
        const preview = (
          await c.query("select preview_independent_entry_copy_v1($1) value", [
            f.entry,
          ])
        ).rows[0].value;
        const operation = randomUUID(),
          args = [operation, f.entry, preview.revision];
        const result = (
          await c.query(
            "select copy_independent_entry_v1($1,$2,$3) value",
            args,
          )
        ).rows[0].value;
        await c.query(
          "update dictionaries set publication_state='unpublished' where id=$1",
          [dictionary],
        );
        expect(
          (
            await c.query(
              "select copy_independent_entry_v1($1,$2,$3) value",
              args,
            )
          ).rows[0].value,
        ).toEqual(result);
        const raw = (
          await c.query("select raw from word_entries where id=$1", [
            result.entryId,
          ])
        ).rows[0].raw;
        expect(raw.notes).toBe("instruction");
        await c.query("set role authenticated");
        await expect(
          c.query("select preview_independent_entry_copy_v1($1)", [f.entry]),
        ).rejects.toThrow("copy_source_unavailable");
      } finally {
        await c.query("reset role");
        c.release();
        await cleanupOwners([f.owner, recipient]);
      }
    });
  },
);
