import { supabase } from "../supabaseClient";
import type {
  WordEntrySearchResult,
  WordListSummary,
  WordListType,
} from "../types";
import {
  mapCuratedListSummary,
  mapDictionaryEntry,
  mapUserListSummary,
} from "./wordMappers";

type WordSearchFilters = {
  query?: string;
  partOfSpeech?: string;
  isNt2?: boolean;
  filterFrozen?: boolean;
  filterHidden?: boolean;
  page?: number;
  pageSize?: number;
};

export async function fetchCuratedLists(
  languageCode?: string,
): Promise<WordListSummary[]> {
  const baseSelect =
    "id, name, description, language_code, primary_language_code, is_primary, word_list_items(count)";

  // Prefer sort_order when available (migration 0039), but gracefully
  // fall back for older DBs where the column doesn't exist.
  const run = async (withSortOrder: boolean) => {
    let query = supabase
      .from("word_lists")
      .select(withSortOrder ? `${baseSelect}, sort_order` : baseSelect)
      .order(withSortOrder ? "sort_order" : "is_primary", {
        ascending: withSortOrder ? true : false,
        nullsFirst: withSortOrder ? false : undefined,
      })
      .order("is_primary", { ascending: false })
      .order("name", { ascending: true });

    if (languageCode) {
      query = query.eq("language_code", languageCode);
    }

    return await query;
  };

  const first = await run(true);
  if (!first.error && first.data) {
    return first.data.map(mapCuratedListSummary);
  }

  // Retry without sort_order if the first query failed (e.g. missing column).
  if (first.error) {
    console.warn("fetchCuratedLists: falling back without sort_order", first.error);
  }

  const fallback = await run(false);
  if (fallback.error || !fallback.data) return [];
  return fallback.data.map(mapCuratedListSummary);
}

export async function fetchUserLists(
  userId: string,
  _languageCode?: string,
): Promise<WordListSummary[]> {
  const query = supabase
    .from("user_word_lists")
    .select(
      "id, name, description, language_code, primary_language_code, created_at, user_word_list_items(count)",
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  const { data, error } = await query;
  if (error || !data) return [];
  return data.map(mapUserListSummary);
}

export async function fetchAvailableLists(
  userId: string,
  languageCode?: string,
): Promise<WordListSummary[]> {
  const [curated, user] = await Promise.all([
    fetchCuratedLists(languageCode),
    fetchUserLists(userId, languageCode),
  ]);
  return [...curated, ...user];
}

export async function fetchActiveList(
  userId: string,
): Promise<{ listId: string | null; listType: WordListType | null }> {
  const { data, error } = await supabase
    .from("user_settings")
    .select("active_list_id, active_list_type")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("Error fetching active list", error);
  }

  return {
    listId: data?.active_list_id ?? null,
    listType: (data?.active_list_type as WordListType | null) ?? null,
  };
}

export async function fetchListSummaryById(params: {
  userId: string;
  listId: string;
  listType: WordListType;
}): Promise<WordListSummary | null> {
  if (params.listType === "user") {
    const { data, error } = await supabase
      .from("user_word_lists")
      .select(
        "id, name, description, language_code, primary_language_code, created_at, user_word_list_items(count)",
      )
      .eq("id", params.listId)
      .eq("user_id", params.userId)
      .maybeSingle();

    if (error || !data) {
      if (error) {
        console.error("Error fetching user list summary", error);
      }
      return null;
    }
    return mapUserListSummary(data);
  }

  const { data, error } = await supabase
    .from("word_lists")
    .select(
      "id, name, description, language_code, primary_language_code, is_primary, word_list_items(count)",
    )
    .eq("id", params.listId)
    .maybeSingle();

  if (error || !data) {
    if (error) {
      console.error("Error fetching curated list summary", error);
    }
    return null;
  }

  return mapCuratedListSummary(data);
}

export async function updateActiveList(params: {
  userId: string;
  listId: string | null;
  listType?: WordListType | null;
}) {
  const { error } = await supabase.from("user_settings").upsert(
    {
      user_id: params.userId,
      active_list_id: params.listId,
      active_list_type: params.listId ? params.listType ?? "curated" : null,
    },
    { onConflict: "user_id" },
  );

  if (error) {
    console.error("Error updating active list", error);
  }

  return { error };
}

export async function searchWordEntries(
  filters: WordSearchFilters = {},
): Promise<WordEntrySearchResult> {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = filters.pageSize ?? 50;

  const { data, error } = await supabase.rpc("search_word_entries_gated", {
    p_query: filters.query || null,
    p_part_of_speech: filters.partOfSpeech || null,
    p_is_nt2: typeof filters.isNt2 === "boolean" ? filters.isNt2 : null,
    p_filter_frozen:
      typeof filters.filterFrozen === "boolean" ? filters.filterFrozen : null,
    p_filter_hidden:
      typeof filters.filterHidden === "boolean" ? filters.filterHidden : null,
    p_page: page,
    p_page_size: pageSize,
  });

  if (error) {
    console.error("Error searching word entries via gated RPC", error);
    return { items: [], total: 0 };
  }

  const result = data as {
    items: any[];
    total: number;
    is_locked: boolean;
    max_allowed: number | null;
  };

  return {
    items: (result?.items || []).map(mapDictionaryEntry),
    total: result?.total ?? 0,
    isLocked: result?.is_locked,
    maxAllowed: result?.max_allowed,
  };
}

