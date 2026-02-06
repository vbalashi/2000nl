import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import type { User } from "@supabase/supabase-js";

const mockWord = {
  id: "word-1",
  headword: "huis",
  mode: "word-to-definition",
  isFirstEncounter: false,
  raw: {
    meanings: [{ definition: "Een gebouw", links: [] }]
  }
};

const fetchNextTrainingWordByScenario = vi.fn().mockResolvedValue(mockWord);
const fetchStats = vi.fn().mockResolvedValue({
  newWordsToday: 0,
  newCardsToday: 0,
  dailyNewLimit: 10,
  reviewWordsDone: 0,
  reviewCardsDone: 0,
  reviewWordsDue: 0,
  reviewCardsDue: 0,
  totalWordsLearned: 0,
  totalWordsInList: 2000,
});
const fetchRecentHistory = vi.fn().mockResolvedValue([]);
const fetchAvailableLists = vi.fn().mockResolvedValue([
  { id: "list-1", name: "Test list", type: "curated", item_count: 1 },
]);
const fetchActiveList = vi.fn().mockResolvedValue({ listId: null, listType: null });
const fetchListSummaryById = vi.fn().mockResolvedValue(null);
const updateActiveList = vi.fn().mockResolvedValue(undefined);
const recordWordView = vi.fn().mockResolvedValue(undefined);
const recordReview = vi.fn().mockResolvedValue(null);
const recordDefinitionClick = vi.fn().mockResolvedValue(undefined);
const fetchDictionaryEntry = vi.fn().mockResolvedValue(null);
const fetchUserPreferences = vi.fn().mockResolvedValue({
  themePreference: "system",
  modesEnabled: ["word-to-definition"],
  cardFilter: "both",
  languageCode: "nl",
  newReviewRatio: 2,
  activeScenario: "understanding",
  translationLang: null,
  trainingSidebarPinned: false,
});
const updateUserPreferences = vi.fn().mockResolvedValue(undefined);

vi.mock("@/lib/trainingService", () => ({
  fetchDictionaryEntry,
  fetchNextTrainingWord: vi.fn().mockResolvedValue(mockWord),
  fetchNextTrainingWordByScenario,
  fetchStats,
  fetchRecentHistory,
  fetchActiveList,
  fetchListSummaryById,
  fetchAvailableLists,
  updateActiveList,
  recordDefinitionClick,
  recordReview,
  recordWordView,
  fetchUserPreferences,
  updateUserPreferences,
}));

vi.mock("@/lib/supabaseClient", () => ({
  supabase: {
    auth: {
      signOut: vi.fn()
    }
  }
}));

const { TrainingScreen } = await import("@/components/training/TrainingScreen");

const user: User = { id: "user-1", email: "user@test.com" } as User;

test("hotkey triggers recordReview like button click", async () => {
  render(<TrainingScreen user={user} />);

  await waitFor(() => expect(fetchNextTrainingWordByScenario).toHaveBeenCalled());
  await screen.findByRole("heading", { name: "huis" });

  // Reveal answer (Space)
  fireEvent.keyDown(window, { key: " " });
  await screen.findByRole("button", { name: /opnieuw/i });

  // Grade "Goed" (K)
  fireEvent.keyDown(window, { key: "k" });
  await waitFor(() =>
    expect(recordReview).toHaveBeenCalledWith(
      expect.objectContaining({ result: "success" })
    )
  );
});

test("first encounter: swipe right triggers Start learning (fail)", async () => {
  const original = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    "offsetWidth"
  );
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
    configurable: true,
    get() {
      return 1000;
    },
  });

  try {
    fetchNextTrainingWordByScenario.mockResolvedValueOnce({
      ...mockWord,
      isFirstEncounter: true,
    });

    render(<TrainingScreen user={user} />);
    await waitFor(() =>
      expect(fetchNextTrainingWordByScenario).toHaveBeenCalled()
    );
    await screen.findByRole("heading", { name: "huis" });

    fireEvent.keyDown(window, { key: " " });
    await screen.findByRole("button", { name: /begin met leren/i });

    recordReview.mockClear();
    const wrapper = screen.getByTestId("training-card-swipe-wrapper");
    fireEvent.touchStart(wrapper, {
      touches: [{ clientX: 0, clientY: 0 }],
    });
    fireEvent.touchMove(wrapper, {
      touches: [{ clientX: 500, clientY: 0 }],
    });
    fireEvent.touchEnd(wrapper);

    await waitFor(() =>
      expect(recordReview).toHaveBeenCalledWith(
        expect.objectContaining({ result: "fail" })
      )
    );
  } finally {
    if (original) {
      Object.defineProperty(HTMLElement.prototype, "offsetWidth", original);
    }
  }
});

