import { act, renderHook } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { useTrainingSessionPresentation } from "@/components/training/v2/useTrainingSessionPresentation";

describe("useTrainingSessionPresentation", () => {
  test("distinguishes first, subsequent, same-card remount, and re-entry", () => {
    const onEnterSession = vi.fn();
    const view = renderHook(
      ({ surface, cardKey }) =>
        useTrainingSessionPresentation({
          surface,
          presentedCardKey: cardKey,
          plannedTotal: 3,
          onEnterSession,
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
    expect(view.result.current.cardOrdinal).toBe(2);
    expect(view.result.current.progress).toEqual({
      position: 2,
      total: 3,
      fraction: 2 / 3,
    });

    act(() => view.rerender({ surface: "today", cardKey: null }));
    view.rerender({ surface: "session", cardKey: "entry-3:word-to-definition" });
    expect(view.result.current.isSubsequentCard).toBe(false);
    expect(view.result.current.cardOrdinal).toBe(1);
    expect(view.result.current.progress).toEqual({
      position: 1,
      total: 3,
      fraction: 1 / 3,
    });
  });

  test("keeps an accepted server total through transient loss and clamps exhausted overflow", () => {
    const view = renderHook(
      ({ cardKey, plannedTotal }) =>
        useTrainingSessionPresentation({
          surface: "session",
          presentedCardKey: cardKey,
          plannedTotal,
          onEnterSession: vi.fn(),
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

    expect(view.result.current.progress).toEqual({
      position: 2,
      total: 2,
      fraction: 1,
    });
  });

  test("never decreases a plan mid-session and resets it for an exact scope or session restart", () => {
    const onEnterSession = vi.fn();
    const view = renderHook(
      ({ surface, sessionKey, plannedTotal, cardKey }) =>
        useTrainingSessionPresentation({
          surface,
          sessionKey,
          plannedTotal,
          presentedCardKey: cardKey,
          onEnterSession,
        }),
      {
        initialProps: {
          surface: "today" as "today" | "session",
          sessionKey: "modes=a|list=1|filter=both",
          plannedTotal: null as number | null,
          cardKey: null as string | null,
        },
      },
    );

    view.rerender({
      surface: "session",
      sessionKey: "modes=a|list=1|filter=both",
      plannedTotal: 5,
      cardKey: "entry-1:a",
    });
    view.rerender({
      surface: "session",
      sessionKey: "modes=a|list=1|filter=both",
      plannedTotal: 3,
      cardKey: "entry-2:a",
    });
    expect(view.result.current.progress).toEqual({
      position: 2,
      total: 5,
      fraction: 0.4,
    });

    view.rerender({
      surface: "session",
      sessionKey: "modes=a|list=2|filter=review",
      plannedTotal: 2,
      cardKey: "entry-3:a",
    });
    expect(view.result.current.cardOrdinal).toBe(1);
    expect(view.result.current.progress).toEqual({
      position: 1,
      total: 2,
      fraction: 0.5,
    });

    view.rerender({
      surface: "today",
      sessionKey: "modes=a|list=2|filter=review",
      plannedTotal: null,
      cardKey: null,
    });
    expect(view.result.current.progress).toBeNull();
    view.rerender({
      surface: "session",
      sessionKey: "modes=a|list=2|filter=review",
      plannedTotal: 4,
      cardKey: "entry-4:a",
    });
    expect(view.result.current.progress).toEqual({
      position: 1,
      total: 4,
      fraction: 0.25,
    });
    expect(onEnterSession).toHaveBeenCalledTimes(3);
  });
});
