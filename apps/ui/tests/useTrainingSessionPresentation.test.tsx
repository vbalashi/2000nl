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

    // The same card remains the same numbered presentation; TrainingScreen's
    // entry/card-only key prevents configuration changes from remounting it.
    view.rerender({ surface: "session", cardKey: "entry-2:word-to-definition" });
    expect(view.result.current.isSubsequentCard).toBe(true);
    expect(view.result.current.cardOrdinal).toBe(2);

    act(() => view.rerender({ surface: "today", cardKey: null }));
    view.rerender({ surface: "session", cardKey: "entry-3:word-to-definition" });
    expect(view.result.current.isSubsequentCard).toBe(false);
    expect(view.result.current.cardOrdinal).toBe(1);
  });
});
