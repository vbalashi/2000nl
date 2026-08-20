import { afterEach, describe, expect, test, vi } from "vitest";
import {
  beginTrainingUserTransition,
  markTrainingEntryPresentationStarted,
  recordTrainingTransitionResponse,
  recordTrainingTransitionTiming,
  recordTrainingEntryRendered,
  recordTrainingEntryTerminalFailure,
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
      monotonicStartedAtMs: 100,
      monotonicEndedAtMs: 112.5,
      outcome: "ready",
    });
  });

  test("does not report render time before presentation starts", () => {
    const dispatch = vi.spyOn(window, "dispatchEvent");
    registerTrainingEntryTransition("entry-not-presented", "transition-148-b");

    recordTrainingEntryRendered("entry-not-presented");

    expect(dispatch).not.toHaveBeenCalled();
  });

  test("records the complete accepted user transition on the card transition id", () => {
    const dispatch = vi.spyOn(window, "dispatchEvent");
    const now = vi.spyOn(performance, "now");
    now.mockReturnValueOnce(100).mockReturnValueOnce(450).mockReturnValueOnce(1_350);

    beginTrainingUserTransition("transition-total", "learn");
    registerTrainingEntryTransition("entry-total", "transition-total");
    markTrainingEntryPresentationStarted("entry-total");
    recordTrainingEntryRendered("entry-total");

    const details = dispatch.mock.calls
      .map(([event]) => event)
      .filter(
        (event): event is CustomEvent =>
          event instanceof CustomEvent &&
          event.type === "2000nl:training-transition-timing",
      )
      .map((event) => event.detail);
    expect(details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          transitionId: "transition-total",
          stage: "transition.start",
          durationMs: 0,
          monotonicStartedAtMs: 100,
          monotonicEndedAtMs: 100,
          outcome: "learn",
        }),
        expect.objectContaining({
          transitionId: "transition-total",
          stage: "card.render",
          durationMs: 900,
          monotonicStartedAtMs: 450,
          monotonicEndedAtMs: 1_350,
          outcome: "ready",
        }),
        expect.objectContaining({
          transitionId: "transition-total",
          stage: "transition.total",
          durationMs: 1_250,
          monotonicStartedAtMs: 100,
          monotonicEndedAtMs: 1_350,
          outcome: "learn-ready",
        }),
      ]),
    );
  });

  test("terminates an accepted transition when the selected card cannot render", () => {
    const dispatch = vi.spyOn(window, "dispatchEvent");
    const now = vi.spyOn(performance, "now");
    now.mockReturnValueOnce(100).mockReturnValueOnce(725);

    beginTrainingUserTransition("transition-invalid", "review");
    registerTrainingEntryTransition("entry-invalid", "transition-invalid");
    recordTrainingEntryTerminalFailure("entry-invalid", "model-invalid");

    const totals = dispatch.mock.calls
      .map(([event]) => event)
      .filter(
        (event): event is CustomEvent =>
          event instanceof CustomEvent &&
          event.type === "2000nl:training-transition-timing" &&
          event.detail.stage === "transition.total",
      )
      .map((event) => event.detail);
    expect(totals).toEqual([
      expect.objectContaining({
        transitionId: "transition-invalid",
        durationMs: 625,
        outcome: "review-error-model-invalid",
      }),
    ]);

    recordTrainingEntryTerminalFailure("entry-invalid", "model-invalid");
    expect(
      dispatch.mock.calls.filter(
        ([event]) =>
          event instanceof CustomEvent &&
          event.type === "2000nl:training-transition-timing" &&
          event.detail.stage === "transition.total",
      ),
    ).toHaveLength(1);
  });

  test("keeps browser timing events bounded and strips unsafe response metadata", () => {
    const dispatch = vi.spyOn(window, "dispatchEvent");

    recordTrainingTransitionResponse(
      "transition-safe",
      "review.mutation.request",
      performance.now(),
      new Response("secret response body", {
        status: 200,
        headers: {
          "x-request-id": "request-189.safe:1",
          "server-timing":
            'action.db;dur=12.34;desc="private row", route.total;dur=18.5, invalid secret;dur=99',
          authorization: "Bearer must-not-escape",
        },
      }),
      "accepted",
    );

    const timingEvent = dispatch.mock.calls
      .map(([event]) => event)
      .find(
        (event): event is CustomEvent =>
          event instanceof CustomEvent &&
          event.type === "2000nl:training-transition-timing" &&
          event.detail.stage === "review.mutation.request",
      );
    expect(timingEvent?.detail).toMatchObject({
      transitionId: "transition-safe",
      outcome: "accepted",
      requestId: "request-189.safe:1",
      serverTiming: "action.db;dur=12.3, route.total;dur=18.5",
    });
    expect(JSON.stringify(timingEvent?.detail)).not.toContain("private row");
    expect(JSON.stringify(timingEvent?.detail)).not.toContain("Bearer");

    const unsafe = recordTrainingTransitionTiming({
      transitionId: `training-${"x".repeat(300)}`,
      stage: "next-card.prefetch",
      durationMs: Number.POSITIVE_INFINITY,
      outcome: `unsafe ${"y".repeat(300)}`,
      requestId: "Bearer secret",
      serverTiming: `route.total;dur=1,${"z".repeat(800)}`,
    });
    expect(unsafe.transitionId.length).toBeLessThanOrEqual(128);
    expect(unsafe.outcome.length).toBeLessThanOrEqual(64);
    expect(unsafe.durationMs).toBe(0);
    expect(unsafe.requestId).toBeUndefined();
    expect(unsafe.serverTiming).toBe("route.total;dur=1");
    expect(JSON.stringify(unsafe).length).toBeLessThan(700);
  });
});
