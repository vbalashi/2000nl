import { beforeEach, describe, expect, test, vi } from "vitest";

type QueryResponse = { data?: any; error?: any; count?: number };

type QueryRecord = {
  table: string;
  response: QueryResponse;
  select: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  gt: ReturnType<typeof vi.fn>;
  ilike: ReturnType<typeof vi.fn>;
  in: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  range: ReturnType<typeof vi.fn>;
  maybeSingle: ReturnType<typeof vi.fn>;
  upsert: ReturnType<typeof vi.fn>;
};

const rpc = vi.fn();
const getUser = vi.fn();
const fromResponses = new Map<string, QueryResponse[]>();
const queries: QueryRecord[] = [];

const queueFrom = (table: string, response: QueryResponse) => {
  const queue = fromResponses.get(table) ?? [];
  queue.push(response);
  fromResponses.set(table, queue);
};

const createQuery = (table: string, response: QueryResponse): QueryRecord => {
  const query = {
    table,
    response,
  } as QueryRecord;

  query.select = vi.fn(() => query);
  query.eq = vi.fn(() => query);
  query.gt = vi.fn(() => query);
  query.ilike = vi.fn(() => query);
  query.in = vi.fn(() => query);
  query.order = vi.fn(() => query);
  query.range = vi.fn(async () => response);
  query.maybeSingle = vi.fn(async () => response);
  query.upsert = vi.fn(async () => response);
  (query as any).then = (resolve: any, reject: any) =>
    Promise.resolve(response).then(resolve, reject);

  queries.push(query);
  return query;
};

const from = vi.fn((table: string) => {
  const queue = fromResponses.get(table) ?? [];
  const response = queue.shift() ?? { data: null, error: null };
  fromResponses.set(table, queue);
  return createQuery(table, response);
});

vi.mock("@/lib/supabaseClient", () => ({
  supabase: {
    rpc,
    auth: {
      getUser,
    },
    from,
  },
}));

const importService = async () => {
  const service = await import("@/lib/trainingService");
  return {
    fetchActiveList: service.fetchActiveList,
    fetchCuratedLists: service.fetchCuratedLists,
    fetchUserPreferences: service.fetchUserPreferences,
    fetchWordsForList: service.fetchWordsForList,
    searchWordEntries: service.searchWordEntries,
    updateActiveList: service.updateActiveList,
    updateUserPreferences: service.updateUserPreferences,
  };
};

