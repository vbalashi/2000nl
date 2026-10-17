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

const eventTransport = vi.hoisted(() => ({ listeners: [] as ((event: unknown) => void)[], connections: [] as ((state: unknown) => void)[] }));
vi.mock("@/lib/events/appEvents", async importOriginal => {
  const original = await importOriginal<typeof import("@/lib/events/appEvents")>();
  return { ...original,
    subscribeAppEvents: (_options: unknown, listener: (event: unknown) => void) => { eventTransport.listeners.push(listener); return () => {}; },
    subscribeAppEventConnection: (_topic: string, listener: (state: unknown) => void) => { eventTransport.connections.push(listener); return () => {}; },
  };
});

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
    eventTransport.listeners.length = 0;
    eventTransport.connections.length = 0;
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
    expect(updateUserPreferences).toHaveBeenLastCalledWith({userId:"user-1",translationLang:"en",secondaryTranslationLang:null});
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


beforeEach(() => {
  eventTransport.listeners.length = 0;
  eventTransport.connections.length = 0;
  fetchUserPreferences.mockReset().mockResolvedValue(loadedPreferences);
  updateUserPreferences.mockReset().mockResolvedValue({ error: null });
});

test("account hints defer reads until optimistic settings writes settle and reconcile first join", async () => {
  const userId = "11111111-1111-4111-8111-111111111111";
  const initial = { ...loadedPreferences, themePreference: "dark" } as UserPreferences;
  const { result } = renderHook(() => useTrainingPreferences(userId, undefined, initial));
  expect(fetchUserPreferences).not.toHaveBeenCalled();
  let finish!: (value: unknown) => void;
  updateUserPreferences.mockReturnValue(new Promise(resolve => { finish = resolve; }));
  act(() => result.current.setTheme("light"));
  act(() => {
    eventTransport.connections[0]({ status: "connected", reconnect: false });
    eventTransport.listeners[0]({ kind: "account.changed", resourceId: "user_settings" });
  });
  await act(async () => {});
  expect(fetchUserPreferences).not.toHaveBeenCalled();
  expect(result.current.themePreference).toBe("light");
  fetchUserPreferences.mockResolvedValue({ ...initial, themePreference: "light", translationLang: "ru" });
  await act(async () => finish({ error: null }));
  await waitFor(() => expect(result.current.translationLang).toBe("ru"));
  expect(fetchUserPreferences).toHaveBeenCalledOnce();
  expect(result.current.themePreference).toBe("light");
});

test("a stale event refresh cannot overwrite a newer optimistic settings write", async () => {
  const userId = "11111111-1111-4111-8111-111111111111";
  const { result } = renderHook(() => useTrainingPreferences(userId, undefined, loadedPreferences as UserPreferences));
  let finishRead!: (value: unknown) => void;
  fetchUserPreferences.mockReturnValueOnce(new Promise(resolve => { finishRead = resolve; }));
  act(() => eventTransport.listeners[0]({ kind: "account.changed" }));
  await waitFor(() => expect(fetchUserPreferences).toHaveBeenCalledOnce());
  act(() => result.current.setTheme("light"));
  await act(async () => finishRead(loadedPreferences));
  expect(result.current.themePreference).toBe("light");
});
