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

  test("same-day good never reduces stability", () => {
    const start = { stability: 2.3065, difficulty: 2.118104, lastReview: 0, lapses: 0, reps: 1 };
    const result = fsrsCompute(3, start);
    expect(result.stability).toBeCloseTo(2.3065, 6);
    expect(result.difficulty).toBeCloseTo(2.111214, 6);
  });

  test("same-day again uses the short-term stability path", () => {
    const start = { stability: 0.212, difficulty: 6.4133, lastReview: 0, lapses: 1, reps: 1 };
    const result = fsrsCompute(3, start);
    expect(result.stability).toBeCloseTo(0.246689, 6);
    expect(result.difficulty).toBeCloseTo(6.402115, 6);
  });
});
