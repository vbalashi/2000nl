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
