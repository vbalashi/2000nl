import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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

const overrideWord = {
  ...mockWord,
  id: "word-2",
  headword: "boom",
};

const normalNextWord = {
  ...mockWord,
  id: "word-3",
  headword: "fiets",
};

const defaultAvailableList = {
  id: "list-1",
  name: "Test list",
  type: "curated" as const,
  item_count: 1,
};

const activeList = {
  id: "list-active",
  name: "Active list",
  type: "curated" as const,
  item_count: 10,
  card_policy: "restrict" as const,
  card_type_ids: ["listen-recognize"],
};

const secondaryList = {
  id: "list-secondary",
  name: "Secondary list",
  type: "curated" as const,
  item_count: 2,
  default_scenario_id: "listening",
};

const userOwnedList = {
  id: "list-user",
  name: "My saved words",
  type: "user" as const,
  item_count: 3,
};

const dictionaryHuis = {
  id: "word-1",
  headword: "huis",
  part_of_speech: "zn",
  raw: { meanings: [{ definition: "Een gebouw", links: [] }] },
  is_nt2_2000: true,
};

const dictionaryBoom = {
  id: "word-2",
  headword: "boom",
  part_of_speech: "zn",
  raw: { meanings: [{ definition: "Een hoge plant", links: [] }] },
  is_nt2_2000: false,
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
const fetchAvailableLists = vi.fn().mockResolvedValue([defaultAvailableList]);
const fetchActiveList = vi.fn().mockResolvedValue({ listId: null, listType: null });
const fetchListSummaryById = vi.fn().mockResolvedValue(null);
const updateActiveList = vi.fn().mockResolvedValue(undefined);
const searchWordEntries = vi.fn().mockResolvedValue({
  items: [dictionaryHuis],
  total: 1,
});
const fetchWordsForList = vi.fn().mockResolvedValue({
  items: [dictionaryHuis],
  total: 1,
});
const recordWordView = vi.fn().mockResolvedValue(undefined);
const recordReview = vi.fn().mockResolvedValue(null);
const recordDefinitionClick = vi.fn().mockResolvedValue(undefined);
const fetchDictionaryEntry = vi.fn().mockResolvedValue(null);
const fetchTrainingWordByLookup = vi.fn().mockResolvedValue(overrideWord);
const fetchEntryListMemberships = vi.fn().mockResolvedValue(new Map());
const fetchTrainingScenarios = vi.fn().mockResolvedValue([
  {
    id: "understanding",
    enabled: true,
    nameNl: "Begrip",
    nameEn: "Understanding",
    description: null,
  },
  {
    id: "listening",
    enabled: true,
    nameNl: "Luisteren",
    nameEn: "Listening",
    description: null,
  },
]);
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
  fetchTrainingScenarios,
  fetchStats,
  fetchRecentHistory,
  fetchActiveList,
  fetchListSummaryById,
  fetchAvailableLists,
  fetchWordsForList,
  searchWordEntries,
  fetchEntryListMemberships,
  updateActiveList,
  recordDefinitionClick,
  recordReview,
  recordWordView,
  fetchTrainingWordByLookup,
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

const useTwoListScope = () => {
  fetchActiveList.mockResolvedValue({
    listId: activeList.id,
    listType: activeList.type,
  });
  fetchListSummaryById.mockResolvedValue(activeList);
  fetchAvailableLists.mockResolvedValue([activeList, secondaryList, userOwnedList]);
};

const restoreDefaultListScope = () => {
  fetchActiveList.mockResolvedValue({ listId: null, listType: null });
  fetchListSummaryById.mockResolvedValue(null);
  fetchAvailableLists.mockResolvedValue([defaultAvailableList]);
};

const restoreDefaultSearchResults = () => {
  searchWordEntries.mockResolvedValue({
    items: [dictionaryHuis],
    total: 1,
  });
};

const restoreDefaultListResults = () => {
  fetchWordsForList.mockResolvedValue({
    items: [dictionaryHuis],
    total: 1,
  });
};

const waitForInitialTrainingFetches = async () => {
  await screen.findByRole("heading", { name: "huis" });
  await waitFor(() =>
    expect(fetchNextTrainingWordByScenario.mock.calls.length).toBeGreaterThanOrEqual(
      2,
    ),
  );
};

test("search action opens the dedicated dictionary search surface", async () => {
  render(<TrainingScreen user={user} />);

  await screen.findByRole("heading", { name: "huis" });

  fireEvent.click(screen.getByLabelText("Zoeken"));

  await screen.findByPlaceholderText(/zoek in het woordenboek/i);
  const searchTab = screen
    .getAllByRole("button", { name: "Zoeken" })
    .find((el) => el.tagName === "BUTTON");
  expect(searchTab).toHaveClass(
    "border-primary",
  );
  expect(screen.getByRole("button", { name: "Lijsten" })).toBeInTheDocument();
  expect(screen.getByText(/Zoekt in VanDale woordenboek/i)).toBeInTheDocument();
  expect(screen.getByText("Typ een woord om te zoeken")).toBeInTheDocument();
  expect(screen.getByLabelText(/alleen deze lijst/i)).toBeInTheDocument();
  expect(screen.queryByText(/Alleen actieve lijst/i)).not.toBeInTheDocument();
  expect(searchWordEntries).not.toHaveBeenCalled();
});

test("dictionary lookup preserves an open entry with an explicit stale-detail label", async () => {
  searchWordEntries.mockImplementation(async ({ query }: { query?: string }) =>
    query === "boom"
      ? { items: [dictionaryBoom], total: 1 }
      : { items: [dictionaryHuis], total: 1 },
  );

  try {
    render(<TrainingScreen user={user} />);

    await screen.findByRole("heading", { name: "huis" });
    fireEvent.click(screen.getByLabelText("Zoeken"));

    const queryInput = await screen.findByPlaceholderText(/zoek in het woordenboek/i);
    fireEvent.change(queryInput, { target: { value: "huis" } });
    await screen.findByText("Details");

    fireEvent.change(queryInput, { target: { value: "boom" } });

    await screen.findByText("boom");
    expect(
      await screen.findByText(
        "Deze entry is bewaard terwijl de zoekresultaten veranderden.",
      ),
    ).toBeInTheDocument();
  } finally {
    restoreDefaultSearchResults();
  }
});

test("lists tab opens the dedicated list management surface", async () => {
  fetchWordsForList.mockClear();

  render(<TrainingScreen user={user} />);

  await screen.findByRole("heading", { name: "huis" });

  fireEvent.click(screen.getByLabelText("Instellingen"));
  const listsTab = await screen.findByRole("button", { name: "Lijsten" });
  fireEvent.click(listsTab);

  await screen.findByRole("button", { name: "Woorden" });
  expect(
    screen.getByRole("button", { name: "Trainingsinstellingen" }),
  ).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Info" })).toBeInTheDocument();
  expect(screen.getAllByText(/Lijst: Test list/i).length).toBeGreaterThan(0);
  expect(screen.getAllByText("Lijst").length).toBeGreaterThan(0);
  await waitFor(() => expect(fetchWordsForList).toHaveBeenCalled());
});

test("list-filtered search empty state names the viewed-list filter", async () => {
  fetchWordsForList
    .mockResolvedValueOnce({ items: [dictionaryHuis], total: 1 })
    .mockResolvedValueOnce({ items: [], total: 0 });

  try {
    render(<TrainingScreen user={user} />);

    await screen.findByRole("heading", { name: "huis" });

    fireEvent.click(screen.getByLabelText("Instellingen"));
    fireEvent.click(await screen.findByRole("button", { name: "Lijsten" }));

    const filterInput = (
      await screen.findAllByPlaceholderText(/filter woorden binnen deze lijst/i)
    )[0];
    fireEvent.change(filterInput, { target: { value: "zzzz" } });

    expect(
      await screen.findByText("Geen woorden in deze lijst."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/De filter binnen 'Test list' vond niets/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Zoek in woordenboek" }))
      .toBeInTheDocument();
  } finally {
    restoreDefaultListResults();
  }
});

test("dictionary lookup empty state names the dictionary source search", async () => {
  searchWordEntries.mockResolvedValue({ items: [], total: 0 });

  try {
    render(<TrainingScreen user={user} />);

    await screen.findByRole("heading", { name: "huis" });
    fireEvent.click(screen.getByLabelText("Zoeken"));
    fireEvent.change(await screen.findByPlaceholderText(/zoek in het woordenboek/i), {
      target: { value: "zzzz" },
    });

    expect(
      await screen.findByText("Geen woordenboekresultaten gevonden."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/De zoekopdracht in VanDale woordenboek vond niets/i),
    ).toBeInTheDocument();
  } finally {
    restoreDefaultSearchResults();
  }
});

test("clicking a list in Lijsten changes only the viewed list", async () => {
  useTwoListScope();
  fetchNextTrainingWordByScenario.mockClear();
  updateActiveList.mockClear();
  fetchStats.mockClear();
  fetchWordsForList.mockClear();

  try {
    render(<TrainingScreen user={user} />);

    await waitForInitialTrainingFetches();
    fetchNextTrainingWordByScenario.mockClear();
    updateActiveList.mockClear();
    fetchStats.mockClear();

    fireEvent.click(screen.getByLabelText("Instellingen"));
    fireEvent.click(await screen.findByRole("button", { name: "Lijsten" }));

    const secondaryListButton = await screen.findByRole("button", {
      name: /secondary list/i,
    });
    fireEvent.click(secondaryListButton);

    await waitFor(() =>
      expect(fetchWordsForList).toHaveBeenCalledWith(
        "list-secondary",
        "curated",
        expect.objectContaining({ page: 1 }),
      ),
    );
    expect(updateActiveList).not.toHaveBeenCalled();
    expect(fetchStats).not.toHaveBeenCalled();
    expect(fetchNextTrainingWordByScenario).not.toHaveBeenCalled();
    expect(screen.getAllByText("Active list").length).toBeGreaterThan(0);
  } finally {
    restoreDefaultListScope();
  }
});

test("explicit list action makes the viewed list active for training", async () => {
  useTwoListScope();
  fetchNextTrainingWordByScenario.mockClear();
  updateActiveList.mockClear();
  fetchStats.mockClear();

  try {
    render(<TrainingScreen user={user} />);

    await waitForInitialTrainingFetches();
    fetchNextTrainingWordByScenario.mockClear();
    updateActiveList.mockClear();
    fetchStats.mockClear();

    fireEvent.click(screen.getByLabelText("Instellingen"));
    fireEvent.click(await screen.findByRole("button", { name: "Lijsten" }));
    fireEvent.click(
      await screen.findByRole("button", { name: /secondary list/i }),
    );

    fireEvent.click(
      await screen.findByRole("button", {
        name: /maak actief voor training/i,
      }),
    );

    await waitFor(() =>
      expect(updateActiveList).toHaveBeenCalledWith({
        userId: "user-1",
        listId: "list-secondary",
        listType: "curated",
      }),
    );
    await waitFor(() =>
      expect(fetchNextTrainingWordByScenario).toHaveBeenCalled(),
    );
    expect(
      fetchNextTrainingWordByScenario.mock.calls.some((call) => {
        const scope = call[3] as { listId?: string; listType?: string };
        return (
          call[1] === "listening" &&
          scope?.listId === "list-secondary" &&
          scope?.listType === "curated"
        );
      }),
    ).toBe(true);
  } finally {
    restoreDefaultListScope();
  }
});

test("footer list selector still changes active training scope", async () => {
  useTwoListScope();
  fetchNextTrainingWordByScenario.mockClear();
  updateActiveList.mockClear();
  fetchStats.mockClear();

  try {
    render(<TrainingScreen user={user} />);

    await waitForInitialTrainingFetches();
    fetchNextTrainingWordByScenario.mockClear();
    updateActiveList.mockClear();
    fetchStats.mockClear();

    fireEvent.click(screen.getByRole("button", { name: /active list/i }));
    fireEvent.click(
      await screen.findByRole("button", { name: /secondary list/i }),
    );

    await waitFor(() =>
      expect(updateActiveList).toHaveBeenCalledWith({
        userId: "user-1",
        listId: "list-secondary",
        listType: "curated",
      }),
    );
    expect(
      fetchNextTrainingWordByScenario.mock.calls.some((call) => {
        const scope = call[3] as { listId?: string; listType?: string };
        return (
          call[1] === "listening" &&
          scope?.listId === "list-secondary" &&
          scope?.listType === "curated"
        );
      }),
    ).toBe(true);
  } finally {
    restoreDefaultListScope();
  }
});

test("search detail trains a selected entry as the next card without changing active scope", async () => {
  useTwoListScope();
  searchWordEntries.mockResolvedValue({ items: [dictionaryBoom], total: 1 });
  fetchTrainingWordByLookup.mockClear();
  fetchTrainingWordByLookup.mockResolvedValueOnce(overrideWord);
  fetchNextTrainingWordByScenario.mockClear();
  updateActiveList.mockClear();

  try {
    render(<TrainingScreen user={user} />);

    await waitForInitialTrainingFetches();
    fetchNextTrainingWordByScenario.mockClear();
    updateActiveList.mockClear();

    fireEvent.click(screen.getByLabelText("Zoeken"));
    fireEvent.change(await screen.findByPlaceholderText(/zoek in het woordenboek/i), {
      target: { value: "boom" },
    });
    await screen.findAllByText("boom");

    fireEvent.click(
      await screen.findByRole("button", {
        name: /train dit woord als volgende kaart/i,
      }),
    );

    await screen.findByRole("heading", { name: "boom" });
    expect(
      await screen.findByText(
        "boom is nu de volgende kaart. Daarna gaat normale training verder.",
      ),
    ).toBeInTheDocument();
    expect(fetchTrainingWordByLookup).toHaveBeenCalledWith("word-2", "user-1");
    expect(updateActiveList).not.toHaveBeenCalled();
    expect(
      fetchNextTrainingWordByScenario.mock.calls.some((call) => {
        const scope = call[3] as { listId?: string; listType?: string };
        return scope?.listId === "list-secondary";
      }),
    ).toBe(false);
  } finally {
    restoreDefaultSearchResults();
    restoreDefaultListScope();
    fetchTrainingWordByLookup.mockResolvedValue(overrideWord);
  }
});

test("next-card override is one-shot and normal training resumes after review", async () => {
  searchWordEntries.mockResolvedValue({ items: [dictionaryBoom], total: 1 });
  fetchTrainingWordByLookup.mockClear();
  fetchTrainingWordByLookup.mockResolvedValueOnce(overrideWord);
  fetchNextTrainingWordByScenario.mockReset();
  fetchNextTrainingWordByScenario
    .mockResolvedValueOnce(mockWord)
    .mockResolvedValue(normalNextWord);
  recordReview.mockReset();
  recordReview.mockResolvedValue(null);

  try {
    render(<TrainingScreen user={user} />);

    await screen.findByRole("heading", { name: "huis" });

    fireEvent.click(screen.getByLabelText("Zoeken"));
    fireEvent.change(await screen.findByPlaceholderText(/zoek in het woordenboek/i), {
      target: { value: "boom" },
    });
    await screen.findAllByText("boom");
    fireEvent.click(
      await screen.findByRole("button", {
        name: /train dit woord als volgende kaart/i,
      }),
    );

    await screen.findByRole("heading", { name: "boom" });
    await waitFor(() => expect(fetchTrainingWordByLookup).toHaveBeenCalledTimes(1));

    fireEvent.keyDown(window, { key: " " });
    await screen.findByRole("button", { name: /opnieuw/i });
    fireEvent.keyDown(window, { key: "k" });

    await waitFor(() =>
      expect(recordReview).toHaveBeenCalledWith(
        expect.objectContaining({ wordId: "word-2", result: "success" }),
      ),
    );
    await screen.findByRole("heading", { name: "fiets" });
    expect(fetchTrainingWordByLookup).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByText(/Daarna gaat normale training verder/i),
    ).not.toBeInTheDocument();
  } finally {
    restoreDefaultSearchResults();
    fetchNextTrainingWordByScenario.mockReset();
    fetchNextTrainingWordByScenario.mockResolvedValue(mockWord);
    recordReview.mockReset();
    recordReview.mockResolvedValue(null);
    fetchTrainingWordByLookup.mockResolvedValue(overrideWord);
  }
});

test("training UI shows active list, scenario, card filter, and list policy as one effective scope", async () => {
  useTwoListScope();

  try {
    render(<TrainingScreen user={user} />);

    await screen.findByRole("heading", { name: "huis" });

    const footerScope = await screen.findByRole("region", {
      name: "Training",
    });
    expect(
      within(footerScope).getByText(
        "Training: Active list · Begrip · Nieuw + herhaling",
      ),
    ).toBeInTheDocument();
    expect(
      within(footerScope).getByLabelText(/Beperkt tot Luisteren/),
    ).toBeInTheDocument();
  } finally {
    restoreDefaultListScope();
  }
});

test("settings training section repeats the effective training scope without using viewed-list state", async () => {
  useTwoListScope();

  try {
    render(<TrainingScreen user={user} />);

    await waitForInitialTrainingFetches();

    fireEvent.click(screen.getByLabelText("Instellingen"));

    const scopeSummaries = await screen.findAllByRole("region", {
      name: "Training",
    });
    const settingsScope = scopeSummaries[scopeSummaries.length - 1];
    expect(
      within(settingsScope).getByText(
        "Training: Active list · Begrip · Nieuw + herhaling",
      ),
    ).toBeInTheDocument();
    expect(within(settingsScope).getByLabelText(/Beperkt tot Luisteren/))
      .toBeInTheDocument();

    fireEvent.click(await screen.findByRole("button", { name: "Lijsten" }));
    fireEvent.click(
      await screen.findByRole("button", { name: /secondary list/i }),
    );
    const settingsTab = screen
      .getAllByRole("button", { name: "Instellingen" })
      .find((element) => element.tagName === "BUTTON");
    expect(settingsTab).toBeDefined();
    fireEvent.click(settingsTab!);

    const updatedScopeSummaries = await screen.findAllByRole("region", {
      name: "Training",
    });
    const updatedSettingsScope =
      updatedScopeSummaries[updatedScopeSummaries.length - 1];
    expect(
      within(updatedSettingsScope).getByText(
        "Training: Active list · Begrip · Nieuw + herhaling",
      ),
    ).toBeInTheDocument();
    expect(
      within(updatedSettingsScope).queryByText("Secondary list"),
    ).not.toBeInTheDocument();
  } finally {
    restoreDefaultListScope();
  }
});

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

test("rapid hotkeys while review is in-flight trigger only one review (US-093.5)", async () => {
  // Keep the review in-flight so the sync guard stays active.
  recordReview.mockReset();
  recordReview.mockImplementation(() => new Promise(() => {}));

  try {
    render(<TrainingScreen user={user} />);

    await screen.findByRole("heading", { name: "huis" });

    // Reveal answer so grade hotkeys are available.
    fireEvent.keyDown(window, { key: " " });
    await screen.findByRole("button", { name: /opnieuw/i });

    // Two rapid grades should only submit once.
    fireEvent.keyDown(window, { key: "k" });
    fireEvent.keyDown(window, { key: "h" });

    await waitFor(() => expect(recordReview).toHaveBeenCalledTimes(1));
    expect(recordReview).toHaveBeenCalledWith(
      expect.objectContaining({ result: "success" })
    );
  } finally {
    recordReview.mockReset();
    recordReview.mockResolvedValue(null);
  }
});

test("mobile card uses hybrid height so content can scroll within the card", async () => {
  render(<TrainingScreen user={user} />);

  await screen.findByRole("heading", { name: "huis" });

  const frame = screen.getByTestId("training-card-frame");
  expect(frame.className).toContain("min-h-[360px]");
  expect(frame.className).toContain("h-[clamp(360px,55dvh,520px)]");
  expect(frame.className).toContain("max-h-[520px]");
  // Desktop behavior remains aspect-ratio driven.
  expect(frame.className).toContain("md:aspect-[16/10]");
  expect(frame.className).toContain("md:h-auto");
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
  const randomUUID = vi
    .fn()
    .mockReturnValueOnce("turn-1")
    .mockReturnValueOnce("turn-2")
    .mockReturnValueOnce("turn-3");
  vi.stubGlobal("crypto", { randomUUID } as unknown as Crypto);

  try {
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
    fetchNextTrainingWordByScenario
      .mockResolvedValueOnce(word1)
      .mockResolvedValue(word2);

    recordReview.mockReset();
    // Keep the review in-flight to prove the UI switches without waiting for it.
    recordReview.mockImplementation(() => new Promise(() => {}));

    render(<TrainingScreen user={user} />);

    await screen.findByRole("heading", { name: "huis" });

    // Wait for the background prefetch to at least start and resolve.
    await waitFor(() =>
      expect(fetchNextTrainingWordByScenario.mock.calls.length).toBeGreaterThanOrEqual(
        2
      )
    );

    // Reveal answer then grade.
    fireEvent.keyDown(window, { key: " " });
    await screen.findByRole("button", { name: /opnieuw/i });

    fireEvent.keyDown(window, { key: "k" });

    // The UI should advance to the prefetched next card without waiting for recordReview.
    await screen.findByRole("heading", { name: "boom" });

    await waitFor(() =>
      expect(recordReview).toHaveBeenCalledWith(
        expect.objectContaining({ result: "success", turnId: "turn-1" })
      )
    );
  } finally {
    recordReview.mockReset();
    recordReview.mockResolvedValue(null);
    if (typeof (vi as any).unstubAllGlobals === "function") {
      (vi as any).unstubAllGlobals();
    }
  }
});

test("US-094.3: after grading a card, the next prefetch exclude list includes the graded card key", async () => {
  const words = [
    { ...mockWord, id: "word-1", headword: "huis" },
    { ...mockWord, id: "word-2", headword: "boom" },
    { ...mockWord, id: "word-3", headword: "fiets" },
  ];

  fetchNextTrainingWordByScenario.mockReset();
  fetchNextTrainingWordByScenario.mockImplementation(
    async (
      _userId: string,
      _scenarioId: string,
      _excludeWordIds: string[],
      _scope: unknown,
      _cardFilter: unknown,
      _queueTurn: unknown,
      excludeCardKeys: string[] = [],
    ) => {
      return (
        words.find(
          (w) => !excludeCardKeys.includes(`${w.id}:${w.mode}`),
        ) ?? null
      );
    },
  );
  recordReview.mockReset();
  recordReview.mockResolvedValue(null);

  render(<TrainingScreen user={user} />);

  await screen.findByRole("heading", { name: "huis" });

  // Wait for background prefetch to run at least once.
  await waitFor(() =>
    expect(fetchNextTrainingWordByScenario.mock.calls.length).toBeGreaterThanOrEqual(
      2,
    ),
  );

  // Reveal then grade current card.
  fireEvent.keyDown(window, { key: " " });
  await screen.findByRole("button", { name: /opnieuw/i });
  fireEvent.keyDown(window, { key: "k" });

  // Should advance to next card (prefetched or on-demand).
  await screen.findByRole("heading", { name: "boom" });

  // While viewing word-2, next prefetch should exclude both word-2's current
  // card and the previously graded word-1 card.
  await waitFor(() => {
    const hasExclude = fetchNextTrainingWordByScenario.mock.calls.some((c) => {
      const exclude = c[6] as string[];
      return (
        exclude.includes("word-1:word-to-definition") &&
        exclude.includes("word-2:word-to-definition")
      );
    });
    expect(hasExclude).toBe(true);
  });
});

test("US-094.3: after grading multiple cards, all graded card keys are in the exclude list", async () => {
  const words = [
    { ...mockWord, id: "word-1", headword: "huis" },
    { ...mockWord, id: "word-2", headword: "boom" },
    { ...mockWord, id: "word-3", headword: "fiets" },
    { ...mockWord, id: "word-4", headword: "kat" },
  ];

  fetchNextTrainingWordByScenario.mockReset();
  fetchNextTrainingWordByScenario.mockImplementation(
    async (
      _userId: string,
      _scenarioId: string,
      _excludeWordIds: string[],
      _scope: unknown,
      _cardFilter: unknown,
      _queueTurn: unknown,
      excludeCardKeys: string[] = [],
    ) => {
      return (
        words.find(
          (w) => !excludeCardKeys.includes(`${w.id}:${w.mode}`),
        ) ?? null
      );
    },
  );
  recordReview.mockReset();
  recordReview.mockResolvedValue(null);

  render(<TrainingScreen user={user} />);

  await screen.findByRole("heading", { name: "huis" });

  // Grade word-1.
  fireEvent.keyDown(window, { key: " " });
  await screen.findByRole("button", { name: /opnieuw/i });
  fireEvent.keyDown(window, { key: "k" });
  await screen.findByRole("heading", { name: "boom" });

  // Grade word-2.
  fireEvent.keyDown(window, { key: " " });
  await screen.findByRole("button", { name: /opnieuw/i });
  fireEvent.keyDown(window, { key: "k" });
  await screen.findByRole("heading", { name: "fiets" });

  // While viewing word-3, next prefetch should exclude both graded IDs.
  await waitFor(() => {
    const hasExclude = fetchNextTrainingWordByScenario.mock.calls.some((c) => {
      const exclude = c[6] as string[];
      return (
        exclude.includes("word-1:word-to-definition") &&
        exclude.includes("word-2:word-to-definition") &&
        exclude.includes("word-3:word-to-definition")
      );
    });
    expect(hasExclude).toBe(true);
  });
});

test("US-094.3: session-reviewed set is cleared on scenario change", async () => {
  const words = [
    { ...mockWord, id: "word-1", headword: "huis" },
    { ...mockWord, id: "word-2", headword: "boom" },
    { ...mockWord, id: "word-3", headword: "fiets" },
  ];

  fetchNextTrainingWordByScenario.mockReset();
  fetchNextTrainingWordByScenario.mockImplementation(
    async (
      _userId: string,
      _scenarioId: string,
      _excludeWordIds: string[],
      _scope: unknown,
      _cardFilter: unknown,
      _queueTurn: unknown,
      excludeCardKeys: string[] = [],
    ) => {
      return (
        words.find(
          (w) => !excludeCardKeys.includes(`${w.id}:${w.mode}`),
        ) ?? null
      );
    },
  );
  recordReview.mockReset();
  recordReview.mockResolvedValue(null);

  render(<TrainingScreen user={user} />);

  await screen.findByRole("heading", { name: "huis" });

  // Grade one card so it becomes part of the session-reviewed set.
  fireEvent.keyDown(window, { key: " " });
  await screen.findByRole("button", { name: /opnieuw/i });
  fireEvent.keyDown(window, { key: "k" });
  await screen.findByRole("heading", { name: "boom" });

  // Open settings from the footer, switch scenario.
  const openScenario = await screen.findByRole("button", {
    name: /wijzig scenario in instellingen/i,
  });
  fireEvent.click(openScenario);

  // SettingsModal loads scenarios async; wait for the scenario buttons.
  const listeningBtn = await screen.findByRole("button", { name: /luisteren/i });
  fetchNextTrainingWordByScenario.mockClear();
  fireEvent.click(listeningBtn);

  // Scenario change triggers an immediate fresh loadNextWord([]) call with the
  // newly selected scenario, not the previous scenario from React state.
  await waitFor(() =>
    expect(fetchNextTrainingWordByScenario).toHaveBeenCalled(),
  );
  expect(fetchNextTrainingWordByScenario.mock.calls[0][1]).toBe("listening");
  expect(fetchNextTrainingWordByScenario.mock.calls[0][2]).toEqual([]);
  expect(fetchNextTrainingWordByScenario.mock.calls[0][6]).toEqual([]);

  // The fresh load should also clear the session-reviewed set.
  await waitFor(() => {
    const hasClearedFetch = fetchNextTrainingWordByScenario.mock.calls.some((c) => {
      const scenarioId = c[1] as string;
      const exclude = c[6] as string[];
      return (
        scenarioId === "listening" &&
        !exclude.includes("word-1:word-to-definition")
      );
    });
    expect(hasClearedFetch).toBe(true);
  });
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
