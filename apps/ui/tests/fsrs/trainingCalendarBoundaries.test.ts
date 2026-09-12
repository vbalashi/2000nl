import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { Pool } from "pg";
import { getDbUrl, runMigrations, withTransaction } from "./dbTestUtils";

const dbUrl = getDbUrl();
const describeIfDb = dbUrl ? describe : describe.skip;

describeIfDb("training calendar boundaries", () => {
  const pool = new Pool({ connectionString: dbUrl });

  beforeAll(async () => {
    await runMigrations(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  test("keeps local midnight stable across Europe/Amsterdam DST transitions", async () => {
    const calendarBoundaryCases = [
      ["2026-03-28T22:59:59Z", "2026-03-28"],
      ["2026-03-28T23:00:00Z", "2026-03-29"],
      ["2026-03-29T21:59:59Z", "2026-03-29"],
      ["2026-03-29T22:00:00Z", "2026-03-30"],
      ["2026-10-24T21:59:59Z", "2026-10-24"],
      ["2026-10-24T22:00:00Z", "2026-10-25"],
      ["2026-10-25T22:59:59Z", "2026-10-25"],
      ["2026-10-25T23:00:00Z", "2026-10-26"],
    ] as const;

    await withTransaction(pool, async (client) => {
      for (const [timestamp, expectedDate] of calendarBoundaryCases) {
        const { rows } = await client.query(
          `select to_char(private.training_calendar_local_date_v1(
             $1::timestamptz, 'Europe/Amsterdam'
           ), 'YYYY-MM-DD') as local_date`,
          [timestamp],
        );
        expect(rows[0]?.local_date).toBe(expectedDate);
      }
    });
  });
});
