import { describe, expect, test } from "vitest";
import { ActiveStudyClock, ACTIVE_STUDY_MAX_SAMPLE_GAP_MS } from "@/lib/training/activeStudyClock";

describe("active study measurement", () => {
  test("only running intervals count; pauses settle the previous interval", () => {
    const clock = new ActiveStudyClock();
    clock.setRunning(false, 0);
    clock.setRunning(true, 1000);
    clock.sample(2000);
    clock.setRunning(false, 3500);
    clock.sample(10000);
    clock.setRunning(true, 12000);
    expect(clock.takeMilliseconds(14000)).toBe(4500);
    expect(clock.takeMilliseconds(14000)).toBe(0);
  });

  test("heartbeat checkpoints partition time without double counting", () => {
    const clock = new ActiveStudyClock();
    clock.setRunning(true, 0);
    expect(clock.takeMilliseconds(15000)).toBe(15000);
    expect(clock.takeMilliseconds(30000)).toBe(15000);
    clock.setRunning(false, 31200);
    expect(clock.takeMilliseconds(40000)).toBe(1200);
    expect(clock.takeMilliseconds(45000)).toBe(0);
  });

  test("keeps fractional milliseconds across persistence checkpoints", () => {
    const clock = new ActiveStudyClock();
    clock.setRunning(true, 0);
    expect(clock.takeMilliseconds(0.7)).toBe(0);
    expect(clock.takeMilliseconds(1.4)).toBe(1);
    expect(clock.takeMilliseconds(2.1)).toBe(1);
  });

  test("does not treat missed heartbeats during suspension as study", () => {
    const clock = new ActiveStudyClock();
    clock.setRunning(true, 0);
    expect(clock.takeMilliseconds(15000)).toBe(15000);
    expect(clock.takeMilliseconds(15000 + ACTIVE_STUDY_MAX_SAMPLE_GAP_MS + 1)).toBe(0);
    expect(clock.takeMilliseconds(55001)).toBe(10000);
  });

  test("rejects invalid/backward clocks without replaying counted time", () => {
    const clock = new ActiveStudyClock();
    clock.setRunning(true, 10);
    expect(clock.takeMilliseconds(1010)).toBe(1000);
    expect(clock.takeMilliseconds(NaN)).toBe(0);
    expect(clock.takeMilliseconds(Infinity)).toBe(0);
    expect(clock.takeMilliseconds(-1)).toBe(0);
    expect(clock.takeMilliseconds(500)).toBe(0);
    expect(clock.takeMilliseconds(2010)).toBe(1000);
  });
});
