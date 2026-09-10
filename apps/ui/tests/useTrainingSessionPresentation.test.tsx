import { act, renderHook } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { useTrainingSessionPresentation } from "@/components/training/v2/useTrainingSessionPresentation";
import type { TrainingSessionPlanSnapshot } from "@/components/training/v2/useTrainingSessionPlan";

const snapshot = (
  plannedTotal: number | null,
  sessionGeneration = 1,
  scopeKey = "default",
): TrainingSessionPlanSnapshot | null =>
  plannedTotal === null
    ? null
    : {
        sessionGeneration,
        scopeKey,
        plan: {
          plannedNew: plannedTotal,
          plannedReview: 0,
          plannedPractice: 0,
          plannedTotal,
          plannedAt: "2026-08-21T12:00:00.000Z",
        },
      };

describe("useTrainingSessionPresentation", () => {
  test("distinguishes first, subsequent, same-card remount, and re-entry", () => {
    const view = renderHook(
      ({ surface, cardKey }) =>
        useTrainingSessionPresentation({
          surface,
          presentedCardKey: cardKey,
          sessionGeneration: 1,
          scopeKey: "default",
          planSnapshot: snapshot(3),
          resetKey: 0,
        }),
      {
        initialProps: {
          surface: "today" as "today" | "session",
          cardKey: null as string | null,
        },
      },
    );

    view.rerender({ surface: "session", cardKey: "entry-1:word-to-definition" });
    expect(view.result.current.isSubsequentCard).toBe(false);

    view.rerender({ surface: "session", cardKey: "entry-2:word-to-definition" });
    expect(view.result.current.isSubsequentCard).toBe(true);

    // The same card remains the same numbered presentation; the stable session
    // consumes its transition signal only once when it first becomes ready.
    view.rerender({ surface: "session", cardKey: "entry-2:word-to-definition" });
    expect(view.result.current.isSubsequentCard).toBe(true);
    expect(view.result.current.presentation).toEqual({
      kind: "planned",
      position: 2,
      total: 3,
      fraction: 2 / 3,
    });

    act(() => view.rerender({ surface: "today", cardKey: null }));
    view.rerender({ surface: "session", cardKey: "entry-3:word-to-definition" });
    expect(view.result.current.isSubsequentCard).toBe(false);
    expect(view.result.current.presentation).toEqual({
      kind: "planned",
      position: 1,
      total: 3,
      fraction: 1 / 3,
    });
  });

  test("keeps actual ordinal while clamping only the exhausted progress fraction", () => {
    const view = renderHook(
      ({ cardKey, plannedTotal }) =>
        useTrainingSessionPresentation({
          surface: "session",
          presentedCardKey: cardKey,
          sessionGeneration: 1,
          scopeKey: "default",
          planSnapshot: snapshot(plannedTotal),
          resetKey: 0,
        }),
      {
        initialProps: {
          cardKey: "entry-1:word-to-definition",
          plannedTotal: 2 as number | null,
        },
      },
    );

    view.rerender({
      cardKey: "entry-2:word-to-definition",
      plannedTotal: null,
    });
    view.rerender({
      cardKey: "entry-3:word-to-definition",
      plannedTotal: null,
    });

    expect(view.result.current.presentation).toEqual({
      kind: "planned",
      position: 3,
      total: 2,
      fraction: 1,
    });
  });

  test("never decreases a plan mid-session and resets it for an exact scope or session restart", () => {
    const view = renderHook(
      ({
        surface,
        sessionKey,
        sessionGeneration,
        plannedTotal,
        cardKey,
        resetKey,
      }) =>
        useTrainingSessionPresentation({
          surface,
          scopeKey: sessionKey,
          sessionGeneration,
          planSnapshot: snapshot(plannedTotal, sessionGeneration, sessionKey),
          presentedCardKey: cardKey,
          resetKey,
        }),
      {
        initialProps: {
          surface: "today" as "today" | "session",
          sessionKey: "modes=a|list=1|filter=both",
          sessionGeneration: 1,
          plannedTotal: null as number | null,
          cardKey: null as string | null,
          resetKey: 0,
        },
      },
    );

    view.rerender({
      surface: "session",
      sessionKey: "modes=a|list=1|filter=both",
      sessionGeneration: 1,
      plannedTotal: 5,
      cardKey: "entry-1:a",
      resetKey: 0,
    });
    view.rerender({
      surface: "session",
      sessionKey: "modes=a|list=1|filter=both",
      sessionGeneration: 1,
      plannedTotal: 3,
      cardKey: "entry-2:a",
      resetKey: 0,
    });
    expect(view.result.current.presentation).toEqual({
      kind: "planned",
      position: 2,
      total: 5,
      fraction: 0.4,
    });

    view.rerender({
      surface: "session",
      sessionKey: "modes=a|list=2|filter=review",
      sessionGeneration: 1,
      plannedTotal: 2,
      cardKey: "entry-3:a",
      resetKey: 1,
    });
    expect(view.result.current.presentation).toEqual({
      kind: "planned",
      position: 1,
      total: 2,
      fraction: 0.5,
    });

    view.rerender({
      surface: "today",
      sessionKey: "modes=a|list=2|filter=review",
      sessionGeneration: 1,
      plannedTotal: null,
      cardKey: null,
      resetKey: 1,
    });
    expect(view.result.current.presentation).toEqual({
      kind: "ordinal",
      position: 1,
    });
    view.rerender({
      surface: "session",
      sessionKey: "modes=a|list=2|filter=review",
      sessionGeneration: 2,
      plannedTotal: 4,
      cardKey: "entry-4:a",
      resetKey: 2,
    });
    expect(view.result.current.presentation).toEqual({
      kind: "planned",
      position: 1,
      total: 4,
      fraction: 0.25,
    });
  });

  test("scope-key hydration only changes progress state", () => {
    const view = renderHook(
      ({ scopeKey, cardKey, plannedTotal }) =>
        useTrainingSessionPresentation({
          surface: "session",
          presentedCardKey: cardKey,
          sessionGeneration: 1,
          scopeKey,
          planSnapshot: snapshot(plannedTotal, 1, scopeKey),
          resetKey: 0,
        }),
      {
        initialProps: {
          scopeKey: "hydrating",
          cardKey: "entry-1:a",
          plannedTotal: 5,
        },
      },
    );

    view.rerender({
      scopeKey: "hydrated",
      cardKey: "entry-2:a",
      plannedTotal: 5,
    });

    expect(view.result.current.presentation).toEqual({
      kind: "planned",
      position: 2,
      total: 5,
      fraction: 0.4,
    });
  });
});
