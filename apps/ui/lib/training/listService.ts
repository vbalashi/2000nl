import { supabase } from "../supabaseClient";
import type { WordListSummary, WordListType } from "../types";
import { mapCuratedListSummary, mapUserListSummary } from "./wordMappers";

export async function fetchCuratedLists(
  languageCode?: string,
): Promise<WordListSummary[]> {
  const baseSelect =
    "id, name, description, language_code, is_primary, word_list_items(count)";

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
  languageCode?: string,
): Promise<WordListSummary[]> {
  let query = supabase
    .from("user_word_lists")
    .select(
      "id, name, description, language_code, created_at, user_word_list_items(count)",
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (languageCode) {
    query = query.eq("language_code", languageCode);
  }

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
        "id, name, description, language_code, created_at, user_word_list_items(count)",
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
      "id, name, description, language_code, is_primary, word_list_items(count)",
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
