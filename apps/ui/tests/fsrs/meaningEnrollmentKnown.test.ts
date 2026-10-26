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
const url = getDbUrl();
(url ? describe : describe.skip)("Known-safe meaning enrollment", () => {
  const pool = new Pool({ connectionString: url });
  beforeAll(() => runMigrations(pool));
  afterAll(() => pool.end());
  test("enrolls reverse without mutating Known direct or manufacturing a grade", async () => {
    const user = randomUUID();
    await withTransaction(
      pool,
      async (c) => {
        await ensureUserWithSettings(c, user);
        const entry = await insertWord(c, `known-enrollment-${randomUUID()}`);
        await c.query(
          `insert into user_card_status(user_id,entry_id,card_type_id,fsrs_enabled,fsrs_stability,fsrs_difficulty,fsrs_reps,fsrs_last_grade,next_review_at) values($1,$2,'word-to-definition',true,12.4,4.1,5,3,'2026-11-01T00:00:00Z')`,
          [user, entry],
        );
        await c.query(
          `select perform_platform_v2_card_action($1,'mark-known',$2,'word-to-definition',(select state_revision::text from user_card_status where user_id=$1 and entry_id=$2 and card_type_id='word-to-definition'),null,null,null,$3,null,'first_party',null)`,
          [user, entry, randomUUID()],
        );
        const before = await c.query(
          `select to_jsonb(s) as state from user_card_status s where user_id=$1 and entry_id=$2 and card_type_id='word-to-definition'`,
          [user, entry],
        );
        await c.query(
          `select start_learning_entry_card($1,$2,'definition-to-word')`,
          [user, entry],
        );
        const after = await c.query(
          `select to_jsonb(s) as state from user_card_status s where user_id=$1 and entry_id=$2 and card_type_id='word-to-definition'`,
          [user, entry],
        );
        expect(after.rows).toEqual(before.rows);
        const reverse = await c.query(
          `select in_learning,fsrs_reps,fsrs_last_grade,seen_count from user_card_status where user_id=$1 and entry_id=$2 and card_type_id='definition-to-word'`,
          [user, entry],
        );
        expect(reverse.rows[0]).toMatchObject({
          in_learning: true,
          fsrs_reps: 0,
          fsrs_last_grade: null,
          seen_count: 1,
        });
      },
      user,
    );
  });
  test("preserves an already rated sibling schedule and phase", async () => {
    const user = randomUUID();
    await withTransaction(
      pool,
      async (c) => {
        await ensureUserWithSettings(c, user);
        const entry = await insertWord(c, `rated-enrollment-${randomUUID()}`);
        await c.query(
          `insert into user_card_status(user_id,entry_id,card_type_id,fsrs_enabled,fsrs_stability,fsrs_difficulty,fsrs_reps,fsrs_last_grade,next_review_at,in_learning) values($1,$2,'definition-to-word',true,12.4,4.1,5,3,'2026-11-01T00:00:00Z',false)`,
          [user, entry],
        );
        await c.query(
          `select start_learning_entry_card($1,$2,'word-to-definition')`,
          [user, entry],
        );
        const r = await c.query(
          `select in_learning,fsrs_stability::text,fsrs_reps,fsrs_last_grade,next_review_at::text from user_card_status where user_id=$1 and entry_id=$2 and card_type_id='definition-to-word'`,
          [user, entry],
        );
        expect(r.rows[0]).toMatchObject({
          in_learning: false,
          fsrs_stability: "12.4",
          fsrs_reps: 5,
          fsrs_last_grade: 3,
        });
        expect(r.rows[0].next_review_at).toContain("2026-11-01");
      },
      user,
    );
  });
});
