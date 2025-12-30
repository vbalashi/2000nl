import { describe, expect, test } from "vitest";
import { fsrsCompute, fsrs6Defaults } from "@/lib/fsrsMath";

describe("fsrsCompute", () => {
  test("initializes new card with grade=good", () => {
    const result = fsrsCompute(3, { stability: null, difficulty: null });
    expect(result.stability).toBeCloseTo(fsrs6Defaults[2], 4);
    expect(result.difficulty).toBeGreaterThan(1);
    expect(result.interval).toBeGreaterThan(0);
  });

  test("lapse (grade=1) reduces stability and increments lapses", () => {
    const start = { stability: 5, difficulty: 5, lastReview: 2, lapses: 0, reps: 3 };
    const result = fsrsCompute(1, start);
    expect(result.stability).toBeLessThan(start.stability);
    expect(result.lapses).toBe(start.lapses + 1);
  });

  test("easy (grade=4) increases stability and interval", () => {
    const start = { stability: 5, difficulty: 5, lastReview: 3, lapses: 0, reps: 3 };
    const result = fsrsCompute(4, start);
    expect(result.stability).toBeGreaterThan(start.stability);
    expect(result.interval).toBeGreaterThan(0);
  });

  test("hard (grade=2) grows slower than good", () => {
    const start = { stability: 5, difficulty: 5, lastReview: 3, lapses: 0, reps: 3 };
    const hard = fsrsCompute(2, start);
    const good = fsrsCompute(3, start);
    expect(hard.stability).toBeLessThan(good.stability);
  });
});