test("first encounter: swipe left triggers I already know (hide)", async () => {
  const original = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    "offsetWidth"
  );
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
    configurable: true,
    get() {
      return 1000;
    },
  });

  try {
    fetchNextTrainingWordByScenario.mockResolvedValueOnce({
      ...mockWord,
      isFirstEncounter: true,
    });

    render(<TrainingScreen user={user} />);
    await waitFor(() =>
      expect(fetchNextTrainingWordByScenario).toHaveBeenCalled()
    );
    await screen.findByRole("heading", { name: "huis" });

    fireEvent.keyDown(window, { key: " " });
    await screen.findByRole("button", { name: /ik ken dit al/i });

    recordReview.mockClear();
    const wrapper = screen.getByTestId("training-card-swipe-wrapper");
    fireEvent.touchStart(wrapper, {
      touches: [{ clientX: 600, clientY: 0 }],
    });
    fireEvent.touchMove(wrapper, {
      touches: [{ clientX: 100, clientY: 0 }],
    });
    fireEvent.touchEnd(wrapper);

    await waitFor(() =>
      expect(recordReview).toHaveBeenCalledWith(
        expect.objectContaining({ result: "hide" })
      )
    );
  } finally {
    if (original) {
      Object.defineProperty(HTMLElement.prototype, "offsetWidth", original);
    }
  }
});

test("uses prefetched next card for instant transition on answer", async () => {
  const word1 = {
    ...mockWord,
    id: "word-1",
    headword: "huis",
  };
  const word2 = {
    ...mockWord,
    id: "word-2",
    headword: "boom",
  };

  // First call = initial card. Subsequent calls = prefetch (and any retries).
  fetchNextTrainingWordByScenario.mockReset();
  fetchNextTrainingWordByScenario.mockResolvedValueOnce(word1).mockResolvedValue(word2);

  recordReview.mockReset();
  // Keep the review in-flight to prove the UI switches without waiting for it.
  recordReview.mockImplementation(() => new Promise(() => {}));

  render(<TrainingScreen user={user} />);

  await screen.findByRole("heading", { name: "huis" });

  // Wait for the background prefetch to at least start and resolve.
  await waitFor(() =>
    expect(fetchNextTrainingWordByScenario.mock.calls.length).toBeGreaterThanOrEqual(2)
  );

  // Reveal answer then grade.
  fireEvent.keyDown(window, { key: " " });
  await screen.findByRole("button", { name: /opnieuw/i });

  fireEvent.keyDown(window, { key: "k" });

  // The UI should advance to the prefetched next card without waiting for recordReview.
  await screen.findByRole("heading", { name: "boom" });

  await waitFor(() =>
    expect(recordReview).toHaveBeenCalledWith(
      expect.objectContaining({ result: "success" })
    )
  );
});

test("translation overlay is not dismissed by Escape or Ctrl+Tab (US-087.1)", async () => {
  fetchNextTrainingWordByScenario.mockReset();
  fetchNextTrainingWordByScenario.mockResolvedValue(mockWord);

  // TrainingScreen currently calls fetchUserPreferences from 2 different effects:
  // - onboarding init expects `prefs.preferences.*`
  // - settings load expects flat fields (themePreference, translationLang, etc.)
  // Return a shape that supports both.
  fetchUserPreferences.mockReset();
  fetchUserPreferences.mockImplementation(async () => ({
    themePreference: "system",
    modesEnabled: ["word-to-definition"],
    cardFilter: "both",
    languageCode: "nl",
    newReviewRatio: 2,
    activeScenario: "understanding",
    translationLang: "en",
    trainingSidebarPinned: false,
    preferences: {
      onboardingCompleted: false,
      onboardingLanguage: null,
    },
  }));

  render(<TrainingScreen user={user} />);

  await waitFor(() => expect(fetchNextTrainingWordByScenario).toHaveBeenCalled());
  await screen.findByRole("heading", { name: "huis" });

  // Reveal answer (Space) so translation UI becomes available.
  fireEvent.keyDown(window, { key: " " });

  const translateBtn = await screen.findByRole("button", {
    name: /translate \(t\)/i,
  });

  // Open via hotkey.
  fireEvent.keyDown(window, { key: "t" });
  await waitFor(() => expect(translateBtn).toHaveAttribute("aria-pressed", "true"));

  // Should not dismiss.
  fireEvent.keyDown(window, { key: "Escape" });
  await waitFor(() => expect(translateBtn).toHaveAttribute("aria-pressed", "true"));

  fireEvent.keyDown(window, { key: "Tab", ctrlKey: true });
  await waitFor(() => expect(translateBtn).toHaveAttribute("aria-pressed", "true"));

  // Only T toggles it off.
  fireEvent.keyDown(window, { key: "t" });
  await waitFor(() => expect(translateBtn).toHaveAttribute("aria-pressed", "false"));
});
