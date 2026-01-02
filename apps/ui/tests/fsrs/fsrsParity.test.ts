import { describe, expect, test, beforeAll, afterAll } from "vitest";
import { Pool } from "pg";
import { fsrsCompute } from "@/lib/fsrsMath";
import { fsrsCorpus, FsrsHistoryEntry } from "./fsrsCorpus";
import { getDbUrl, runMigrations, ONE_DAY_MS, withTransaction } from "./dbTestUtils";

type TsState = {
  stability: number | null;
  difficulty: number | null;
  interval: number | null;
  lastReview?: number;
  reps?: number;
  lapses?: number;
};

const dbUrl = getDbUrl();
const hasDb = Boolean(dbUrl);

const describeIfDb = hasDb ? describe : describe.skip;

describeIfDb("FSRS parity (TS vs SQL)", () => {
  const pool = new Pool({ connectionString: dbUrl });

  beforeAll(async () => {
    await runMigrations(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  const runTs = (history: FsrsHistoryEntry[]) => {
    let state: TsState = {
      stability: null,
      difficulty: null,
      interval: null,
      reps: 0,
      lapses: 0,
    };

    for (const step of history) {
      const next = fsrsCompute(step.grade, {
        stability: state.stability,
        difficulty: state.difficulty,
        lastReview: state.stability == null ? undefined : step.elapsedDays,
        reps: state.reps,
        lapses: state.lapses,
      });
      state = { ...next, lastReview: step.elapsedDays };
    }
    return state;
  };

  const runDb = async (history: FsrsHistoryEntry[]) => {
    return withTransaction(pool, async (client) => {
      let stability: number | null = null;
      let difficulty: number | null = null;
      let reps: number | null = null;
      let lapses: number | null = null;
      let interval: number | null = null;

      for (const step of history) {
        const lastSeen =
          stability == null ? null : new Date(Date.now() - step.elapsedDays * ONE_DAY_MS);

        const { rows } = await client.query(
          `select fsrs6_compute($1, $2, $3, $4, $5, $6, $7, fsrs6_parameters()) as res`,
          [stability, difficulty, lastSeen, step.grade, 0.9, reps, lapses]
        );

        const res = rows[0].res as any;
        stability = Number(res.stability);
        difficulty = Number(res.difficulty);
        interval = Number(res.interval);
        reps = Number(res.reps);
        lapses = Number(res.lapses);
      }

      return { stability, difficulty, interval, reps, lapses };
    });
  };

  test.each(fsrsCorpus.map((c) => [c.name, c.history]))(
    "matches for %s",
    async (_name, history) => {
      const tsResult = runTs(history);
      const dbResult = await runDb(history);

      expect(dbResult.reps).toBe(tsResult.reps);
      expect(dbResult.lapses).toBe(tsResult.lapses);
      expect(dbResult.interval!).toBeCloseTo(tsResult.interval!, 6);
      expect(dbResult.stability!).toBeCloseTo(tsResult.stability!, 6);
      expect(dbResult.difficulty!).toBeCloseTo(tsResult.difficulty!, 6);
    }
  );
});

if (!hasDb) {
  // Friendly hint when env is missing locally.
  describe("FSRS parity (skipped)", () => {
    test("skips without DB URL", () => {
      expect(getDbUrl()).toBeFalsy();
    });
  });
}
