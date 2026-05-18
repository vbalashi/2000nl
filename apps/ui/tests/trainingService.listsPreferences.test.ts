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
  delete: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
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
  query.delete = vi.fn(() => query);
  query.insert = vi.fn(() => query);
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
    fetchListSummaryById: service.fetchListSummaryById,
    fetchUserLists: service.fetchUserLists,
    fetchUserListMembership: service.fetchUserListMembership,
    fetchUserPreferences: service.fetchUserPreferences,
    fetchWordsForList: service.fetchWordsForList,
    addWordsToUserList: service.addWordsToUserList,
    createUserList: service.createUserList,
    updateUserList: service.updateUserList,
    deleteUserList: service.deleteUserList,
    removeWordsFromUserList: service.removeWordsFromUserList,
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

  test("fetchCuratedLists reads curated list summaries through the explicit RPC", async () => {
    const { fetchCuratedLists } = await importService();

    getUser.mockResolvedValueOnce({
      data: { user: { id: "user-1" } },
      error: null,
    });
    rpc.mockResolvedValueOnce({
      data: [
        {
          id: "list-1",
          name: "Basis",
          description: "Core",
          language_code: "nl",
          primary_language_code: "nl",
          is_primary: true,
          word_list_items: [{ count: 2000 }],
        },
      ],
      error: null,
    });

    const lists = await fetchCuratedLists("nl");

    expect(from).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith("get_available_word_lists", {
      p_user_id: "user-1",
      p_language_code: "nl",
      p_list_type: "curated",
    });
    expect(lists).toEqual([
      {
        id: "list-1",
        name: "Basis",
        description: "Core",
        language_code: "nl",
        primary_language_code: "nl",
        type: "curated",
        item_count: 2000,
        is_primary: true,
      },
    ]);
  });

  test("fetchUserLists does not constrain user lists by active training language", async () => {
    const { fetchUserLists } = await importService();

    rpc.mockResolvedValueOnce({
      data: [
        {
          id: "list-1",
          name: "Mixed",
          description: null,
          language_code: "nl",
          primary_language_code: null,
          created_at: "2026-05-16T10:00:00.000Z",
          user_word_list_items: [{ count: 3 }],
        },
      ],
      error: null,
    });

    const lists = await fetchUserLists("user-1", "nl");

    expect(from).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith("get_available_word_lists", {
      p_user_id: "user-1",
      p_language_code: null,
      p_list_type: "user",
    });
    expect(lists).toEqual([
      {
        id: "list-1",
        name: "Mixed",
        description: null,
        language_code: "nl",
        primary_language_code: "nl",
        type: "user",
        item_count: 3,
        created_at: "2026-05-16T10:00:00.000Z",
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

  test("searchWordEntries returns empty when the gated RPC fails", async () => {
    const { searchWordEntries } = await importService();

    rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "missing gated RPC" },
    });

    const result = await searchWordEntries({
      query: "hui",
      filterHidden: true,
      filterFrozen: true,
      page: 1,
      pageSize: 10,
    });

    expect(result).toEqual({ items: [], total: 0 });
    expect(from).not.toHaveBeenCalled();
  });

  test("fetchWordsForList returns empty when the gated RPC fails", async () => {
    const { fetchWordsForList } = await importService();

    rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "missing gated RPC" },
    });

    const result = await fetchWordsForList("list-1", "user");

    expect(result).toEqual({ items: [], total: 0 });
    expect(from).not.toHaveBeenCalled();
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

  test("fetchListSummaryById reads summary through the explicit RPC", async () => {
    const { fetchListSummaryById } = await importService();

    rpc.mockResolvedValueOnce({
      data: {
        id: "list-1",
        name: "Saved",
        description: null,
        language_code: "nl",
        primary_language_code: "nl",
        created_at: "2026-05-16T10:00:00.000Z",
        user_word_list_items: [{ count: 3 }],
      },
      error: null,
    });

    await expect(
      fetchListSummaryById({
        userId: "user-1",
        listId: "list-1",
        listType: "user",
      }),
    ).resolves.toEqual({
      id: "list-1",
      name: "Saved",
      description: null,
      language_code: "nl",
      primary_language_code: "nl",
      type: "user",
      item_count: 3,
      created_at: "2026-05-16T10:00:00.000Z",
    });
    expect(from).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith("get_word_list_summary", {
      p_user_id: "user-1",
      p_list_id: "list-1",
      p_list_type: "user",
    });
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

  test("createUserList inserts a list and maps the created summary", async () => {
    const { createUserList } = await importService();

    rpc.mockResolvedValueOnce({
      data: {
        id: "list-1",
        name: "Nieuw",
        description: "Words to learn",
        language_code: "nl",
        primary_language_code: "nl",
        created_at: "2026-05-16T10:00:00.000Z",
        user_word_list_items: [{ count: 0 }],
      },
      error: null,
    });

    await expect(
      createUserList({
        userId: "user-1",
        name: "Nieuw",
        description: "Words to learn",
        language_code: "nl",
      }),
    ).resolves.toEqual({
      id: "list-1",
      name: "Nieuw",
      description: "Words to learn",
      language_code: "nl",
      primary_language_code: "nl",
      type: "user",
      item_count: 0,
      created_at: "2026-05-16T10:00:00.000Z",
    });
    expect(from).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith("create_user_word_list", {
      p_user_id: "user-1",
      p_name: "Nieuw",
      p_description: "Words to learn",
      p_language_code: "nl",
      p_primary_language_code: "nl",
    });
  });

  test("updateUserList updates list metadata through the explicit RPC", async () => {
    const { updateUserList } = await importService();

    rpc.mockResolvedValueOnce({
      data: {
        id: "list-1",
        name: "Bijgewerkt",
        description: "Updated words",
        language_code: "nl",
        primary_language_code: "nl",
        created_at: "2026-05-16T10:00:00.000Z",
        user_word_list_items: [{ count: 2 }],
      },
      error: null,
    });

    await expect(
      updateUserList({
        userId: "user-1",
        listId: "list-1",
        name: "Bijgewerkt",
        description: "Updated words",
        language_code: "nl",
      }),
    ).resolves.toEqual({
      id: "list-1",
      name: "Bijgewerkt",
      description: "Updated words",
      language_code: "nl",
      primary_language_code: "nl",
      type: "user",
      item_count: 2,
      created_at: "2026-05-16T10:00:00.000Z",
    });
    expect(from).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith("update_user_word_list", {
      p_user_id: "user-1",
      p_list_id: "list-1",
      p_name: "Bijgewerkt",
      p_description: "Updated words",
      p_language_code: "nl",
      p_primary_language_code: "nl",
    });
  });

  test("addWordsToUserList calls the explicit list membership RPC and skips empty input", async () => {
    const { addWordsToUserList } = await importService();

    await expect(addWordsToUserList("list-1", [])).resolves.toEqual({
      error: null,
    });
    expect(from).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();

    getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    rpc.mockResolvedValue({ data: null, error: null });

    await expect(
      addWordsToUserList("list-1", ["word-1", "word-2", "word-1"]),
    ).resolves.toEqual({ error: null });
    expect(from).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc).toHaveBeenNthCalledWith(1, "add_entry_to_user_list", {
      p_user_id: "user-1",
      p_list_id: "list-1",
      p_word_id: "word-1",
    });
    expect(rpc).toHaveBeenNthCalledWith(2, "add_entry_to_user_list", {
      p_user_id: "user-1",
      p_list_id: "list-1",
      p_word_id: "word-2",
    });
  });

  test("removeWordsFromUserList calls the explicit membership RPC and deleteUserList deletes the list", async () => {
    const { deleteUserList, removeWordsFromUserList } = await importService();

    await expect(removeWordsFromUserList("list-1", [])).resolves.toEqual({
      error: null,
    });
    expect(from).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();

    getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    rpc
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: null, error: null });

    await expect(
      removeWordsFromUserList("list-1", ["word-1", "word-2", "word-1"]),
    ).resolves.toEqual({ error: null });
    await expect(deleteUserList("list-1")).resolves.toEqual({ error: null });

    expect(rpc).toHaveBeenCalledWith("remove_entries_from_user_list", {
      p_user_id: "user-1",
      p_list_id: "list-1",
      p_word_ids: ["word-1", "word-2"],
    });
    expect(rpc).toHaveBeenCalledWith("delete_user_word_list", {
      p_user_id: "user-1",
      p_list_id: "list-1",
    });
    expect(from).not.toHaveBeenCalled();
  });

  test("fetchUserListMembership returns present word ids only", async () => {
    const { fetchUserListMembership } = await importService();

    await expect(fetchUserListMembership("list-1", [])).resolves.toEqual(
      new Set(),
    );
    expect(from).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();

    getUser.mockResolvedValueOnce({
      data: { user: { id: "user-1" } },
      error: null,
    });
    rpc.mockResolvedValueOnce({ data: ["word-1", "word-2"], error: null });

    await expect(
      fetchUserListMembership("list-1", ["word-1", "word-2", "word-3"]),
    ).resolves.toEqual(new Set(["word-1", "word-2"]));
    expect(from).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith("get_user_list_membership", {
      p_user_id: "user-1",
      p_list_id: "list-1",
      p_word_ids: ["word-1", "word-2", "word-3"],
    });
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
