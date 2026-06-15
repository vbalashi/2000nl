import { beforeEach, describe, expect, test, vi } from "vitest";

type QueryResponse = { data?: any; error?: any; count?: number };

type QueryRecord = {
  table: string;
  response: QueryResponse;
  select: any;
  eq: any;
  gt: any;
  ilike: any;
  in: any;
  order: any;
  range: any;
  maybeSingle: any;
  delete: any;
  insert: any;
  upsert: any;
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
    fetchActiveTrainingScope: service.fetchActiveTrainingScope,
    fetchAvailableDictionarySources: service.fetchAvailableDictionarySources,
    fetchAvailableLearningLanguages: service.fetchAvailableLearningLanguages,
    fetchCuratedLists: service.fetchCuratedLists,
    fetchEntryListMemberships: service.fetchEntryListMemberships,
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
    updateActiveTrainingScope: service.updateActiveTrainingScope,
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
          default_scenario_id: "understanding",
          card_policy: "restrict",
          card_type_ids: ["word-to-definition"],
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
        default_scenario_id: "understanding",
        card_policy: "restrict",
        card_type_ids: ["word-to-definition"],
        type: "curated",
        item_count: 2000,
        is_mixed_language: false,
        is_primary: true,
      },
    ]);
  });

  test("fetchUserLists constrains user lists by requested learning language", async () => {
    const { fetchUserLists } = await importService();

    rpc.mockResolvedValueOnce({
      data: [
        {
          id: "list-1",
          name: "Mixed",
          description: null,
          language_code: "nl",
          primary_language_code: null,
          is_mixed_language: true,
          default_scenario_id: null,
          card_policy: "inherit",
          card_type_ids: null,
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
      p_language_code: "nl",
      p_list_type: "user",
    });
    expect(lists).toEqual([
      {
        id: "list-1",
        name: "Mixed",
        description: null,
        language_code: "nl",
        primary_language_code: "nl",
        default_scenario_id: null,
        card_policy: "inherit",
        card_type_ids: null,
        type: "user",
        item_count: 3,
        is_mixed_language: true,
        created_at: "2026-05-16T10:00:00.000Z",
      },
    ]);
  });

  test("fetchAvailableLearningLanguages maps language availability metadata", async () => {
    const { fetchAvailableLearningLanguages } = await importService();

    rpc.mockResolvedValueOnce({
      data: [
        {
          code: "en",
          label: "English",
          dictionary_count: 2,
          curated_list_count: 2,
          user_list_count: 1,
          has_training_eligible_lists: true,
        },
      ],
      error: null,
    });

    await expect(fetchAvailableLearningLanguages("user-1")).resolves.toEqual([
      {
        code: "en",
        label: "English",
        dictionaryCount: 2,
        curatedListCount: 2,
        userListCount: 1,
        hasTrainingEligibleLists: true,
      },
    ]);
    expect(rpc).toHaveBeenCalledWith("get_available_learning_languages", {
      p_user_id: "user-1",
    });
  });

  test("fetchAvailableDictionarySources maps source metadata for a language", async () => {
    const { fetchAvailableDictionarySources } = await importService();

    rpc.mockResolvedValueOnce({
      data: [
        {
          id: "dict-en-core",
          language_code: "en",
          slug: "en-test-core",
          name: "EN Core Test",
          kind: "curated",
          visibility: "public",
          is_editable: false,
          entry_count: 10,
        },
      ],
      error: null,
    });

    await expect(
      fetchAvailableDictionarySources({
        userId: "user-1",
        languageCode: "en",
      }),
    ).resolves.toEqual([
      {
        id: "dict-en-core",
        languageCode: "en",
        slug: "en-test-core",
        name: "EN Core Test",
        kind: "curated",
        visibility: "public",
        isEditable: false,
        entryCount: 10,
      },
    ]);
    expect(rpc).toHaveBeenCalledWith("get_available_dictionary_sources", {
      p_user_id: "user-1",
      p_language_code: "en",
    });
  });

  test("per-language active training scope is read and updated through dedicated RPCs", async () => {
    const { fetchActiveTrainingScope, updateActiveTrainingScope } =
      await importService();

    rpc.mockResolvedValueOnce({
      data: {
        language_code: "en",
        active_list_id: "list-en",
        active_list_type: "curated",
        active_scenario: "understanding",
        card_filter: "both",
        modes_enabled: ["word-to-definition"],
        new_review_ratio: 2,
        has_saved_scope: true,
        is_valid: true,
      },
      error: null,
    });

    await expect(
      fetchActiveTrainingScope({ userId: "user-1", languageCode: "en" }),
    ).resolves.toMatchObject({
      languageCode: "en",
      activeListId: "list-en",
      activeListType: "curated",
      hasSavedScope: true,
      isValid: true,
    });

    rpc.mockResolvedValueOnce({
      data: {
        language_code: "nl",
        active_list_id: "list-nl",
        active_list_type: "user",
        active_scenario: "listening",
        card_filter: "review",
        modes_enabled: ["listen-recognize"],
        new_review_ratio: 1,
        has_saved_scope: true,
        is_valid: true,
      },
      error: null,
    });

    await expect(
      updateActiveTrainingScope({
        userId: "user-1",
        languageCode: "nl",
        listId: "list-nl",
        listType: "user",
        activeScenario: "listening",
        cardFilter: "review",
        modesEnabled: ["listen-recognize"],
        newReviewRatio: 1,
      }),
    ).resolves.toMatchObject({
      scope: {
        languageCode: "nl",
        activeListId: "list-nl",
        activeListType: "user",
        activeScenario: "listening",
        cardFilter: "review",
      },
      error: null,
    });

    expect(rpc).toHaveBeenNthCalledWith(1, "get_active_training_scope", {
      p_user_id: "user-1",
      p_language_code: "en",
    });
    expect(rpc).toHaveBeenNthCalledWith(2, "update_active_training_scope", {
      p_user_id: "user-1",
      p_language_code: "nl",
      p_list_id: "list-nl",
      p_list_type: "user",
      p_active_scenario: "listening",
      p_card_filter: "review",
      p_modes_enabled: ["listen-recognize"],
      p_new_review_ratio: 1,
    });
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
            dictionary_name: "Van Dale NT2",
            dictionary_slug: "nl-vandale",
            dictionary_kind: "curated",
            search_match_group: "exact-headword",
            search_match_label: "Exacte match",
            search_group_rank: 1,
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
      languageCode: "en",
      dictionaryIds: ["dict-en-core"],
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
      p_language_code: "en",
      p_dictionary_ids: ["dict-en-core"],
    });
    expect(result).toEqual({
      items: [
        {
          id: "word-1",
          headword: "huis",
          part_of_speech: "zn",
          gender: "het",
          dictionary_name: "Van Dale NT2",
          dictionary_slug: "nl-vandale",
          dictionary_kind: "curated",
          raw: { meanings: [{ definition: "Een gebouw" }] },
          is_nt2_2000: true,
          search_match_group: "exact-headword",
          search_match_label: "Exacte match",
          search_group_rank: 1,
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

    rpc.mockResolvedValueOnce({
      data: { active_list_id: "list-1", active_list_type: "user" },
      error: null,
    });

    await expect(fetchActiveList("user-1")).resolves.toEqual({
      listId: "list-1",
      listType: "user",
    });
    expect(from).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith("get_active_word_list", {
      p_user_id: "user-1",
    });
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
        default_scenario_id: "listening",
        card_policy: "prefer",
        card_type_ids: ["listen-recognize"],
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
      default_scenario_id: "listening",
      card_policy: "prefer",
      card_type_ids: ["listen-recognize"],
      type: "user",
      item_count: 3,
      is_mixed_language: false,
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

    rpc.mockResolvedValueOnce({ data: null, error: null });

    await expect(
      updateActiveList({ userId: "user-1", listId: "list-1" }),
    ).resolves.toEqual({ error: null });

    expect(from).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith("update_active_word_list", {
      p_user_id: "user-1",
      p_list_id: "list-1",
      p_list_type: "curated",
    });
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
        default_scenario_id: "listening",
        card_policy: "restrict",
        card_type_ids: ["listen-recognize"],
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
        default_scenario_id: "listening",
        card_policy: "restrict",
        card_type_ids: ["listen-recognize"],
      }),
    ).resolves.toEqual({
      id: "list-1",
      name: "Nieuw",
      description: "Words to learn",
      language_code: "nl",
      primary_language_code: "nl",
      default_scenario_id: "listening",
      card_policy: "restrict",
      card_type_ids: ["listen-recognize"],
      type: "user",
      item_count: 0,
      is_mixed_language: false,
      created_at: "2026-05-16T10:00:00.000Z",
    });
    expect(from).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith("create_user_word_list", {
      p_user_id: "user-1",
      p_name: "Nieuw",
      p_description: "Words to learn",
      p_language_code: "nl",
      p_primary_language_code: "nl",
      p_default_scenario_id: "listening",
      p_card_policy: "restrict",
      p_card_type_ids: ["listen-recognize"],
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
        default_scenario_id: "understanding",
        card_policy: "prefer",
        card_type_ids: ["definition-to-word", "word-to-definition"],
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
        default_scenario_id: "understanding",
        card_policy: "prefer",
        card_type_ids: ["definition-to-word", "word-to-definition"],
      }),
    ).resolves.toEqual({
      id: "list-1",
      name: "Bijgewerkt",
      description: "Updated words",
      language_code: "nl",
      primary_language_code: "nl",
      default_scenario_id: "understanding",
      card_policy: "prefer",
      card_type_ids: ["definition-to-word", "word-to-definition"],
      type: "user",
      item_count: 2,
      is_mixed_language: false,
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
      p_default_scenario_id: "understanding",
      p_card_policy: "prefer",
      p_card_type_ids: ["definition-to-word", "word-to-definition"],
      p_clear_default_scenario: false,
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
      p_entry_id: "word-1",
    });
    expect(rpc).toHaveBeenNthCalledWith(2, "add_entry_to_user_list", {
      p_user_id: "user-1",
      p_list_id: "list-1",
      p_entry_id: "word-2",
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
      p_entry_ids: ["word-1", "word-2"],
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
      p_entry_ids: ["word-1", "word-2", "word-3"],
    });
  });

  test("fetchEntryListMemberships maps curated and user learning-list memberships", async () => {
    const { fetchEntryListMemberships } = await importService();

    await expect(fetchEntryListMemberships([])).resolves.toEqual(new Map());
    expect(from).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();

    getUser.mockResolvedValueOnce({
      data: { user: { id: "user-1" } },
      error: null,
    });
    rpc.mockResolvedValueOnce({
      data: [
        {
          entry_id: "word-1",
          lists: [
            {
              id: "curated-1",
              kind: "curated",
              name: "VanDale 2k",
              description: "NT2 words",
              primary_language_code: "nl",
              item_count: 2000,
              editable: false,
              read_only_reason: "curated",
              is_active_training_list: true,
            },
            {
              id: "user-list-1",
              kind: "user",
              name: "Mijn lijst",
              primary_language_code: "nl",
              item_count: 3,
              editable: true,
              is_active_training_list: false,
            },
          ],
        },
      ],
      error: null,
    });

    await expect(
      fetchEntryListMemberships(["word-1", "word-2", "word-1"]),
    ).resolves.toEqual(
      new Map([
        [
          "word-1",
          [
            {
              listId: "curated-1",
              listType: "curated",
              name: "VanDale 2k",
              description: "NT2 words",
              itemCount: 2000,
              primaryLanguageCode: "nl",
              editable: false,
              readOnlyReason: "curated",
              isActiveTrainingList: true,
            },
            {
              listId: "user-list-1",
              listType: "user",
              name: "Mijn lijst",
              description: null,
              itemCount: 3,
              primaryLanguageCode: "nl",
              editable: true,
              readOnlyReason: undefined,
              isActiveTrainingList: false,
            },
          ],
        ],
        ["word-2", []],
      ]),
    );
    expect(from).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith("get_user_list_memberships_for_entries", {
      p_user_id: "user-1",
      p_entry_ids: ["word-1", "word-2"],
    });
  });

  test("fetchUserPreferences applies defaults, legacy mode fallback, and translation off sentinel", async () => {
    const { fetchUserPreferences } = await importService();

    process.env.NEXT_PUBLIC_AUDIO_QUALITY_DEFAULT = "premium";
    queueFrom("user_settings", {
      data: {
        theme_preference: null,
        audio_quality: null,
        translation_lang: "off",
        training_sidebar_pinned: null,
        preferences: { onboardingCompleted: true },
      },
      error: null,
    });
    rpc.mockResolvedValueOnce({
      data: {
        training_mode: "definition-to-word",
        modes_enabled: [],
        card_filter: null,
        language_code: null,
        new_review_ratio: null,
        active_scenario: null,
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

  test("updateUserPreferences sends learning settings through the explicit RPC", async () => {
    const { updateUserPreferences } = await importService();

    queueFrom("user_settings", { data: { user_id: "user-1" }, error: null });
    rpc.mockResolvedValueOnce({ data: null, error: null });

    await expect(
      updateUserPreferences({
        userId: "user-1",
        modesEnabled: ["word-to-definition", "definition-to-word"],
        cardFilter: "review",
        languageCode: "nl",
        newReviewRatio: 3,
        activeScenario: "listening",
      }),
    ).resolves.toEqual({ error: null });

    expect(rpc).toHaveBeenCalledWith("update_learning_preferences", {
      p_user_id: "user-1",
      p_modes_enabled: ["word-to-definition", "definition-to-word"],
      p_card_filter: "review",
      p_language_code: "nl",
      p_new_review_ratio: 3,
      p_active_scenario: "listening",
    });
    expect(queries).toHaveLength(1);
  });
});
