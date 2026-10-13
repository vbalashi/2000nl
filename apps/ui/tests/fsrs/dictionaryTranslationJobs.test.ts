import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import {
  getDbUrl,
  insertWord,
  runMigrations,
  withTransaction,
} from "./dbTestUtils";

const dbUrl = getDbUrl();
const describeIfDb = dbUrl ? describe : describe.skip;
const enqueueSql = `select * from enqueue_dictionary_translation_job_v1($1,'ru','openai',$2,'source','policy','prompt',$3,$4)`;
async function enqueue(
  client: PoolClient,
  entryId: string,
  fingerprint = "one",
  priority = 0,
  retry = false,
) {
  return (
    await client.query(enqueueSql, [entryId, fingerprint, priority, retry])
  ).rows[0];
}
async function claim(client: PoolClient) {
  return (
    await client.query("select * from claim_dictionary_translation_job_v1()")
  ).rows[0];
}

describeIfDb("durable dictionary translation jobs", () => {
  const pool = new Pool({ connectionString: dbUrl });
  beforeAll(async () => {
    await runMigrations(pool);
  });
  afterAll(async () => {
    await pool.end();
  });

  test("successful parts survive continuation and stale/expired/source-changed owners cannot save", async () => {
    await withTransaction(pool, async client => {
      const entry=await insertWord(client, `parts-${randomUUID()}`);await enqueue(client,entry,"parts",10);
      const job=await claim(client);
      const save=async(token:string,key:string,continuing=true)=>(await client.query("select checkpoint_dictionary_translation_part_v1($1,$2,$3,$4,$5,$6) as saved",[job.id,token,key,"a".repeat(64),JSON.stringify({entryTranslation:null,contentTranslations:[]}),continuing])).rows[0].saved;
      expect(await save(randomUUID(),"stale")).toBe(false);
      expect(await save(job.lease_token,"part:0")).toBe(true);
      const resumed=await claim(client);expect(resumed.id).toBe(job.id);expect(resumed.attempt).toBe(1);
      expect((await client.query("select count(*)::int as n from dictionary_translation_job_parts where job_id=$1",[job.id])).rows[0].n).toBe(1);
      expect(await save(job.lease_token,"old")).toBe(false);
      await client.query("update dictionary_translation_jobs set lease_expires_at=clock_timestamp()-interval '1 second' where id=$1",[job.id]);
      expect(await save(resumed.lease_token,"expired")).toBe(false);
      await client.query("update dictionary_translation_jobs set lease_expires_at=clock_timestamp()+interval '1 minute' where id=$1",[job.id]);
      await client.query("update word_entries set headword=headword||'-changed' where id=$1",[entry]);
      expect(await save(resumed.lease_token,"changed")).toBe(false);
      expect((await client.query("select count(*)::int as n from dictionary_translation_job_parts where job_id=$1",[job.id])).rows[0].n).toBe(1);
    });
  });
  test("speculative jobs reserve capacity for a foreground request", async () => {
    await withTransaction(pool, async (client) => {
      const first = await insertWord(client, `buffer-${randomUUID()}`);
      const second = await insertWord(client, `buffer-${randomUUID()}`);
      const visible = await insertWord(client, `visible-${randomUUID()}`);
      await enqueue(client, first);
      await enqueue(client, second);
      expect((await claim(client)).word_entry_id).toBe(first);
      expect(await claim(client)).toBeUndefined();
      await enqueue(client, visible, "one", 10);
      expect((await claim(client)).word_entry_id).toBe(visible);
      expect(await claim(client)).toBeUndefined();
    });
  });

  test("duplicate observations preserve attempt/backoff and foreground requests promote priority", async () => {
    await withTransaction(pool, async (client) => {
      const entry = await insertWord(client, `job-${randomUUID()}`);
      const first = await enqueue(client, entry);
      const duplicate = await enqueue(client, entry, "one", 10);
      expect(duplicate.id).toBe(first.id);
      expect(duplicate.priority).toBe(10);
      const running = await claim(client);
      expect(running.id).toBe(first.id);
      expect(running.attempt).toBe(1);
      expect((await enqueue(client, entry)).status).toBe("running");
      expect(
        (
          await client.query(
            "select fail_dictionary_translation_job_v1($1,$2,'provider_network_error',true) result",
            [running.id, running.lease_token],
          )
        ).rows[0].result,
      ).toBe(true);
      const retried = await enqueue(client, entry, "one", 10);
      expect(retried.attempt).toBe(1);
      expect(retried.available_at.getTime()).toBeGreaterThan(Date.now());
      expect(await claim(client)).toBeUndefined();
    });
  });

  test("expired attempts recover, late heartbeat/publication are rejected, and completion is atomic", async () => {
    await withTransaction(pool, async (client) => {
      const entry = await insertWord(client, `job-${randomUUID()}`);
      const job = await enqueue(client, entry);
      const old = await claim(client);
      await client.query(
        "update dictionary_translation_jobs set lease_expires_at=clock_timestamp()-interval '1 second' where id=$1",
        [job.id],
      );
      expect(
        (
          await client.query(
            "select heartbeat_dictionary_translation_job_v1($1,$2) result",
            [old.id, old.lease_token],
          )
        ).rows[0].result,
      ).toBe(false);
      expect(await claim(client)).toBeUndefined(); // recovered, delayed retry
      await client.query(
        "update dictionary_translation_jobs set available_at=clock_timestamp()-interval '1 second' where id=$1",
        [job.id],
      );
      const next = await claim(client);
      expect(next.attempt).toBe(2);
      expect(next.lease_token).not.toBe(old.lease_token);
      const publish = (token: string, text: string) =>
        client.query(
          "select complete_dictionary_translation_job_v1($1,$2,$3::jsonb,null) result",
          [
            job.id,
            token,
            JSON.stringify({
              headword: text,
              meanings: [{ definition: text }],
            }),
          ],
        );
      expect((await publish(old.lease_token, "late")).rows[0].result).toBe(
        false,
      );
      expect((await publish(next.lease_token, "current")).rows[0].result).toBe(
        true,
      );
      expect(
        (await publish(next.lease_token, "duplicate")).rows[0].result,
      ).toBe(false);
      expect(
        (
          await client.query(
            "select overlay from word_entry_translations where word_entry_id=$1",
            [entry],
          )
        ).rows[0].overlay.headword,
      ).toBe("current");
      expect((await enqueue(client, entry)).status).toBe("ready");
    });
  });

  test("a source revision supersedes work and fences the old owner", async () => {
    await withTransaction(pool, async (client) => {
      const entry = await insertWord(client, `job-${randomUUID()}`);
      await enqueue(client, entry);
      const old = await claim(client);
      const fresh = await enqueue(client, entry, "two", 10);
      expect(fresh.id).not.toBe(old.id);
      expect(
        (
          await client.query(
            "select heartbeat_dictionary_translation_job_v1($1,$2) result",
            [old.id, old.lease_token],
          )
        ).rows[0].result,
      ).toBe(false);
      expect(
        (
          await client.query(
            "select complete_dictionary_translation_job_v1($1,$2,'{}',null) result",
            [old.id, old.lease_token],
          )
        ).rows[0].result,
      ).toBe(false);
      expect((await claim(client)).id).toBe(fresh.id);
    });
  });

  test("three interrupted attempts exhaust; polling never resets them", async () => {
    await withTransaction(pool, async (client) => {
      const entry = await insertWord(client, `job-${randomUUID()}`);
      const job = await enqueue(client, entry);
      for (let i = 1; i <= 3; i++) {
        const running = await claim(client);
        expect(running.attempt).toBe(i);
        await client.query(
          "update dictionary_translation_jobs set lease_expires_at=clock_timestamp()-interval '1 second' where id=$1",
          [job.id],
        );
        await claim(client);
        await client.query(
          "update dictionary_translation_jobs set available_at=clock_timestamp()-interval '1 second' where id=$1",
          [job.id],
        );
      }
      expect((await enqueue(client, entry)).status).toBe("failed");
      expect((await enqueue(client, entry, "one", 10, true)).status).toBe(
        "failed",
      );
      await client.query(
        "update dictionary_translation_jobs set finished_at=clock_timestamp()-interval '2 minutes' where id=$1",
        [job.id],
      );
      expect((await enqueue(client, entry, "one", 10, true)).attempt).toBe(0);
      expect((await claim(client)).attempt).toBe(1);
    });
  });

  test("concurrent callers deduplicate and workers respect the global limit", async () => {
    const clients = await Promise.all(
      Array.from({ length: 4 }, () => pool.connect()),
    );
    const entries: string[] = [];
    try {
      for (const client of clients)
        entries.push(
          await insertWord(client, `concurrent-job-${randomUUID()}`),
        );
      const duplicates = await Promise.all(
        clients.map((client) => enqueue(client, entries[0], "one", 10)),
      );
      expect(new Set(duplicates.map((job) => job.id)).size).toBe(1);
      await Promise.all(
        clients.slice(1).map((client, i) => enqueue(client, entries[i + 1], "one", 10)),
      );
      const claims = (
        await Promise.all(clients.map((client) => claim(client)))
      ).filter(Boolean);
      expect(claims).toHaveLength(2);
      expect(new Set(claims.map((job) => job.id)).size).toBe(2);
      expect(await claim(clients[0])).toBeUndefined();
    } finally {
      await clients[0].query(
        "delete from word_entries where id=any($1::uuid[])",
        [entries],
      );
      clients.forEach((client) => client.release());
    }
  });

  test.each(["heartbeat", "complete", "fail"])(
    "%s rechecks expiry after waiting for a row lock",
    async (operation) => {
      const locker = await pool.connect();
      const worker = await pool.connect();
      let entry: string | undefined;
      try {
        entry = await insertWord(locker, `locked-job-${randomUUID()}`);
        await enqueue(locker, entry);
        const running = await claim(locker);
        await locker.query(
          "update dictionary_translation_jobs set lease_expires_at=clock_timestamp()+interval '100 milliseconds' where id=$1",
          [running.id],
        );
        await locker.query("begin");
        await locker.query(
          "select id from dictionary_translation_jobs where id=$1 for update",
          [running.id],
        );
        const sql =
          operation === "heartbeat"
            ? "select heartbeat_dictionary_translation_job_v1($1,$2) result"
            : operation === "complete"
              ? "select complete_dictionary_translation_job_v1($1,$2,'{}',null) result"
              : "select fail_dictionary_translation_job_v1($1,$2,'provider_timeout',true) result";
        const pending = worker.query(sql, [running.id, running.lease_token]);
        await locker.query("select pg_sleep(0.2)");
        await locker.query("commit");
        expect((await pending).rows[0].result).toBe(false);
      } finally {
        await locker.query("rollback");
        if (entry)
          await locker.query("delete from word_entries where id=$1", [entry]);
        locker.release();
        worker.release();
      }
    },
  );

  test("source edits fence publication even without a newer enqueue", async () => {
    await withTransaction(pool, async (client) => {
      const entry = await insertWord(client, `source-edit-${randomUUID()}`);
      const job = await enqueue(client, entry);
      const running = await claim(client);
      await client.query(
        "update word_entries set raw=$2::jsonb where id=$1",
        [entry, JSON.stringify({meanings:[{definition:"changed source"}]})],
      );
      expect(
        (
          await client.query(
            "select complete_dictionary_translation_job_v1($1,$2,'{}',null) result",
            [job.id, running.lease_token],
          )
        ).rows[0].result,
      ).toBe(false);
      expect(
        (
          await client.query(
            "select status,error_code from dictionary_translation_jobs where id=$1",
            [job.id],
          )
        ).rows[0],
      ).toEqual({ status: "superseded", error_code: "source_changed" });
      expect(
        (
          await client.query(
            "select count(*)::int n from word_entry_translations where word_entry_id=$1",
            [entry],
          )
        ).rows[0].n,
      ).toBe(0);
      const replacement = await enqueue(client, entry); // same mocked content fingerprint, different SQL source revision
      expect(replacement.id).not.toBe(job.id);
      expect(replacement.source_row_revision).not.toBe(job.source_row_revision);
    });
  });

  test("an enqueue that observed the pre-completion cache cannot restart a ready job", async () => {
    await withTransaction(pool, async (client) => {
      const entry = await insertWord(client, `ready-race-${randomUUID()}`);
      const job = await enqueue(client, entry);
      const running = await claim(client);
      await client.query(
        'select complete_dictionary_translation_job_v1($1,$2,\'{"headword":"translation"}\',null)',
        [job.id, running.lease_token],
      );
      const refresh = (revision: Date | null) =>
        client.query(
          "select * from enqueue_dictionary_translation_job_v1($1,'ru','openai','one','source','policy','prompt',10,false,true,$2)",
          [entry, revision],
        );
      expect((await refresh(null)).rows[0].status).toBe("ready");
      const cache = (
        await client.query(
          "select updated_at from word_entry_translations where word_entry_id=$1",
          [entry],
        )
      ).rows[0];
      // Pass the original microsecond timestamp as text, not JS Date's truncated milliseconds.
      const revision = (
        await client.query(
          "select updated_at::text revision from word_entry_translations where word_entry_id=$1",
          [entry],
        )
      ).rows[0].revision;
      expect(cache.updated_at).toBeTruthy();
      expect((await refresh(revision)).rows[0].status).toBe("queued");
    });
  });

  test("queue tables and RPCs are inaccessible to client roles", async () => {
    for (const role of ["anon", "authenticated"]) {
      const { rows } = await pool.query(
        `select has_table_privilege($1,'public.dictionary_translation_jobs','select') table_read,
        has_function_privilege($1,'public.claim_dictionary_translation_job_v1()','execute') claim,
        has_function_privilege($1,'public.dictionary_translation_source_v1(uuid)','execute') source,
        has_function_privilege($1,'public.enqueue_dictionary_translation_job_v1(uuid,text,text,text,text,text,text,integer,boolean,boolean,timestamptz)','execute') enqueue,
        has_table_privilege($1,'public.dictionary_translation_job_parts','select') parts_read,
        has_function_privilege($1,'public.checkpoint_dictionary_translation_part_v1(uuid,uuid,text,text,jsonb,boolean)','execute') checkpoint`,
        [role],
      );
      expect(rows[0]).toEqual({
        table_read: false,
        claim: false,
        source: false,
        enqueue: false,
        parts_read: false,
        checkpoint: false,
      });
    }
  });
});
