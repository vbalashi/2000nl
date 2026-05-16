import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { useTrainingOnboarding } from "@/lib/training/useTrainingOnboarding";

const { fetchUserPreferences, updateUserPreferences } = vi.hoisted(() => ({
  fetchUserPreferences: vi.fn(),
  updateUserPreferences: vi.fn(),
}));

vi.mock("@/lib/trainingService", () => ({
  fetchUserPreferences,
  updateUserPreferences,
}));

describe("useTrainingOnboarding", () => {
  beforeEach(() => {
    fetchUserPreferences.mockReset();
    updateUserPreferences.mockReset();
    updateUserPreferences.mockResolvedValue({ error: null });
    window.localStorage.clear();
  });

  test("auto-detects missing language and merges into existing preferences", async () => {
    fetchUserPreferences.mockResolvedValue({
      preferences: {
        onboardingCompleted: false,
        unrelated: "keep",
      },
    });

    const { result } = renderHook(() =>
      useTrainingOnboarding({ userId: "user-1", translationLang: "ru" }),
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
    fetchUserPreferences.mockResolvedValue({
      preferences: {
        onboardingCompleted: false,
        unrelated: "keep",
      },
    });

    const { result } = renderHook(() =>
      useTrainingOnboarding({ userId: "user-1", translationLang: "en" }),
    );

    await waitFor(() => expect(fetchUserPreferences).toHaveBeenCalled());
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

  test("completion persists without clobbering other preferences", async () => {
    fetchUserPreferences.mockResolvedValue({
      preferences: {
        onboardingLanguage: "en",
        unrelated: "keep",
      },
    });

    const { result } = renderHook(() =>
      useTrainingOnboarding({ userId: "user-1", translationLang: "en" }),
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
