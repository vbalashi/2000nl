import { afterEach, describe, expect, test, vi } from "vitest";
import {
  markTrainingEntryPresentationStarted,
  recordTrainingEntryRendered,
  registerTrainingEntryTransition,
} from "@/lib/training/trainingTransitionTiming";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("training transition render timing", () => {
  test("starts render timing at presentation instead of including preparation", () => {
    const dispatch = vi.spyOn(window, "dispatchEvent");
    const now = vi.spyOn(performance, "now");
    now.mockReturnValueOnce(100).mockReturnValueOnce(112.5);

    registerTrainingEntryTransition("entry-148", "transition-148");
    markTrainingEntryPresentationStarted("entry-148");
    recordTrainingEntryRendered("entry-148");

    const timingEvent = dispatch.mock.calls
      .map(([event]) => event)
      .find(
        (event): event is CustomEvent =>
          event instanceof CustomEvent &&
          event.type === "2000nl:training-transition-timing",
      );
    expect(timingEvent?.detail).toMatchObject({
      transitionId: "transition-148",
      stage: "card.render",
      durationMs: 12.5,
      outcome: "ready",
    });
  });

  test("does not report render time before presentation starts", () => {
    const dispatch = vi.spyOn(window, "dispatchEvent");
    registerTrainingEntryTransition("entry-not-presented", "transition-148-b");

    recordTrainingEntryRendered("entry-not-presented");

    expect(dispatch).not.toHaveBeenCalled();
  });
});
