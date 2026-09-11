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
  test("starts at zero completed actions and advances only after acceptance", () => {
    const view = renderHook(
      ({ consumedCardCount }) =>
        useTrainingSessionPresentation({
          surface: "session",
          presentedCardKey: "entry-1:word-to-definition",
          consumedCardCount,
          sessionGeneration: 1,
          scopeKey: "default",
          planSnapshot: snapshot(3),
          resetKey: 0,
        }),
      { initialProps: { consumedCardCount: 0 } },
    );

    expect(view.result.current.presentation).toEqual({
      kind: "planned",
      position: 0,
      total: 3,
      fraction: 0,
    });

    view.rerender({ consumedCardCount: 1 });
    expect(view.result.current.presentation).toEqual({
      kind: "planned",
      position: 1,
      total: 3,
      fraction: 1 / 3,
    });
  });

  test("advances only after an accepted card, not after a replacement", () => {
    const view = renderHook(
      ({ surface, cardKey, consumedCardCount }) =>
        useTrainingSessionPresentation({
          surface,
          presentedCardKey: cardKey,
          consumedCardCount,
          sessionGeneration: 1,
          scopeKey: "default",
          planSnapshot: snapshot(3),
          resetKey: 0,
        }),
      {
        initialProps: {
          surface: "today" as "today" | "session",
          cardKey: null as string | null,
          consumedCardCount: 0,
        },
      },
    );

    view.rerender({
      surface: "session",
      cardKey: "entry-1:word-to-definition",
      consumedCardCount: 0,
    });
    expect(view.result.current.isSubsequentCard).toBe(false);

    view.rerender({
      surface: "session",
      cardKey: "entry-2:word-to-definition",
      consumedCardCount: 0,
    });
    expect(view.result.current.isSubsequentCard).toBe(false);

    view.rerender({
      surface: "session",
      cardKey: "entry-2:word-to-definition",
      consumedCardCount: 1,
    });
    expect(view.result.current.isSubsequentCard).toBe(true);
    expect(view.result.current.presentation).toEqual({
      kind: "planned",
      position: 1,
      total: 3,
      fraction: 1 / 3,
    });

    act(() =>
      view.rerender({
        surface: "today",
        cardKey: null,
        consumedCardCount: 0,
      }),
    );
    view.rerender({
      surface: "session",
      cardKey: "entry-3:word-to-definition",
      consumedCardCount: 0,
    });
    expect(view.result.current.isSubsequentCard).toBe(false);
    expect(view.result.current.presentation).toEqual({
      kind: "planned",
      position: 0,
      total: 3,
      fraction: 0,
    });
  });

  test("keeps completed-action count while clamping only exhausted progress", () => {
    const view = renderHook(
      ({ cardKey, plannedTotal, consumedCardCount }) =>
        useTrainingSessionPresentation({
          surface: "session",
          presentedCardKey: cardKey,
          consumedCardCount,
          sessionGeneration: 1,
          scopeKey: "default",
          planSnapshot: snapshot(plannedTotal),
          resetKey: 0,
        }),
      {
        initialProps: {
          cardKey: "entry-1:word-to-definition",
          plannedTotal: 2 as number | null,
          consumedCardCount: 0,
        },
      },
    );

    view.rerender({
      cardKey: "entry-2:word-to-definition",
      plannedTotal: null,
      consumedCardCount: 1,
    });
    view.rerender({
      cardKey: "entry-3:word-to-definition",
      plannedTotal: null,
      consumedCardCount: 2,
    });

    expect(view.result.current.presentation).toEqual({
      kind: "planned",
      position: 2,
      total: 2,
      fraction: 1,
    });
  });

  test("prefers a latched session plan over a later dynamic estimate", () => {
    const view = renderHook(
      ({ latchedTotal, estimatedTotal }) =>
        useTrainingSessionPresentation({
          surface: "session",
          presentedCardKey: "entry-1:word-to-definition",
          sessionGeneration: 1,
          scopeKey: "default",
          planSnapshot: snapshot(estimatedTotal),
          planOverride: snapshot(latchedTotal)?.plan ?? null,
          resetKey: 0,
        }),
      {
        initialProps: {
          latchedTotal: 5,
          estimatedTotal: 7474,
        },
      },
    );

    expect(view.result.current.presentation).toEqual({
      kind: "planned",
      position: 0,
      total: 5,
      fraction: 0,
    });
  });

  test("starts resumed sessions at their completed-action count", () => {
    const view = renderHook(
      ({ consumedCardCount, cardKey }) =>
        useTrainingSessionPresentation({
          surface: "session",
          presentedCardKey: cardKey,
          consumedCardCount,
          sessionGeneration: 1,
          scopeKey: "default",
          planSnapshot: snapshot(5),
          resetKey: 0,
        }),
      {
        initialProps: {
          consumedCardCount: 3,
          cardKey: "entry-4:word-to-definition",
        },
      },
    );

    act(() => view.rerender({
      consumedCardCount: 3,
      cardKey: "entry-4:word-to-definition",
    }));

    expect(view.result.current.presentation).toEqual({
      kind: "planned",
      position: 3,
      total: 5,
      fraction: 3 / 5,
    });
  });

  test("hydrates completed action count when the snapshot arrives after the session surface", () => {
    const view = renderHook(
      ({ consumedCardCount, cardKey }: { consumedCardCount: number; cardKey: string | null }) =>
        useTrainingSessionPresentation({
          surface: "session",
          presentedCardKey: cardKey,
          consumedCardCount,
          sessionGeneration: 1,
          scopeKey: "default",
          planSnapshot: snapshot(5),
          resetKey: 0,
        }),
      {
        initialProps: { consumedCardCount: 0, cardKey: null as string | null },
      },
    );

    act(() =>
      view.rerender({
        consumedCardCount: 3,
        cardKey: "entry-4:word-to-definition",
      }),
    );

    expect(view.result.current.presentation).toEqual({
      kind: "planned",
      position: 3,
      total: 5,
      fraction: 3 / 5,
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
        consumedCardCount,
        resetKey,
      }) =>
        useTrainingSessionPresentation({
          surface,
          scopeKey: sessionKey,
          sessionGeneration,
          planSnapshot: snapshot(plannedTotal, sessionGeneration, sessionKey),
          presentedCardKey: cardKey,
          consumedCardCount,
          resetKey,
        }),
      {
        initialProps: {
          surface: "today" as "today" | "session",
          sessionKey: "modes=a|list=1|filter=both",
          sessionGeneration: 1,
          plannedTotal: null as number | null,
          cardKey: null as string | null,
          consumedCardCount: 0,
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
      consumedCardCount: 0,
      resetKey: 0,
    });
    view.rerender({
      surface: "session",
      sessionKey: "modes=a|list=1|filter=both",
      sessionGeneration: 1,
      plannedTotal: 3,
      cardKey: "entry-2:a",
      consumedCardCount: 1,
      resetKey: 0,
    });
    expect(view.result.current.presentation).toEqual({
      kind: "planned",
      position: 1,
      total: 5,
      fraction: 0.2,
    });

    view.rerender({
      surface: "session",
      sessionKey: "modes=a|list=2|filter=review",
      sessionGeneration: 1,
      plannedTotal: 2,
      cardKey: "entry-3:a",
      consumedCardCount: 0,
      resetKey: 1,
    });
    expect(view.result.current.presentation).toEqual({
      kind: "planned",
      position: 0,
      total: 2,
      fraction: 0,
    });

    view.rerender({
      surface: "today",
      sessionKey: "modes=a|list=2|filter=review",
      sessionGeneration: 1,
      plannedTotal: null,
      cardKey: null,
      consumedCardCount: 0,
      resetKey: 1,
    });
    expect(view.result.current.presentation).toEqual({
      kind: "ordinal",
      position: 0,
    });
    view.rerender({
      surface: "session",
      sessionKey: "modes=a|list=2|filter=review",
      sessionGeneration: 2,
      plannedTotal: 4,
      cardKey: "entry-4:a",
      consumedCardCount: 0,
      resetKey: 2,
    });
    expect(view.result.current.presentation).toEqual({
      kind: "planned",
      position: 0,
      total: 4,
      fraction: 0,
    });
  });

  test("scope-key hydration only changes progress state", () => {
    const view = renderHook(
      ({ scopeKey, cardKey, plannedTotal, consumedCardCount }) =>
        useTrainingSessionPresentation({
          surface: "session",
          presentedCardKey: cardKey,
          consumedCardCount,
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
          consumedCardCount: 0,
        },
      },
    );

    view.rerender({
      scopeKey: "hydrated",
      cardKey: "entry-2:a",
      plannedTotal: 5,
      consumedCardCount: 0,
    });

    expect(view.result.current.presentation).toEqual({
      kind: "planned",
      position: 0,
      total: 5,
      fraction: 0,
    });
  });
});