describe("trainingService list and preference characterization", () => {
  beforeEach(() => {
    rpc.mockReset();
    getUser.mockReset();
    from.mockClear();
    fromResponses.clear();
    queries.length = 0;
    delete process.env.NEXT_PUBLIC_AUDIO_QUALITY_DEFAULT;
  });

  test("fetchCuratedLists retries without sort_order when the preferred query fails", async () => {
    const { fetchCuratedLists } = await importService();

    queueFrom("word_lists", {
      data: null,
      error: { message: "column sort_order does not exist" },
    });
    queueFrom("word_lists", {
      data: [
        {
          id: "list-1",
          name: "Basis",
          description: "Core",
          language_code: "nl",
          is_primary: true,
          word_list_items: [{ count: 2000 }],
        },
      ],
      error: null,
    });

    const lists = await fetchCuratedLists("nl");

    const wordListQueries = queries.filter((query) => query.table === "word_lists");
    expect(wordListQueries).toHaveLength(2);
    expect(wordListQueries[0].select).toHaveBeenCalledWith(
      expect.stringContaining("sort_order"),
    );
    expect(wordListQueries[1].select).toHaveBeenCalledWith(
      expect.not.stringContaining("sort_order"),
    );
    expect(wordListQueries[0].eq).toHaveBeenCalledWith("language_code", "nl");
    expect(wordListQueries[1].eq).toHaveBeenCalledWith("language_code", "nl");
    expect(lists).toEqual([
      {
        id: "list-1",
        name: "Basis",
        description: "Core",
        language_code: "nl",
        type: "curated",
        item_count: 2000,
        is_primary: true,
      },
    ]);
  });

  test("searchWordEntries uses gated RPC payload and maps lock metadata", async () => {
    const { searchWordEntries } = await importService();

    rpc.mockResolvedValueOnce({
      data: {
        items: [
          {
            id: "word-1",
            headword: "huis",
            part_of_speech: "zn",
            gender: "het",
            raw: { meanings: [{ definition: "Een gebouw" }] },
            is_nt2_2000: true,
          },
        ],
        total: 120,
        is_locked: true,
        max_allowed: 100,
      },
      error: null,
    });

    const result = await searchWordEntries({
      query: "hui",
      partOfSpeech: "zn",
      isNt2: true,
      filterFrozen: false,
      filterHidden: true,
      page: 2,
      pageSize: 25,
    });

    expect(rpc).toHaveBeenCalledWith("search_word_entries_gated", {
      p_query: "hui",
      p_part_of_speech: "zn",
      p_is_nt2: true,
      p_filter_frozen: false,
      p_filter_hidden: true,
      p_page: 2,
      p_page_size: 25,
    });
    expect(result).toEqual({
      items: [
        {
          id: "word-1",
          headword: "huis",
          part_of_speech: "zn",
          gender: "het",
          raw: { meanings: [{ definition: "Een gebouw" }] },
          is_nt2_2000: true,
        },
      ],
      total: 120,
      isLocked: true,
      maxAllowed: 100,
    });
  });

  test("searchWordEntries fallback intersects hidden and frozen filters before querying words", async () => {
    const { searchWordEntries } = await importService();

    rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "missing gated RPC" },
    });
    getUser.mockResolvedValueOnce({ data: { user: { id: "user-1" } } });
    queueFrom("user_word_status", {
      data: [{ word_id: "word-1" }, { word_id: "word-2" }],
      error: null,
    });
    queueFrom("user_word_status", {
      data: [{ word_id: "word-2" }, { word_id: "word-3" }],
      error: null,
    });
    queueFrom("word_entries", {
      data: [
        {
          id: "word-2",
          headword: "huis",
          part_of_speech: "zn",
          gender: "het",
          raw: "{}",
          is_nt2_2000: true,
        },
      ],
      count: 1,
      error: null,
    });

    const result = await searchWordEntries({
      query: "hui",
      filterHidden: true,
      filterFrozen: true,
      page: 1,
      pageSize: 10,
    });

    const statusQueries = queries.filter(
      (query) => query.table === "user_word_status",
    );
    expect(statusQueries[0].eq).toHaveBeenCalledWith("hidden", true);
    expect(statusQueries[1].gt).toHaveBeenCalledWith(
      "frozen_until",
      expect.any(String),
    );

    const wordQuery = queries.find((query) => query.table === "word_entries");
    expect(wordQuery?.ilike).toHaveBeenCalledWith("headword", "%hui%");
    expect(wordQuery?.in).toHaveBeenCalledWith("id", ["word-2"]);
    expect(wordQuery?.range).toHaveBeenCalledWith(0, 9);
    expect(result.items.map((item) => item.id)).toEqual(["word-2"]);
    expect(result.total).toBe(1);
  });

  test("fetchWordsForList returns empty for user lists when fallback cannot resolve the authed user", async () => {
    const { fetchWordsForList } = await importService();

    rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "missing gated RPC" },
    });
    getUser.mockResolvedValueOnce({ data: { user: null } });

    const result = await fetchWordsForList("list-1", "user");

    expect(result).toEqual({ items: [], total: 0 });
    expect(from).not.toHaveBeenCalledWith("user_word_list_items");
  });

  test("fetchActiveList maps saved active list fields", async () => {
    const { fetchActiveList } = await importService();

    queueFrom("user_settings", {
      data: { active_list_id: "list-1", active_list_type: "user" },
      error: null,
    });

    await expect(fetchActiveList("user-1")).resolves.toEqual({
      listId: "list-1",
      listType: "user",
    });
    expect(queries[0].select).toHaveBeenCalledWith(
      "active_list_id, active_list_type",
    );
    expect(queries[0].eq).toHaveBeenCalledWith("user_id", "user-1");
  });

  test("updateActiveList upserts curated default when list type is omitted", async () => {
    const { updateActiveList } = await importService();

    queueFrom("user_settings", { data: null, error: null });

    await expect(
      updateActiveList({ userId: "user-1", listId: "list-1" }),
    ).resolves.toEqual({ error: null });

    expect(queries[0].upsert).toHaveBeenCalledWith(
      {
        user_id: "user-1",
        active_list_id: "list-1",
        active_list_type: "curated",
      },
      { onConflict: "user_id" },
    );
  });

  test("fetchUserPreferences applies defaults, legacy mode fallback, and translation off sentinel", async () => {
    const { fetchUserPreferences } = await importService();

    process.env.NEXT_PUBLIC_AUDIO_QUALITY_DEFAULT = "premium";
    queueFrom("user_settings", {
      data: {
        theme_preference: null,
        audio_quality: null,
        training_mode: "definition-to-word",
        modes_enabled: [],
        card_filter: null,
        language_code: null,
        new_review_ratio: null,
        active_scenario: null,
        translation_lang: "off",
        training_sidebar_pinned: null,
        preferences: { onboardingCompleted: true },
      },
      error: null,
    });

    await expect(fetchUserPreferences("user-1")).resolves.toEqual({
      themePreference: "system",
      audioQuality: "premium",
      modesEnabled: ["definition-to-word"],
      cardFilter: "both",
      languageCode: "nl",
      newReviewRatio: 2,
      activeScenario: "understanding",
      translationLang: "off",
      trainingSidebarPinned: false,
      preferences: { onboardingCompleted: true },
      trainingMode: "definition-to-word",
    });
  });

  test("updateUserPreferences seeds audio quality default for new settings rows", async () => {
    const { updateUserPreferences } = await importService();

    process.env.NEXT_PUBLIC_AUDIO_QUALITY_DEFAULT = "premium";
    queueFrom("user_settings", { data: null, error: null });
    queueFrom("user_settings", { data: null, error: null });

    await expect(
      updateUserPreferences({
        userId: "user-1",
        themePreference: "dark",
      }),
    ).resolves.toEqual({ error: null });

    expect(queries[0].select).toHaveBeenCalledWith("user_id");
    expect(queries[1].upsert).toHaveBeenCalledWith(
      {
        user_id: "user-1",
        audio_quality: "premium",
        theme_preference: "dark",
      },
      { onConflict: "user_id" },
    );
  });
});
