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
  // approved implementation uses the pre-review difficulty and applies
  // the reference lower bound for interday Again.
  const interdayReferenceVectors: Record<
    string,
    {
      reference: { stability: number; difficulty: number };
      applicationState: {
        reps: number;
        lapses: number;
      };
    }
  > = {
    "existing-memory-again-interday": {
      reference: { stability: 2.195161, difficulty: 7.394503 },
      applicationState: {
        reps: 2,
        lapses: 1,
      },
    },
    "existing-memory-again-interday-recover": {
      reference: { stability: 4.228452, difficulty: 7.382337 },
      applicationState: {
        reps: 3,
        lapses: 1,
      },
    },
    "existing-memory-hard-interday-day1": {
      reference: { stability: 5.3187927676, difficulty: 4.7528584882 },
      applicationState: {
        reps: 2,
        lapses: 0,
      },
    },
    "existing-memory-good-interday-day1": {
      reference: { stability: 7.3153007443, difficulty: 2.1112142353 },
      applicationState: {
        reps: 2,
        lapses: 0,
      },
    },
    "existing-memory-easy-interday-day1": {
      reference: { stability: 11.6874829141, difficulty: 1 },
      applicationState: {
        reps: 2,
        lapses: 0,
      },
    },
    "existing-memory-hard-interday-day5": {
      reference: { stability: 11.8455160319, difficulty: 4.7528584882 },
      applicationState: {
        reps: 2,
        lapses: 0,
      },
    },
    "existing-memory-good-interday-day5": {
      reference: { stability: 18.1678502359, difficulty: 2.1112142353 },
      applicationState: {
        reps: 2,
        lapses: 0,
      },
    },
    "existing-memory-easy-interday-day5": {
      reference: { stability: 32.0132228568, difficulty: 1 },
      applicationState: {
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

  test.each(Object.entries(interdayReferenceVectors))(
    "matches pinned fsrs-rs v4.1.1 interday vector for %s",
    async (name, expected) => {
      const history = fsrsCorpus.find((candidate) => candidate.name === name)?.history;
      if (!history) throw new Error(`Missing corpus case: ${name}`);
      const tsResult = runTs(history);
      const dbResult = await runDb(history);

      // SQL and TypeScript must agree with the pinned reference after the
      // approved interday alignment.
      // PostgreSQL returns the JSON state rounded to six decimal places;
      // compare that boundary at five decimal digits.
      expect(dbResult.stability!).toBeCloseTo(tsResult.stability!, 5);
      expect(dbResult.difficulty!).toBeCloseTo(tsResult.difficulty!, 5);
      expect(dbResult.interval!).toBeCloseTo(tsResult.interval!, 5);
      expect(dbResult.reps).toBe(tsResult.reps);
      expect(dbResult.lapses).toBe(tsResult.lapses);
      expect(tsResult.stability).toBeCloseTo(expected.reference.stability, 5);
      expect(tsResult.difficulty).toBeCloseTo(expected.reference.difficulty, 5);
      expect(tsResult.interval).toBeCloseTo(expected.reference.stability, 5);
      expect(tsResult.reps).toBe(expected.applicationState.reps);
      expect(tsResult.lapses).toBe(expected.applicationState.lapses);
      expect(dbResult.stability).toBeCloseTo(expected.reference.stability, 5);
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
