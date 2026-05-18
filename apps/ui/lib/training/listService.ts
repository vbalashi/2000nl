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
  const { data: userData, error: userError } = await supabase.auth.getUser();
  const userId = userData?.user?.id ?? null;
  if (userError || !userId) {
    console.error(
      "Error resolving user before fetching curated lists",
      userError ?? { message: "not_authenticated" },
    );
    return [];
  }

  const { data, error } = await supabase.rpc("get_available_word_lists", {
    p_user_id: userId,
    p_language_code: languageCode ?? null,
    p_list_type: "curated",
  });

  if (error || !Array.isArray(data)) {
    if (error) console.error("Error fetching curated lists", error);
    return [];
  }

  return data.map(mapCuratedListSummary);
}

export async function fetchUserLists(
  userId: string,
  _languageCode?: string,
): Promise<WordListSummary[]> {
  const { data, error } = await supabase.rpc("get_available_word_lists", {
    p_user_id: userId,
    p_language_code: null,
    p_list_type: "user",
  });
  if (error || !Array.isArray(data)) return [];
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
  const { data, error } = await supabase.rpc("get_active_word_list", {
    p_user_id: userId,
  });

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
  const { data, error } = await supabase.rpc("get_word_list_summary", {
    p_user_id: params.userId,
    p_list_id: params.listId,
    p_list_type: params.listType,
  });

  if (error || !data) {
    if (error) {
      console.error("Error fetching list summary", error);
    }
    return null;
  }

  return params.listType === "user"
    ? mapUserListSummary(data)
    : mapCuratedListSummary(data);
}

export async function updateActiveList(params: {
  userId: string;
  listId: string | null;
  listType?: WordListType | null;
}) {
  const { error } = await supabase.rpc("update_active_word_list", {
    p_user_id: params.userId,
    p_list_id: params.listId,
    p_list_type: params.listId ? params.listType ?? "curated" : null,
  });

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

  const { data: userData, error: userError } = await supabase.auth.getUser();
  const userId = userData?.user?.id ?? null;
  if (userError || !userId) {
    console.error(
      "Error resolving user before fetching list membership",
      userError ?? { message: "not_authenticated" },
    );
    return new Set();
  }

  const { data, error } = await supabase.rpc("get_user_list_membership", {
    p_user_id: userId,
    p_list_id: listId,
    p_word_ids: wordIds,
  });

  if (error) {
    console.error("Error fetching user list membership", error);
    return new Set();
  }

  const ids = (Array.isArray(data) ? data : []).filter(
    (id: any): id is string => typeof id === "string" && id.length > 0,
  );

  return new Set(ids);
}
