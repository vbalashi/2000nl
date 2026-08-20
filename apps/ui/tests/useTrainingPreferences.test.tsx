import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { useTrainingPreferences } from "@/lib/training/useTrainingPreferences";

const { fetchUserPreferences, updateUserPreferences } = vi.hoisted(() => ({
  fetchUserPreferences: vi.fn(),
  updateUserPreferences: vi.fn(),
}));

vi.mock("@/lib/trainingService", () => ({
  fetchUserPreferences,
  updateUserPreferences,
}));

const loadedPreferences = {
  themePreference: "dark",
  audioQuality: "premium",
  modesEnabled: ["word-to-definition", "definition-to-word"],
  cardFilter: "review",
  languageCode: "nl",
  newReviewRatio: 4,
  activeScenario: "listening",
  translationLang: "en",
  preferences: {},
};

describe("useTrainingPreferences", () => {
  beforeEach(() => {
    fetchUserPreferences.mockReset();
    updateUserPreferences.mockReset();
    fetchUserPreferences.mockResolvedValue(loadedPreferences);
    updateUserPreferences.mockResolvedValue({ error: null });
  });

  test("loads saved preferences", async () => {
    const dispatch = vi.spyOn(window, "dispatchEvent");
    const { result } = renderHook(() =>
      useTrainingPreferences("user-1", "initial-entry-189"),
    );

    await waitFor(() => expect(result.current.activeScenario).toBe("listening"));

    expect(fetchUserPreferences).toHaveBeenCalledWith("user-1");
    expect(result.current).toEqual(
      expect.objectContaining({
        audioQuality: "premium",
        cardFilter: "review",
        enabledModes: ["word-to-definition", "definition-to-word"],
        language: "nl",
        newReviewRatio: 4,
        themePreference: "dark",
        translationLang: "en",
      }),
    );
    expect(trainingTimingEvents(dispatch)).toContainEqual(
      expect.objectContaining({
        transitionId: "initial-entry-189",
        stage: "training.preferences",
        outcome: "ready",
      }),
    );
  });

  test("setters update local state before persistence resolves", async () => {
    let resolveUpdate!: (value: { error: null }) => void;
    updateUserPreferences.mockImplementation(
      () =>
        new Promise<{ error: null }>((resolve) => {
          resolveUpdate = resolve;
        }),
    );

    const { result } = renderHook(() => useTrainingPreferences("user-1"));
    await waitFor(() => expect(result.current.activeScenario).toBe("listening"));

    act(() => {
      result.current.setCardFilter("both");
      result.current.setTranslationLang(null);
    });

    expect(result.current.cardFilter).toBe("both");
    expect(result.current.translationLang).toBeNull();
    expect(updateUserPreferences).toHaveBeenCalledWith({
      userId: "user-1",
      cardFilter: "both",
    });
    expect(updateUserPreferences).toHaveBeenCalledWith({
      userId: "user-1",
      translationLang: null,
    });

    resolveUpdate({ error: null });
  });
});

function trainingTimingEvents(dispatch: { mock: { calls: [Event][] } }) {
  return dispatch.mock.calls.flatMap(([event]) =>
    event instanceof CustomEvent &&
    event.type === "2000nl:training-transition-timing"
      ? [event.detail as Record<string, unknown>]
      : [],
  );
}
