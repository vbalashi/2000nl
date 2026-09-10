import { renderHook } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { useTrainingTurnSelectionPort } from "@/components/training/useTrainingTurnSelectionPort";

const mocks = vi.hoisted(() => ({
  fetchNextTrainingWordByScenario: vi.fn().mockResolvedValue(null),
  fetchTrainingWordByLookup: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/trainingService", () => ({
  fetchNextTrainingWordByScenario: mocks.fetchNextTrainingWordByScenario,
  fetchTrainingWordByLookup: mocks.fetchTrainingWordByLookup,
  isTrainingFocusFilterActive: () => false,
}));

describe("useTrainingTurnSelectionPort session boundaries", () => {
  test("uses the active session when a request omits the override", async () => {
    const { result } = renderHook(() =>
      useTrainingTurnSelectionPort({
        userId: "user-1",
        activeScenario: "understanding",
        activeList: null,
        availableLists: [],
        wordListId: null,
        wordListType: null,
        cardFilter: "both",
        focusFilter: { dateWindow: "all" },
        allowPractice: false,
        trainingSessionId: "old-session",
        resolveScenarioModes: vi.fn().mockResolvedValue(["word-to-definition"]),
      }),
    );

    await result.current.selectNext({ queueTurn: "new" });

    expect(mocks.fetchNextTrainingWordByScenario).toHaveBeenCalledWith(
      "user-1",
      "understanding",
      [],
      {},
      "both",
      "new",
      [],
      undefined,
      null,
      expect.any(Function),
      false,
      "old-session",
    );
  });

  test("an explicit null suppresses the previous session during replacement", async () => {
    mocks.fetchNextTrainingWordByScenario.mockClear();
    const { result } = renderHook(() =>
      useTrainingTurnSelectionPort({
        userId: "user-1",
        activeScenario: "understanding",
        activeList: null,
        availableLists: [],
        wordListId: null,
        wordListType: null,
        cardFilter: "both",
        focusFilter: { dateWindow: "all" },
        allowPractice: false,
        trainingSessionId: "old-session",
        resolveScenarioModes: vi.fn().mockResolvedValue(["word-to-definition"]),
      }),
    );

    await result.current.selectNext({
      queueTurn: "new",
      trainingSessionId: null,
    });

    const args = mocks.fetchNextTrainingWordByScenario.mock.calls[0];
    expect(args.at(-1)).toBeUndefined();
  });
});
