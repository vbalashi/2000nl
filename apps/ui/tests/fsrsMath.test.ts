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

  test.each([
    ["again after one day", 1, 1, 2.195161, 7.394503],
    ["hard after one day", 2, 1, 5.318793, 4.752858],
    ["good after one day", 3, 1, 7.315301, 2.111214],
    ["easy after one day", 4, 1, 11.687483, 1],
    ["hard after five days", 2, 5, 11.845517, 4.752858],
    ["good after five days", 3, 5, 18.167851, 2.111214],
    ["easy after five days", 4, 5, 32.013223, 1],
  ])(
    "matches the pinned fsrs-rs v4.1.1 vector for %s",
    (_name, grade, elapsedDays, stability, difficulty) => {
      const first = fsrsCompute(3, { stability: null, difficulty: null });
      const result = fsrsCompute(grade as 1 | 2 | 3 | 4, {
        ...first,
        lastReview: elapsedDays as number,
        reps: 1,
        lapses: 0,
      });

      expect(result.stability).toBeCloseTo(stability as number, 5);
      expect(result.difficulty).toBeCloseTo(difficulty as number, 5);
    },
  );
});
