import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { randomUUID } from "crypto";
import { Pool } from "pg";
import { getDbUrl, runMigrations, withTransaction } from "./dbTestUtils";
const databaseUrl = getDbUrl();
const describeDb = databaseUrl ? describe : describe.skip;
describeDb("Card spacing storage", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  beforeAll(async () => {
    await runMigrations(pool);
  });
  afterAll(async () => {
    await pool.end();
  });
  test("preserves default and other settings, permits Airy only on the owned row", async () => {
    await withTransaction(pool, async (client) => {
      const owner = randomUUID(),
        other = randomUUID();
      await client.query(
        "insert into auth.users(id,email) values($1,$2),($3,$4)",
        [owner, `${owner}@test.local`, other, `${other}@test.local`],
      );
      await client.query("set local role authenticated");
      await client.query("select set_config('request.jwt.claim.sub',$1,true)", [
        owner,
      ]);
      const before = await client.query(
        "select card_spacing,theme_preference,reading_size_phone from user_settings where user_id=$1",
        [owner],
      );
      expect(before.rows[0].card_spacing).toBe("balanced");
      await client.query(
        "update user_settings set card_spacing='airy' where user_id=$1",
        [owner],
      );
      const after = await client.query(
        "select card_spacing,theme_preference,reading_size_phone from user_settings where user_id=$1",
        [owner],
      );
      expect(after.rows[0]).toEqual({
        ...before.rows[0],
        card_spacing: "airy",
      });
      const foreign = await client.query(
        "update user_settings set card_spacing='airy' where user_id=$1",
        [other],
      );
      expect(foreign.rowCount).toBe(0);
      for (const palette of ["airy", "balanced"])
        await client.query(
          "update user_settings set card_spacing=$2 where user_id=$1",
          [owner, palette],
        );
      await client.query("savepoint invalid_spacing");
      await expect(
        client.query(
          "update user_settings set card_spacing='not-a-spacing' where user_id=$1",
          [owner],
        ),
      ).rejects.toMatchObject({ code: "23514" });
      await client.query("rollback to savepoint invalid_spacing");
    });
  });
});
