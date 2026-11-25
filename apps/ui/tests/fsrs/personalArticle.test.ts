import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { ensureUserWithSettings, getDbUrl, runMigrations, withTransaction } from "./dbTestUtils";

const url = getDbUrl();
(url ? describe : describe.skip)("personal article meanings", () => {
  const pool = new Pool({ connectionString: url });
  beforeAll(() => runMigrations(pool));
  afterAll(() => pool.end());

  test("saving and regrouping keep distinct meanings, progress, and one search hit per definition", async () => {
    const owner = randomUUID();
    await withTransaction(pool, async (client) => {
      await ensureUserWithSettings(client, owner);
      await client.query("set local role authenticated");
      const save = async (senses: unknown[], anchor: string | null = null) => {
        const result = await client.query<{ ids: string[] }>(
          "select save_personal_article_v1('nl','proef','zn',$1::jsonb,$2) ids",
          [JSON.stringify(senses), anchor],
        );
        return result.rows[0].ids;
      };
      const [first, second] = await save([{ definition: "eerste" }, { definition: "tweede" }]);
      const [independent] = await save([{ definition: "derde" }]);
      await client.query("reset role");
      await client.query("insert into user_review_log (user_id,word_id,mode,grade,review_type) values ($1,$2,'word-to-definition',3,'review')", [owner, second]);
      await client.query("set local role authenticated");
      expect(await save([{ entryId: first, definition: "bijgewerkt" }], first)).toEqual([first]);
      await client.query("select move_personal_meaning_v1($1,$2)", [second, independent]);
      await client.query("reset role");
      const stored = await client.query(
        "select e.id, m.id as article, e.raw->>'definition' as definition from word_entries e join private.article_members_v1 m on m.singleton_entry_id=e.id where e.id=any($1::uuid[])",
        [[first, second, independent]],
      );
      const entries = new Map(stored.rows.map((row) => [row.id, row]));
      expect(entries.get(first).definition).toBe("bijgewerkt");
      expect(entries.get(second).definition).toBe("tweede");
      expect(entries.get(second).article).toBe(entries.get(independent).article);
      expect(entries.get(first).article).not.toBe(entries.get(second).article);
      expect((await client.query("select 1 from user_review_log where word_id=$1 and user_id=$2", [second, owner])).rowCount).toBe(1);
      const hits = await client.query("select display_text from dictionary_search_fields where entry_id=$1 and field_group='definition'", [first]);
      expect(hits.rows).toEqual([{ display_text: "bijgewerkt" }]);
    }, owner);
  });
});
