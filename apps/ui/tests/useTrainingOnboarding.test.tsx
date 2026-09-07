import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { useTrainingOnboarding } from "@/lib/training/useTrainingOnboarding";

const { updateUserPreferences } = vi.hoisted(() => ({
  updateUserPreferences: vi.fn(),
}));

vi.mock("@/lib/trainingService", () => ({
  updateUserPreferences,
}));

describe("useTrainingOnboarding", () => {
  beforeEach(() => {
    updateUserPreferences.mockReset();
    updateUserPreferences.mockResolvedValue({ error: null });
    window.localStorage.clear();
  });

  test("auto-detects missing language and merges into existing preferences", async () => {
    const { result } = renderHook(() =>
      useTrainingOnboarding({
        userId: "user-1",
        interfaceLanguage: "ru",
        preferences: {
          onboardingCompleted: false,
          unrelated: "keep",
        },
      }),
    );

    await waitFor(() => expect(result.current.onboardingLang).toBe("ru"));

    expect(updateUserPreferences).toHaveBeenCalledWith({
      userId: "user-1",
      preferences: {
        onboardingCompleted: false,
        unrelated: "keep",
        onboardingLanguage: "ru",
      },
    });
  });

  test("language selection persists merged preferences and starts the tour", async () => {
    const { result } = renderHook(() =>
      useTrainingOnboarding({
        userId: "user-1",
        interfaceLanguage: "en",
        preferences: {
          onboardingCompleted: false,
          unrelated: "keep",
        },
      }),
    );

    await waitFor(() => expect(updateUserPreferences).toHaveBeenCalled());
    updateUserPreferences.mockClear();

    await act(async () => {
      await result.current.handleLanguageSelect("nl");
    });

    expect(result.current.onboardingLang).toBe("nl");
    expect(result.current.runTour).toBe(true);
    expect(window.localStorage.getItem("onboarding_language")).toBe("nl");
    expect(updateUserPreferences).toHaveBeenCalledWith({
      userId: "user-1",
      preferences: {
        onboardingCompleted: false,
        unrelated: "keep",
        onboardingLanguage: "nl",
      },
    });
  });

  test("settings language choice persists without starting onboarding", async () => {
    const { result } = renderHook(() =>
      useTrainingOnboarding({
        userId: "user-1",
        interfaceLanguage: "en",
        preferences: {
          onboardingCompleted: true,
          unrelated: "keep",
        },
      }),
    );

    await waitFor(() => expect(updateUserPreferences).toHaveBeenCalled());
    updateUserPreferences.mockClear();

    await act(async () => {
      await result.current.saveOnboardingLanguageChoice("ru");
    });

    expect(result.current.onboardingLang).toBe("ru");
    expect(result.current.runTour).toBe(false);
    expect(window.localStorage.getItem("onboarding_language")).toBe("ru");
    expect(updateUserPreferences).toHaveBeenCalledWith({
      userId: "user-1",
      preferences: {
        onboardingCompleted: true,
        unrelated: "keep",
        onboardingLanguage: "ru",
      },
    });
  });

  test("completion persists without clobbering other preferences", async () => {
    const { result } = renderHook(() =>
      useTrainingOnboarding({
        userId: "user-1",
        interfaceLanguage: "en",
        preferences: {
          onboardingLanguage: "en",
          unrelated: "keep",
        },
      }),
    );

    await waitFor(() => expect(result.current.onboardingLang).toBe("en"));

    act(() => {
      result.current.startOnboarding();
    });
    expect(result.current.runTour).toBe(true);
    expect(result.current.onboardingCompleted).toBe(false);

    await act(async () => {
      await result.current.handleJoyrideCallback({ status: "finished" } as any);
    });

    expect(result.current.runTour).toBe(false);
    expect(result.current.onboardingCompleted).toBe(true);
    expect(updateUserPreferences).toHaveBeenCalledWith({
      userId: "user-1",
      preferences: {
        onboardingLanguage: "en",
        unrelated: "keep",
        onboardingCompleted: true,
      },
    });
    expect(updateUserPreferences).toHaveBeenCalledWith({
      userId: "user-1",
      preferences: {
        onboardingLanguage: "en",
        unrelated: "keep",
        onboardingCompleted: false,
      },
    });
  });
});
