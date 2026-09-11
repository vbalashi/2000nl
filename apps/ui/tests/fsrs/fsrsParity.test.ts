import { describe, expect, test, beforeAll, afterAll } from "vitest";
import { Pool } from "pg";
import { fsrsCompute } from "@/lib/fsrsMath";
import { fsrsCorpus, FsrsHistoryEntry } from "./fsrsCorpus";
import { getDbUrl, runMigrations, withTransaction } from "./dbTestUtils";

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
        const { rows } = await client.query(
          `select fsrs6_compute(
            $1,
            $2,
            case when $3::numeric is null then null else now() - ($3::numeric * interval '1 day') end,
            $4,
            $5,
            $6,
            $7,
            fsrs6_parameters()
          ) as res`,
          [stability, difficulty, stability == null ? null : step.elapsedDays, step.grade, 0.9, reps, lapses]
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
      expect(dbResult.interval!).toBeCloseTo(tsResult.interval!, 4);
      expect(dbResult.stability!).toBeCloseTo(tsResult.stability!, 4);
      expect(dbResult.difficulty!).toBeCloseTo(tsResult.difficulty!, 4);
    }
  );

  const referenceVectors: Record<string, { stability: number; difficulty: number }> = {
    "new-card-again": { stability: 0.212, difficulty: 6.4133 },
    "new-card-hard": { stability: 1.2931, difficulty: 5.112171 },
    "new-card-good": { stability: 2.3065, difficulty: 2.118104 },
    "new-card-easy": { stability: 8.2956, difficulty: 1 },
    "same-day-good-good": { stability: 2.3065, difficulty: 2.111214 },
    "same-day-good-hard": { stability: 1.333379, difficulty: 4.752858 },
    "same-day-good-again": { stability: 0.775084, difficulty: 7.394503 },
    "again-good-same-day": { stability: 0.246689, difficulty: 6.402115 },
  };

  // fsrs-rs v4.1.1 uses the pre-review difficulty for interday stability
  // updates and applies a lower bound to interday Again:
  // max(stability_after_failure, last_stability / exp(w17 * w18)). The
  // current runtime still updates difficulty first and does not apply that
  // Again bound. Keep these vectors explicit so the deviations cannot be
  // mistaken for a reference-parity guarantee.
  const knownReferenceDeviations: Record<
    string,
    {
      reference: { stability: number; difficulty: number };
      observedRuntime: {
        stability: number;
        difficulty: number;
        interval: number;
        reps: number;
        lapses: number;
      };
    }
  > = {
    "existing-memory-again-interday": {
      reference: { stability: 2.195161, difficulty: 7.394503 },
      observedRuntime: {
        stability: 0.5290853688,
        difficulty: 7.3945027413,
        interval: 0.5290853688,
        reps: 2,
        lapses: 1,
      },
    },
    "existing-memory-again-interday-recover": {
      reference: { stability: 4.235313, difficulty: 7.382337 },
      observedRuntime: {
        stability: 2.2750099747,
        difficulty: 7.3823366078,
        interval: 2.2750099747,
        reps: 3,
        lapses: 1,
      },
    },
    "existing-memory-hard-interday-day1": {
      reference: { stability: 5.3187927676, difficulty: 4.7528584882 },
      observedRuntime: {
        stability: 4.4252164464,
        difficulty: 4.7528584882,
        interval: 4.4252164464,
        reps: 2,
        lapses: 0,
      },
    },
    "existing-memory-good-interday-day1": {
      reference: { stability: 7.3153007443, difficulty: 2.1112142353 },
      observedRuntime: {
        stability: 7.3191860981,
        difficulty: 2.1112142353,
        interval: 7.3191860981,
        reps: 2,
        lapses: 0,
      },
    },
    "existing-memory-easy-interday-day1": {
      reference: { stability: 11.6874829141, difficulty: 1 },
      observedRuntime: {
        stability: 12.8684148011,
        difficulty: 1,
        interval: 12.8684148011,
        reps: 2,
        lapses: 0,
      },
    },
    "existing-memory-hard-interday-day5": {
      reference: { stability: 11.8455160319, difficulty: 4.7528584882 },
      observedRuntime: {
        stability: 9.0158312996,
        difficulty: 4.7528584882,
        interval: 9.0158312996,
        reps: 2,
        lapses: 0,
      },
    },
    "existing-memory-good-interday-day5": {
      reference: { stability: 18.1678502359, difficulty: 2.1112142353 },
      observedRuntime: {
        stability: 18.1801539708,
        difficulty: 2.1112142353,
        interval: 18.1801539708,
        reps: 2,
        lapses: 0,
      },
    },
    "existing-memory-easy-interday-day5": {
      reference: { stability: 32.0132228568, difficulty: 1 },
      observedRuntime: {
        stability: 35.7528753645,
        difficulty: 1,
        interval: 35.7528753645,
        reps: 2,
        lapses: 0,
      },
    },
  };

  test.each(Object.entries(referenceVectors))(
    "matches pinned fsrs-rs v4.1.1 vector for %s",
    async (name, expected) => {
      const history = fsrsCorpus.find((candidate) => candidate.name === name)?.history;
      if (!history) throw new Error(`Missing corpus case: ${name}`);
      const tsResult = runTs(history);
      const dbResult = await runDb(history);
      expect(tsResult.stability).toBeCloseTo(expected.stability, 5);
      expect(dbResult.stability!).toBeCloseTo(expected.stability, 5);
      expect(tsResult.difficulty).toBeCloseTo(expected.difficulty, 5);
      expect(dbResult.difficulty!).toBeCloseTo(expected.difficulty, 5);
    },
  );

  test.each(Object.entries(knownReferenceDeviations))(
    "characterizes the documented runtime deviation for %s",
    async (name, expected) => {
      const history = fsrsCorpus.find((candidate) => candidate.name === name)?.history;
      if (!history) throw new Error(`Missing corpus case: ${name}`);
      const tsResult = runTs(history);
      const dbResult = await runDb(history);

      // SQL and TypeScript must continue to agree with each other while both
      // remain visibly different from the pinned reference. This is evidence
      // of a pending product/algorithm decision, not permission to change
      // scheduling semantics in this issue.
      // PostgreSQL returns the JSON state rounded to six decimal places;
      // compare that boundary at five decimal digits while keeping the
      // TypeScript observation pinned more precisely below.
      expect(dbResult.stability!).toBeCloseTo(tsResult.stability!, 5);
      expect(dbResult.difficulty!).toBeCloseTo(tsResult.difficulty!, 5);
      expect(dbResult.interval!).toBeCloseTo(tsResult.interval!, 5);
      expect(dbResult.reps).toBe(tsResult.reps);
      expect(dbResult.lapses).toBe(tsResult.lapses);
      expect(tsResult.stability).toBeCloseTo(expected.observedRuntime.stability, 8);
      expect(tsResult.difficulty).toBeCloseTo(expected.observedRuntime.difficulty, 8);
      expect(tsResult.interval).toBeCloseTo(expected.observedRuntime.interval, 8);
      expect(tsResult.reps).toBe(expected.observedRuntime.reps);
      expect(tsResult.lapses).toBe(expected.observedRuntime.lapses);
      expect(tsResult.stability).not.toBeCloseTo(expected.reference.stability, 5);
      // Difficulty follows the pinned reference; only stability is the
      // observed lower-bound mismatch under characterization.
      expect(tsResult.difficulty).toBeCloseTo(expected.reference.difficulty, 5);
      expect(dbResult.stability).not.toBeCloseTo(expected.reference.stability, 5);
      expect(dbResult.difficulty).toBeCloseTo(expected.reference.difficulty, 5);
    },
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
