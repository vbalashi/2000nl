import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { useTrainingPreferences } from "@/lib/training/useTrainingPreferences";
import type { UserPreferences } from "@/lib/trainingService";

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
  secondaryTranslationLang: "ru",
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
        secondaryTranslationLang: "ru",
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

  test("uses the bootstrap snapshot without reading preferences again", () => {
    const { result } = renderHook(() =>
      useTrainingPreferences(
        "user-1",
        "initial-entry-270",
        loadedPreferences as UserPreferences,
      ),
    );

    expect(fetchUserPreferences).not.toHaveBeenCalled();
    expect(result.current).toEqual(
      expect.objectContaining({
        activeScenario: "listening",
        audioQuality: "premium",
        cardFilter: "review",
        enabledModes: ["word-to-definition", "definition-to-word"],
        themePreference: "dark",
        translationLang: "en",
        secondaryTranslationLang: "ru",
      }),
    );
  });

  test("old primary-Off settings keep the additional language inactive on load and bootstrap", async () => {
    const old = {...loadedPreferences,translationLang:null,secondaryTranslationLang:"de"} as UserPreferences;
    const boot = renderHook(()=>useTrainingPreferences("user-1",undefined,old));
    expect(boot.result.current.secondaryTranslationLang).toBeNull();boot.unmount();
    fetchUserPreferences.mockResolvedValue(old);
    const loaded = renderHook(()=>useTrainingPreferences("user-1"));
    await waitFor(()=>expect(loaded.result.current.activeScenario).toBe("listening"));
    expect(loaded.result.current.secondaryTranslationLang).toBeNull();
    act(()=>loaded.result.current.setTranslationLang("en"));
    expect(loaded.result.current.secondaryTranslationLang).toBeNull();
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
      result.current.setSecondaryTranslationLang("de");
    });

    expect(result.current.cardFilter).toBe("both");
    expect(result.current.translationLang).toBeNull();
    expect(result.current.secondaryTranslationLang).toBeNull();
    expect(updateUserPreferences).not.toHaveBeenCalledWith({userId:"user-1",secondaryTranslationLang:"de"});
    expect(updateUserPreferences).toHaveBeenCalledWith({
      userId: "user-1",
      cardFilter: "both",
    });
    expect(updateUserPreferences).toHaveBeenCalledWith({
      userId: "user-1",
      translationLang: null,
      secondaryTranslationLang: null,
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