export async function fetchWordsForList(
  listId: string,
  listType: WordListType,
  filters: WordSearchFilters = {},
): Promise<WordEntrySearchResult> {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = filters.pageSize ?? 50;

  const { data, error } = await supabase.rpc("fetch_words_for_list_gated", {
    p_list_id: listId,
    p_list_type: listType,
    p_query: filters.query || null,
    p_part_of_speech: filters.partOfSpeech || null,
    p_is_nt2: typeof filters.isNt2 === "boolean" ? filters.isNt2 : null,
    p_filter_frozen:
      typeof filters.filterFrozen === "boolean" ? filters.filterFrozen : null,
    p_filter_hidden:
      typeof filters.filterHidden === "boolean" ? filters.filterHidden : null,
    p_page: page,
    p_page_size: pageSize,
  });

  if (error) {
    console.error("Error fetching words for list via gated RPC", error);
    return { items: [], total: 0 };
  }

  const result = data as {
    items: any[];
    total: number;
    is_locked: boolean;
    max_allowed: number | null;
  };

  return {
    items: (result?.items || []).map(mapDictionaryEntry),
    total: result?.total ?? 0,
    isLocked: result?.is_locked,
    maxAllowed: result?.max_allowed,
  };
}

export async function removeWordsFromUserList(
  listId: string,
  wordIds: string[],
): Promise<{ error: any }> {
  const uniqueWordIds = Array.from(new Set(wordIds.filter(Boolean)));
  if (!uniqueWordIds.length) return { error: null };

  const { data: userData, error: userError } = await supabase.auth.getUser();
  const userId = userData?.user?.id ?? null;
  if (userError || !userId) {
    const error = userError ?? { message: "not_authenticated" };
    console.error("Error resolving user before removing words from list", error);
    return { error };
  }

  const { error } = await supabase.rpc("remove_entries_from_user_list", {
    p_user_id: userId,
    p_list_id: listId,
    p_word_ids: uniqueWordIds,
  });

  if (error) {
    console.error("Error removing words from list", error);
  }
  return { error };
}

export async function deleteUserList(listId: string): Promise<{ error: any }> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  const userId = userData?.user?.id ?? null;
  if (userError || !userId) {
    const error = userError ?? { message: "not_authenticated" };
    console.error("Error resolving user before deleting user list", error);
    return { error };
  }

  const { error } = await supabase.rpc("delete_user_word_list", {
    p_user_id: userId,
    p_list_id: listId,
  });

  if (error) {
    console.error("Error deleting user list", error);
  }
  return { error };
}

export async function createUserList(params: {
  userId: string;
  name: string;
  description?: string;
  language_code?: string;
}): Promise<WordListSummary | null> {
  const { data, error } = await supabase.rpc("create_user_word_list", {
    p_user_id: params.userId,
    p_name: params.name,
    p_description: params.description ?? null,
    p_language_code: params.language_code ?? "nl",
    p_primary_language_code: params.language_code ?? "nl",
  });

  if (error || !data) {
    console.error("Error creating user list", error);
    return null;
  }

  return mapUserListSummary(data);
}

export async function updateUserList(params: {
  userId: string;
  listId: string;
  name?: string;
  description?: string | null;
  language_code?: string;
  primary_language_code?: string;
}): Promise<WordListSummary | null> {
  const { data, error } = await supabase.rpc("update_user_word_list", {
    p_user_id: params.userId,
    p_list_id: params.listId,
    p_name: params.name ?? null,
    p_description: params.description ?? null,
    p_language_code: params.language_code ?? null,
    p_primary_language_code: params.primary_language_code ?? params.language_code ?? null,
  });

  if (error || !data) {
    console.error("Error updating user list", error);
    return null;
  }

  return mapUserListSummary(data);
}

export async function addWordsToUserList(
  listId: string,
  wordIds: string[],
): Promise<{ error: any }> {
  const uniqueWordIds = Array.from(new Set(wordIds.filter(Boolean)));
  if (!uniqueWordIds.length) {
    return { error: null };
  }

  const { data: userData, error: userError } = await supabase.auth.getUser();
  const userId = userData?.user?.id ?? null;
  if (userError || !userId) {
    const error = userError ?? { message: "not_authenticated" };
    console.error("Error resolving user before adding words to list", error);
    return { error };
  }

  const results = await Promise.all(
    uniqueWordIds.map((wordId) =>
      supabase.rpc("add_entry_to_user_list", {
        p_user_id: userId,
        p_list_id: listId,
        p_word_id: wordId,
      }),
    ),
  );
  const error = results.find((result) => result.error)?.error ?? null;

  if (error) {
    console.error("Error adding words to list", error);
  }
  return { error };
}

/**
 * Fetch which of the given wordIds are already in a user list.
 * Returns a Set of word_ids that are present in the list.
 */
export async function fetchUserListMembership(
  listId: string,
  wordIds: string[],
): Promise<Set<string>> {
  if (!wordIds.length) return new Set();

  const { data, error } = await supabase
    .from("user_word_list_items")
    .select("word_id")
    .eq("list_id", listId)
    .in("word_id", wordIds);

  if (error) {
    console.error("Error fetching user list membership", error);
    return new Set();
  }

  const ids = (data ?? [])
    .map((row: any) => row?.word_id)
    .filter((id: any): id is string => typeof id === "string" && id.length > 0);

  return new Set(ids);
}
