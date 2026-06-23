import React from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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

const mixedUserList = {
  id: "list-mixed",
  name: "Travel mix",
  type: "user" as const,
  item_count: 4,
  is_mixed_language: true,
};

const dictionarySourceList = {
  id: "list-dictionary",
  name: "VanDale",
  type: "curated" as const,
  item_count: 0,
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

const dictionaryCompound = {
  id: "word-3",
  headword: "bejaardenhuis",
  part_of_speech: "zn",
  raw: { meanings: [{ definition: "Een tehuis voor ouderen", links: [] }] },
  is_nt2_2000: false,
};

const dictionarySter = {
  id: "word-ster",
  headword: "ster",
  part_of_speech: "zn",
  raw: { meanings: [{ definition: "Een hemellichaam", links: [] }] },
  is_nt2_2000: false,
};

const dictionaryStedelijk = {
  id: "word-stedelijk",
  headword: "stedelijk",
  part_of_speech: "bn",
  raw: { meanings: [{ definition: "Met een stad te maken", links: [] }] },
  is_nt2_2000: false,
};

const userDictionaryGedoe = {
  id: "user-entry-1",
  dictionary_id: "dict-user",
  dictionary_name: "My dictionary",
  dictionary_slug: "user-user-1-nl",
  dictionary_kind: "user",
  language_code: "nl",
  headword: "gedoe",
  part_of_speech: "zn",
  raw: {
    headword: "gedoe",
    languageCode: "nl",
    definition: "lastige situatie",
    translation: { languageCode: "en", text: "hassle" },
  },
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
const fetchAvailableLearningLanguages = vi.fn().mockResolvedValue([
  {
    code: "nl",
    label: "Nederlands",
    dictionaryCount: 1,
    curatedListCount: 1,
    userListCount: 0,
    hasTrainingEligibleLists: true,
  },
  {
    code: "en",
    label: "English",
    dictionaryCount: 2,
    curatedListCount: 1,
    userListCount: 0,
    hasTrainingEligibleLists: true,
  },
]);
const fetchAvailableDictionarySources = vi.fn().mockResolvedValue([
  {
    id: "dict-vandale",
    languageCode: "nl",
    slug: "nl-vandale",
    name: "VanDale woordenboek",
    kind: "curated",
    visibility: "public",
    isEditable: false,
    entryCount: 2000,
  },
]);
const defaultActiveTrainingScope = {
  languageCode: "nl",
  activeListId: null,
  activeListType: null,
  activeScenario: "understanding",
  cardFilter: "both",
  modesEnabled: ["word-to-definition"],
  newReviewRatio: 2,
  hasSavedScope: false,
  isValid: true,
};
const fetchActiveTrainingScope = vi
  .fn()
  .mockResolvedValue(defaultActiveTrainingScope);
const fetchListSummaryById = vi.fn().mockResolvedValue(null);
const updateActiveTrainingScope = vi
  .fn()
  .mockResolvedValue({ scope: null, error: null });
const searchWordEntries = vi.fn().mockResolvedValue({
  items: [dictionaryHuis],
  total: 1,
});
const searchDictionaryEntriesV2 = vi.fn().mockResolvedValue({
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
const fetchDictionaryEntryById = vi.fn().mockResolvedValue(null);
const fetchTrainingWordByLookup = vi.fn().mockResolvedValue(overrideWord);
const fetchEntryListMemberships = vi.fn().mockResolvedValue(new Map());
const createUserDictionaryEntry = vi.fn().mockResolvedValue("user-entry-1");
const copyEntryToUserDictionary = vi.fn().mockResolvedValue("user-entry-copy");
const addWordsToUserList = vi.fn().mockResolvedValue({ error: null });
const createUserList = vi.fn().mockResolvedValue(userOwnedList);
const fetchUserListMembership = vi.fn().mockResolvedValue(new Set());
const removeWordsFromUserList = vi.fn().mockResolvedValue({ error: null });
const deleteUserList = vi.fn().mockResolvedValue({ error: null });
const updateUserList = vi.fn().mockResolvedValue(userOwnedList);
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
const fetchTrainingFilterSources = vi.fn().mockResolvedValue([
  {
    sourceId: "source-youtube-1",
    kind: "youtube_video",
    provider: "youtube",
    externalId: "video-1",
    title: "TRAPPIST-1",
    label: "YouTube · TRAPPIST-1",
    eventCount: 3,
    lastSeenAt: "2026-06-23T10:00:00Z",
  },
]);
const isTrainingFocusFilterActive = vi.fn((filter) =>
  Boolean(
    filter &&
      (filter.dateWindow !== "all" ||
        filter.sourceId ||
        filter.sourceKind ||
        filter.externalId),
  ),
);
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
  fetchDictionaryEntryById,
  createUserDictionaryEntry,
  copyEntryToUserDictionary,
  fetchNextTrainingWord: vi.fn().mockResolvedValue(mockWord),
  fetchNextTrainingWordByScenario,
  fetchTrainingFilterSources,
  fetchTrainingScenarios,
  isTrainingFocusFilterActive,
  fetchStats,
  fetchRecentHistory,
  fetchActiveTrainingScope,
  fetchListSummaryById,
  fetchAvailableLists,
  fetchAvailableLearningLanguages,
  fetchAvailableDictionarySources,
  fetchWordsForList,
  searchDictionaryEntriesV2,
  searchWordEntries,
  fetchEntryListMemberships,
  addWordsToUserList,
  createUserList,
  fetchUserListMembership,
  removeWordsFromUserList,
  deleteUserList,
  updateUserList,
  updateActiveTrainingScope,
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
  fetchActiveTrainingScope.mockResolvedValue({
    ...defaultActiveTrainingScope,
    activeListId: activeList.id,
    activeListType: activeList.type,
    hasSavedScope: true,
  });
  fetchListSummaryById.mockResolvedValue(activeList);
  fetchAvailableLists.mockResolvedValue([activeList, secondaryList, userOwnedList]);
};

const restoreDefaultListScope = () => {
  fetchActiveTrainingScope.mockResolvedValue(defaultActiveTrainingScope);
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
  expect(
    screen.queryByRole("button", { name: /wis zoekopdracht/i }),
  ).not.toBeInTheDocument();
  expect(searchWordEntries).not.toHaveBeenCalled();
});

test("training focus filters pass date and source scope to card selection", async () => {
  render(<TrainingScreen user={user} />);

  await waitForInitialTrainingFetches();
  await waitFor(() => expect(fetchTrainingFilterSources).toHaveBeenCalledWith(user.id));
  fetchNextTrainingWordByScenario.mockClear();

  fireEvent.change(screen.getByLabelText("Periode"), {
    target: { value: "today" },
  });
  fireEvent.change(screen.getByLabelText("Bron"), {
    target: { value: "source:source-youtube-1" },
  });

  await waitFor(() =>
    expect(
      fetchNextTrainingWordByScenario.mock.calls.some((call) => {
        const filter = call[8];
        return (
          filter?.dateWindow === "today" &&
          filter?.sourceId === "source-youtube-1"
        );
      }),
    ).toBe(true),
  );
  expect(screen.getByText(/Gefilterde training:/i)).toHaveTextContent(
    /vandaag.*YouTube/i,
  );
});

test("dictionary search scope changes lookup language without changing training", async () => {
  updateActiveTrainingScope.mockClear();
  searchWordEntries.mockClear();

  render(<TrainingScreen user={user} />);

  await screen.findByRole("heading", { name: "huis" });

  fireEvent.click(screen.getByLabelText("Zoeken"));
  await screen.findByText("Zoekbereik");

  const languageSelect = screen.getByLabelText("Leertaal");
  fireEvent.change(languageSelect, { target: { value: "en" } });

  const queryInput = await screen.findByPlaceholderText(/zoek in het woordenboek/i);
  fireEvent.change(queryInput, { target: { value: "bank" } });

  await waitFor(() =>
    expect(searchWordEntries).toHaveBeenCalledWith(
      expect.objectContaining({
        query: "bank",
        languageCode: "en",
      }),
    ),
  );
  expect(updateActiveTrainingScope).not.toHaveBeenCalled();
});

test("dictionary search can create a private user dictionary entry", async () => {
  fetchAvailableLists.mockResolvedValue([defaultAvailableList, userOwnedList]);
  createUserDictionaryEntry.mockClear();
  addWordsToUserList.mockClear();
  fetchTrainingWordByLookup.mockClear();
  fetchDictionaryEntryById.mockClear();
  fetchDictionaryEntryById.mockResolvedValueOnce(userDictionaryGedoe);
  fetchTrainingWordByLookup.mockResolvedValueOnce({
    ...userDictionaryGedoe,
    mode: "word-to-definition",
    isFirstEncounter: false,
  });

  try {
    render(<TrainingScreen user={user} />);

    await waitForInitialTrainingFetches();
    updateActiveTrainingScope.mockClear();
    fireEvent.click(screen.getByLabelText("Zoeken"));

    fireEvent.click(await screen.findByRole("button", { name: "Eigen entry toevoegen" }));
    fireEvent.change(screen.getByLabelText("Hoofdwoord"), {
      target: { value: "gedoe" },
    });
    fireEvent.change(screen.getByLabelText("Definitie"), {
      target: { value: "lastige situatie" },
    });
    fireEvent.change(screen.getByLabelText("Vertaling"), {
      target: { value: "hassle" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Opslaan in mijn woordenboek" }));

    await waitFor(() =>
      expect(createUserDictionaryEntry).toHaveBeenCalledWith({
        entry: {
          headword: "gedoe",
          languageCode: "nl",
          definition: "lastige situatie",
          translation: { languageCode: "en", text: "hassle" },
        },
      }),
    );
    expect(fetchDictionaryEntryById).toHaveBeenCalledWith("user-entry-1", "user-1");
    expect(await screen.findByText("Eigen entry toegevoegd aan mijn woordenboek."))
      .toBeInTheDocument();
    expect(screen.getAllByText("gedoe").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/My dictionary/i).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "Toevoegen aan lijst" }));
    await waitFor(() =>
      expect(addWordsToUserList).toHaveBeenCalledWith("list-user", [
        "user-entry-1",
      ]),
    );

    const createdEntryActions = await screen.findAllByText("Meer acties");
    fireEvent.click(createdEntryActions[createdEntryActions.length - 1]);
    fireEvent.click(
      await screen.findByRole("button", {
        name: /train dit woord als volgende kaart/i,
      }),
    );
    await waitFor(() =>
      expect(fetchTrainingWordByLookup).toHaveBeenCalledWith(
        "user-entry-1",
        "user-1",
      ),
    );
    expect(updateActiveTrainingScope).not.toHaveBeenCalledWith(
      expect.objectContaining({ listId: "list-user" }),
    );
  } finally {
    restoreDefaultListScope();
    fetchDictionaryEntryById.mockResolvedValue(null);
    fetchTrainingWordByLookup.mockResolvedValue(overrideWord);
  }
});

test("dictionary lookup state persists while switching settings modal tabs", async () => {
  render(<TrainingScreen user={user} />);

  await screen.findByRole("heading", { name: "huis" });

  fireEvent.click(screen.getByLabelText("Zoeken"));

  const queryInput = await screen.findByPlaceholderText(/zoek in het woordenboek/i);
  fireEvent.change(queryInput, { target: { value: "huis" } });
  await screen.findByText("Details");

  const listFilter = screen.getByLabelText(/alleen deze lijst/i);
  fireEvent.click(listFilter);
  await waitFor(() => expect(listFilter).toBeChecked());
  await waitFor(() => expect(fetchWordsForList).toHaveBeenCalled());

  fireEvent.click(screen.getByRole("button", { name: "Lijsten" }));
  await screen.findAllByRole("button", { name: "Lijstinhoud" });

  fireEvent.click(screen.getAllByRole("button", { name: "Zoeken" })[1]);

  const restoredInput = await screen.findByPlaceholderText(/zoek in het woordenboek/i);
  expect(restoredInput).toHaveValue("huis");
  expect(screen.getByLabelText(/alleen deze lijst/i)).toBeChecked();
  expect(screen.getByText("Details")).toBeInTheDocument();
  expect(screen.getByText(/Alleen deze lijst: Test list/i)).toBeInTheDocument();
});

test("search detail opens a containing membership list without changing active training", async () => {
  fetchAvailableLists.mockResolvedValue([defaultAvailableList, userOwnedList]);
  fetchEntryListMemberships.mockResolvedValue(
    new Map([
      [
        dictionaryHuis.id,
        [
          {
            listId: userOwnedList.id,
            listType: "user",
            name: userOwnedList.name,
            editable: true,
            itemCount: userOwnedList.item_count,
            isActiveTrainingList: false,
          },
        ],
      ],
    ]),
  );
  fetchWordsForList.mockClear();
  updateActiveTrainingScope.mockClear();

  try {
    render(<TrainingScreen user={user} />);

    await screen.findByRole("heading", { name: "huis" });
    fireEvent.click(screen.getByLabelText("Zoeken"));
    fireEvent.change(await screen.findByPlaceholderText(/zoek in het woordenboek/i), {
      target: { value: "huis" },
    });

    await screen.findByText("My saved words");
    fireEvent.click(screen.getByRole("button", { name: "Open lijst" }));

    await waitFor(() =>
      expect(fetchWordsForList).toHaveBeenCalledWith(
        "list-user",
        "user",
        expect.objectContaining({ page: 1 }),
      ),
    );
    expect(screen.getAllByText(/Lijstinhoud: My saved words/i).length)
      .toBeGreaterThan(0);
    expect(updateActiveTrainingScope).not.toHaveBeenCalled();
  } finally {
    restoreDefaultListScope();
    restoreDefaultListResults();
    fetchEntryListMemberships.mockResolvedValue(new Map());
  }
});

test("dictionary lookup state resets after closing the settings modal", async () => {
  render(<TrainingScreen user={user} />);

  await screen.findByRole("heading", { name: "huis" });

  fireEvent.click(screen.getByLabelText("Zoeken"));
  const queryInput = await screen.findByPlaceholderText(/zoek in het woordenboek/i);
  fireEvent.change(queryInput, { target: { value: "huis" } });
  await screen.findByText("Details");

  fireEvent.click(screen.getByRole("button", { name: "Sluit" }));
  await waitFor(() =>
    expect(
      screen.queryByPlaceholderText(/zoek in het woordenboek/i),
    ).not.toBeInTheDocument(),
  );

  fireEvent.click(screen.getByLabelText("Zoeken"));
  const reopenedInput = await screen.findByPlaceholderText(/zoek in het woordenboek/i);
  expect(reopenedInput).toHaveValue("");
  expect(
    screen.queryByRole("button", { name: /wis zoekopdracht/i }),
  ).not.toBeInTheDocument();
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

test("dictionary lookup ignores stale responses from older queries", async () => {
  const deferred = <T,>() => {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((done) => {
      resolve = done;
    });
    return { promise, resolve };
  };
  const steSearch = deferred<{ items: typeof dictionaryStedelijk[]; total: number }>();
  const sterSearch = deferred<{ items: typeof dictionarySter[]; total: number }>();

  searchWordEntries.mockImplementation(({ query }: { query?: string }) => {
    if (query === "ste") return steSearch.promise;
    if (query === "ster") return sterSearch.promise;
    return Promise.resolve({ items: [], total: 0 });
  });

  try {
    render(<TrainingScreen user={user} />);

    await screen.findByRole("heading", { name: "huis" });
    fireEvent.click(screen.getByLabelText("Zoeken"));

    const queryInput = await screen.findByPlaceholderText(/zoek in het woordenboek/i);
    fireEvent.change(queryInput, { target: { value: "ste" } });
    await waitFor(() =>
      expect(searchWordEntries).toHaveBeenCalledWith(
        expect.objectContaining({ query: "ste" }),
      ),
    );

    fireEvent.change(queryInput, { target: { value: "ster" } });
    await waitFor(() =>
      expect(searchWordEntries).toHaveBeenCalledWith(
        expect.objectContaining({ query: "ster" }),
      ),
    );

    await act(async () => {
      sterSearch.resolve({ items: [dictionarySter], total: 1 });
      await sterSearch.promise;
    });

    expect(
      await screen.findByRole("button", { name: /ster[\s\S]*Een hemellichaam/i }),
    ).toBeInTheDocument();

    await act(async () => {
      steSearch.resolve({ items: [dictionaryStedelijk], total: 3964 });
      await steSearch.promise;
    });

    expect(
      screen.getByRole("button", { name: /ster[\s\S]*Een hemellichaam/i }),
    ).toBeInTheDocument();
    expect(screen.queryByText("stedelijk")).not.toBeInTheDocument();
    expect(screen.queryByText(/3964 resultaten/i)).not.toBeInTheDocument();
  } finally {
    restoreDefaultSearchResults();
  }
});

test("dictionary lookup shows backend match labels and preserves ranked order", async () => {
  searchWordEntries.mockResolvedValueOnce({
    items: [
      {
        ...dictionaryHuis,
        dictionary_name: "Van Dale NT2",
        search_match_group: "exact-headword",
        search_match_label: "Exacte match",
        search_group_rank: 1,
      },
      {
        ...dictionaryCompound,
        dictionary_name: "Van Dale NT2",
        search_match_group: "related-headword",
        search_match_label: "Samenstelling",
        search_group_rank: 3,
      },
    ],
    total: 2,
  });

  render(<TrainingScreen user={user} />);

  await screen.findByRole("heading", { name: "huis" });
  fireEvent.click(screen.getByLabelText("Zoeken"));

  const queryInput = await screen.findByPlaceholderText(/zoek in het woordenboek/i);
  fireEvent.change(queryInput, { target: { value: "huis" } });

  const exact = await screen.findByRole("button", {
    name: /huis[\s\S]*Exacte match/i,
  });
  const compound = screen.getByRole("button", {
    name: /bejaardenhuis[\s\S]*Samenstelling/i,
  });

  expect(
    exact.compareDocumentPosition(compound) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
});

test("lists tab opens the dedicated list management surface", async () => {
  fetchWordsForList.mockClear();

  render(<TrainingScreen user={user} />);

  await screen.findByRole("heading", { name: "huis" });

  fireEvent.click(screen.getByLabelText("Instellingen"));
  const listsTab = await screen.findByRole("button", { name: "Lijsten" });
  fireEvent.click(listsTab);

  await screen.findAllByRole("button", { name: "Lijstinhoud" });
  expect(
    screen.getByRole("button", { name: "Trainingsinstellingen" }),
  ).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Info" })).toBeInTheDocument();
  expect(screen.getAllByText(/Lijstinhoud: Test list/i).length).toBeGreaterThan(0);
  expect(screen.getAllByRole("button", { name: "Lijstinhoud" }).length).toBeGreaterThan(0);
  await waitFor(() => expect(fetchWordsForList).toHaveBeenCalled());
});

test("lists tab keeps dictionary source separate from list browsing", async () => {
  fetchAvailableLists.mockResolvedValue([defaultAvailableList, dictionarySourceList]);

  try {
    render(<TrainingScreen user={user} />);

    await screen.findByRole("heading", { name: "huis" });

    fireEvent.click(screen.getByLabelText("Instellingen"));
    fireEvent.click(await screen.findByRole("button", { name: "Lijsten" }));

    await screen.findByText("Trainingslijsten");
    expect(screen.getByText("Mijn lijsten")).toBeInTheDocument();
    expect(screen.queryByText("Woordenboekbronnen")).not.toBeInTheDocument();
    expect(screen.queryByText("VanDale woordenboek")).not.toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "Woordenboekentries" })[0]);

    expect(screen.getAllByText("Woordenboekentries").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Bron: VanDale woordenboek/i).length).toBeGreaterThan(0);
    expect(screen.queryByText("0 woorden")).not.toBeInTheDocument();
  } finally {
    restoreDefaultListScope();
  }
});

test("lists tab groups mixed-language user lists separately", async () => {
  fetchAvailableLists.mockResolvedValue([
    defaultAvailableList,
    userOwnedList,
    mixedUserList,
  ]);

  try {
    render(<TrainingScreen user={user} />);

    await screen.findByRole("heading", { name: "huis" });

    fireEvent.click(screen.getByLabelText("Instellingen"));
    fireEvent.click(await screen.findByRole("button", { name: "Lijsten" }));

    await screen.findByText("Mijn lijsten");
    expect(screen.getByText("My saved words")).toBeInTheDocument();
    expect(screen.getByText("Gemengde lijsten")).toBeInTheDocument();
    expect(screen.getByText("Travel mix")).toBeInTheDocument();
    expect(
      screen.getByText(/Lijsten met woorden uit meerdere talen blijven apart/i),
    ).toBeInTheDocument();
  } finally {
    restoreDefaultListScope();
  }
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
  updateActiveTrainingScope.mockClear();
  fetchStats.mockClear();
  fetchWordsForList.mockClear();

  try {
    render(<TrainingScreen user={user} />);

    await waitForInitialTrainingFetches();
    fetchNextTrainingWordByScenario.mockClear();
    updateActiveTrainingScope.mockClear();
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
    expect(updateActiveTrainingScope).not.toHaveBeenCalled();
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
  updateActiveTrainingScope.mockClear();
  fetchStats.mockClear();

  try {
    render(<TrainingScreen user={user} />);

    await waitForInitialTrainingFetches();
    fetchNextTrainingWordByScenario.mockClear();
    updateActiveTrainingScope.mockClear();
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
      expect(updateActiveTrainingScope).toHaveBeenCalledWith({
        userId: "user-1",
        languageCode: "nl",
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
  updateActiveTrainingScope.mockClear();
  fetchStats.mockClear();

  try {
    render(<TrainingScreen user={user} />);

    await waitForInitialTrainingFetches();
    fetchNextTrainingWordByScenario.mockClear();
    updateActiveTrainingScope.mockClear();
    fetchStats.mockClear();

    expect(
      screen.queryByRole("button", { name: /active list/i }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Wijzigen" }));
    fireEvent.click(await screen.findByRole("button", { name: /active list/i }));
    fireEvent.click(
      await screen.findByRole("button", { name: /secondary list/i }),
    );

    await waitFor(() =>
      expect(updateActiveTrainingScope).toHaveBeenCalledWith({
        userId: "user-1",
        languageCode: "nl",
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

test("footer language selector switches current training language without changing defaults", async () => {
  fetchActiveTrainingScope.mockImplementation(
    async ({ languageCode }: { languageCode: string }) => ({
      ...defaultActiveTrainingScope,
      languageCode,
      activeListId: languageCode === "en" ? secondaryList.id : activeList.id,
      activeListType: "curated",
      activeScenario: languageCode === "en" ? "listening" : "understanding",
      cardFilter: languageCode === "en" ? "review" : "both",
      modesEnabled:
        languageCode === "en"
          ? ["listen-recognize"]
          : ["word-to-definition"],
      newReviewRatio: languageCode === "en" ? 1 : 2,
      hasSavedScope: true,
    }),
  );
  fetchListSummaryById.mockImplementation(async ({ listId }: { listId: string }) =>
    listId === secondaryList.id ? secondaryList : activeList,
  );
  fetchAvailableLists.mockImplementation(
    async (_userId: string, languageCode?: string) =>
      languageCode === "en" ? [secondaryList] : [activeList],
  );
  updateUserPreferences.mockClear();
  updateActiveTrainingScope.mockClear();

  try {
    render(<TrainingScreen user={user} />);

    await screen.findByRole("heading", { name: "huis" });
    const footerScope = await screen.findByRole("region", {
      name: "Training",
    });
    expect(
      within(footerScope).getByText(
        /Huidige training: Nederlands · Active list · .* · Nieuw \+ herhaling/,
      ),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Wijzigen" }));
    fireEvent.click(screen.getByRole("button", { name: /Nederlands/ }));
    fireEvent.click(await screen.findByRole("button", { name: /English/ }));

    await waitFor(() =>
      expect(fetchActiveTrainingScope).toHaveBeenCalledWith({
        userId: "user-1",
        languageCode: "en",
      }),
    );
    expect(
      within(footerScope).getByText(
        "Huidige training: English · Secondary list · Luisteren · Alleen herhaling",
      ),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /English/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Nederlands/ }));

    await waitFor(() =>
      expect(fetchActiveTrainingScope).toHaveBeenCalledWith({
        userId: "user-1",
        languageCode: "nl",
      }),
    );
    expect(
      within(footerScope).getByText(
        "Huidige training: Nederlands · Active list · Begrip · Nieuw + herhaling",
      ),
    ).toBeInTheDocument();
    expect(updateActiveTrainingScope).not.toHaveBeenCalled();
    expect(updateUserPreferences).not.toHaveBeenCalledWith(
      expect.objectContaining({ languageCode: "en" }),
    );
  } finally {
    restoreDefaultListScope();
    fetchActiveTrainingScope.mockResolvedValue(defaultActiveTrainingScope);
    fetchAvailableLists.mockResolvedValue([defaultAvailableList]);
    fetchListSummaryById.mockResolvedValue(null);
  }
});

test("search detail trains a selected entry as the next card without changing active scope", async () => {
  useTwoListScope();
  searchWordEntries.mockResolvedValue({ items: [dictionaryBoom], total: 1 });
  fetchTrainingWordByLookup.mockClear();
  fetchTrainingWordByLookup.mockResolvedValueOnce(overrideWord);
  fetchNextTrainingWordByScenario.mockClear();
  updateActiveTrainingScope.mockClear();

  try {
    render(<TrainingScreen user={user} />);

    await waitForInitialTrainingFetches();
    fetchNextTrainingWordByScenario.mockClear();
    updateActiveTrainingScope.mockClear();

    fireEvent.click(screen.getByLabelText("Zoeken"));
    fireEvent.change(await screen.findByPlaceholderText(/zoek in het woordenboek/i), {
      target: { value: "boom" },
    });
    await screen.findAllByText("boom");

    const detailActions = await screen.findAllByText("Meer acties");
    fireEvent.click(detailActions[detailActions.length - 1]);
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
    expect(updateActiveTrainingScope).not.toHaveBeenCalled();
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

test("search detail copies a trusted entry into the user dictionary", async () => {
  useTwoListScope();
  searchWordEntries.mockResolvedValue({ items: [dictionaryHuis], total: 1 });
  copyEntryToUserDictionary.mockClear();
  fetchDictionaryEntryById.mockClear();
  fetchDictionaryEntryById.mockResolvedValueOnce({
    ...userDictionaryGedoe,
    id: "user-entry-copy",
    headword: "huis",
    raw: {
      headword: "huis",
      languageCode: "nl",
      definition: "mijn huisdefinitie",
      sourceEntryId: "word-1",
    },
  });
  updateActiveTrainingScope.mockClear();

  try {
    render(<TrainingScreen user={user} />);

    await waitForInitialTrainingFetches();
    updateActiveTrainingScope.mockClear();

    fireEvent.click(screen.getByLabelText("Zoeken"));
    fireEvent.change(await screen.findByPlaceholderText(/zoek in het woordenboek/i), {
      target: { value: "huis" },
    });
    await screen.findByText("Details");

    const detailActions = await screen.findAllByText("Meer acties");
    fireEvent.click(detailActions[detailActions.length - 1]);
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Kopieer naar mijn woordenboek",
      }),
    );

    await waitFor(() =>
      expect(copyEntryToUserDictionary).toHaveBeenCalledWith({ entryId: "word-1" }),
    );
    expect(fetchDictionaryEntryById).toHaveBeenCalledWith(
      "user-entry-copy",
      "user-1",
    );
    await waitFor(() =>
      expect(screen.getAllByText(/My dictionary/i).length).toBeGreaterThan(0),
    );
    await waitFor(() =>
      expect(screen.getAllByText("mijn huisdefinitie").length).toBeGreaterThan(0),
    );
    expect(updateActiveTrainingScope).not.toHaveBeenCalled();
  } finally {
    restoreDefaultSearchResults();
    restoreDefaultListScope();
    fetchDictionaryEntryById.mockResolvedValue(null);
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
    fireEvent.click(await screen.findByText("Meer acties"));
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
        "Huidige training: Nederlands · Active list · Begrip · Nieuw + herhaling",
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
        "Huidige training: Nederlands · Active list · Begrip · Nieuw + herhaling",
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
        "Huidige training: Nederlands · Active list · Begrip · Nieuw + herhaling",
      ),
    ).toBeInTheDocument();
    expect(
      within(updatedSettingsScope).queryByText("Secondary list"),
    ).not.toBeInTheDocument();
  } finally {
    restoreDefaultListScope();
  }
});

test("settings training controls persist to the current language training scope", async () => {
  useTwoListScope();
  updateActiveTrainingScope.mockClear();
  updateUserPreferences.mockClear();

  try {
    render(<TrainingScreen user={user} />);

    await waitForInitialTrainingFetches();
    updateActiveTrainingScope.mockClear();
    updateUserPreferences.mockClear();

    fireEvent.click(screen.getByLabelText("Instellingen"));
    fireEvent.click(await screen.findByRole("button", { name: "Luisteren" }));

    await waitFor(() =>
      expect(updateActiveTrainingScope).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "user-1",
          languageCode: "nl",
          listId: activeList.id,
          listType: activeList.type,
          activeScenario: "listening",
          cardFilter: "both",
          modesEnabled: ["word-to-definition"],
          newReviewRatio: 2,
        }),
      ),
    );
    expect(updateUserPreferences).not.toHaveBeenCalledWith(
      expect.objectContaining({ activeScenario: "listening" }),
    );
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
  fireEvent.click(screen.getByRole("button", { name: "Wijzigen" }));
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
