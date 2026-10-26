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
(url ? describe : describe.skip)("Meaning progress and atomic resume", () => {
  const pool = new Pool({ connectionString: url });
  beforeAll(() => runMigrations(pool));
  afterAll(() => pool.end());
  test("resumes both directional Known marks, preserves FSRS and retries once", async () => {
    const user = randomUUID();
    await withTransaction(
      pool,
      async (c) => {
        await ensureUserWithSettings(c, user);
        const entry = await insertWord(c, `resume-${randomUUID()}`);
        await c.query(
          `insert into user_card_status(user_id,entry_id,card_type_id,fsrs_enabled,fsrs_stability,fsrs_difficulty,fsrs_reps,fsrs_last_grade,next_review_at,seen_count) values($1,$2,'word-to-definition',true,12.4,4.1,5,3,'2026-11-01T00:00:00Z',8)`,
          [user, entry],
        );
        for (const type of ["word-to-definition", "definition-to-word"]) {
          await c.query(
            `select perform_platform_v2_card_action($1,'mark-known',$2,$3,COALESCE((select state_revision::text from user_card_status where user_id=$1 and entry_id=$2 and card_type_id=$3),'untracked'),null,null,null,$4,null,'first_party',null)`,
            [user, entry, type, randomUUID()],
          );
        }
        const before = (
          await c.query(
            "select get_meaning_learning_progress_v1($1) progress",
            [entry],
          )
        ).rows[0].progress;
        expect(before.directions).toHaveLength(2);
        expect(
          before.directions.every(
            (d: { knownMarkId: string }) => d.knownMarkId,
          ),
        ).toBe(true);
        await c.query(
          "select set_config('request.jwt.claim.role','service_role',true)",
        );
        const event = randomUUID();
        const call = () =>
          c.query(
            "select resume_meaning_learning_as_principal_v1($1,$2,$3,$4) result",
            [user, entry, before.revision, event],
          );
        const result = (await call()).rows[0].result;
        expect(result.status).toBe("accepted");
        expect(
          result.progress.directions.every(
            (d: { knownMarkId: string | null }) => !d.knownMarkId,
          ),
        ).toBe(true);
        expect(
          result.progress.directions.find(
            (d: { cardTypeId: string }) =>
              d.cardTypeId === "word-to-definition",
          ),
        ).toMatchObject({
          gradedAttempts: 5,
          presentations: 8,
          stability: 12.4,
          difficulty: 4.1,
          lastGrade: 3,
        });
        expect(
          result.progress.directions.find(
            (d: { cardTypeId: string }) =>
              d.cardTypeId === "definition-to-word",
          ),
        ).toMatchObject({
          gradedAttempts: 0,
          phase: "learning",
          lastGrade: null,
        });
        expect((await call()).rows[0].result).toMatchObject({
          status: "duplicate",
          progress: result.progress,
        });
        expect(
          (
            await c.query(
              "select count(*)::int n from user_review_log where user_id=$1",
              [user],
            )
          ).rows[0].n,
        ).toBe(0);
        await c.query("savepoint stale");
        await expect(
          c.query(
            "select resume_meaning_learning_as_principal_v1($1,$2,$3,$4)",
            [user, entry, before.revision, randomUUID()],
          ),
        ).rejects.toThrow("meaning_progress_conflict");
        await c.query("rollback to savepoint stale");
      },
      user,
    );
  });
  test("denies cross-account progress reads and client-side principal mutations", async () => {
    const user = randomUUID();
    await withTransaction(
      pool,
      async (c) => {
        await ensureUserWithSettings(c, user);
        const entry = await insertWord(c, `resume-auth-${randomUUID()}`);
        await c.query("savepoint denied");
        await expect(
          c.query(
            "select resume_meaning_learning_as_principal_v1($1,$2,$3,$4)",
            [user, entry, "stale", randomUUID()],
          ),
        ).rejects.toThrow("unauthorized");
        await c.query("rollback to savepoint denied");
        await c.query("select set_config('request.jwt.claim.sub','',true)");
        await c.query("savepoint anonymous");
        await expect(
          c.query("select get_meaning_learning_progress_v1($1)", [entry]),
        ).rejects.toThrow("unauthorized");
        await c.query("rollback to savepoint anonymous");
      },
      user,
    );
  });
});
