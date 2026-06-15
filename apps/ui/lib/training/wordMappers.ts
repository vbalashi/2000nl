import type {
  ActiveTrainingScope,
  AvailableDictionarySource,
  AvailableLearningLanguage,
  DictionaryEntry,
  SidebarHistoryItem,
  TrainingScenario,
  WordListSummary,
  WordRaw,
} from "../types";

export const normalizeRaw = (raw: unknown): WordRaw => {
  if (!raw) {
    return {};
  }

  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as WordRaw;
    } catch {
      return {};
    }
  }

  return raw as WordRaw;
};

export const isCrossReferenceOnly = (raw: WordRaw): boolean => {
  return (
    Boolean(raw?.cross_reference) &&
    Array.isArray(raw.meanings) &&
    raw.meanings.length === 0
  );
};

export const mapDictionaryEntry = (data: any): DictionaryEntry => ({
  id: data.id,
  ...(data.dictionary_id ? { dictionary_id: data.dictionary_id } : {}),
  ...(data.dictionary_name ? { dictionary_name: data.dictionary_name } : {}),
  ...(data.dictionary_slug ? { dictionary_slug: data.dictionary_slug } : {}),
  ...(data.dictionary_kind ? { dictionary_kind: data.dictionary_kind } : {}),
  ...(data.language_code ? { language_code: data.language_code } : {}),
  headword: data.headword,
  part_of_speech: data.part_of_speech ?? undefined,
  gender: data.gender ?? undefined,
  raw: normalizeRaw(data.raw),
  is_nt2_2000: data.is_nt2_2000,
  meanings_count: data.meanings_count ?? undefined,
  ...(data.search_match_group
    ? { search_match_group: data.search_match_group }
    : {}),
  ...(data.search_match_label
    ? { search_match_label: data.search_match_label }
    : {}),
  ...(data.search_matched_text
    ? { search_matched_text: data.search_matched_text }
    : {}),
  ...(typeof data.search_group_rank === "number"
    ? { search_group_rank: data.search_group_rank }
    : {}),
});

export const mapCuratedListSummary = (row: any): WordListSummary => ({
  id: row.id,
  name: row.name,
  description: row.description,
  language_code: row.language_code,
  primary_language_code: row.primary_language_code ?? row.language_code ?? null,
  is_mixed_language: Boolean(row.is_mixed_language),
  default_scenario_id: row.default_scenario_id ?? null,
  card_policy: row.card_policy ?? "inherit",
  card_type_ids: row.card_type_ids ?? null,
  type: "curated",
  item_count: row.word_list_items?.[0]?.count ?? undefined,
  is_primary: row.is_primary ?? undefined,
});

export const mapUserListSummary = (row: any): WordListSummary => ({
  id: row.id,
  name: row.name,
  description: row.description,
  language_code: row.language_code,
  primary_language_code: row.primary_language_code ?? row.language_code ?? null,
  is_mixed_language: Boolean(row.is_mixed_language),
  default_scenario_id: row.default_scenario_id ?? null,
  card_policy: row.card_policy ?? "inherit",
  card_type_ids: row.card_type_ids ?? null,
  type: "user",
  item_count: row.user_word_list_items?.[0]?.count ?? undefined,
  created_at: row.created_at,
});

export const mapAvailableLearningLanguage = (
  row: any,
): AvailableLearningLanguage => ({
  code: row.code,
  label: row.label ?? row.code,
  dictionaryCount: row.dictionary_count ?? 0,
  curatedListCount: row.curated_list_count ?? 0,
  userListCount: row.user_list_count ?? 0,
  hasTrainingEligibleLists: Boolean(row.has_training_eligible_lists),
});

export const mapAvailableDictionarySource = (
  row: any,
): AvailableDictionarySource => ({
  id: row.id,
  languageCode: row.language_code,
  slug: row.slug,
  name: row.name,
  kind: row.kind,
  visibility: row.visibility ?? null,
  isEditable: Boolean(row.is_editable),
  entryCount: row.entry_count ?? 0,
});

export const mapActiveTrainingScope = (row: any): ActiveTrainingScope => ({
  languageCode: row?.language_code ?? "nl",
  activeListId: row?.active_list_id ?? null,
  activeListType:
    row?.active_list_type === "curated" || row?.active_list_type === "user"
      ? row.active_list_type
      : null,
  activeScenario: row?.active_scenario ?? "understanding",
  cardFilter:
    row?.card_filter === "new" ||
    row?.card_filter === "review" ||
    row?.card_filter === "both"
      ? row.card_filter
      : "both",
  modesEnabled: Array.isArray(row?.modes_enabled)
    ? row.modes_enabled
    : ["word-to-definition"],
  newReviewRatio: row?.new_review_ratio ?? 2,
  hasSavedScope: Boolean(row?.has_saved_scope),
  isValid: Boolean(row?.is_valid),
});

export const mapScenario = (data: any): TrainingScenario => ({
  id: data.id,
  nameEn: data.name_en,
  nameNl: data.name_nl ?? undefined,
  description: data.description ?? undefined,
  cardModes: data.card_modes ?? [],
  graduationThreshold: data.graduation_threshold ?? 21,
  enabled: data.enabled ?? true,
  sortOrder: data.sort_order ?? 0,
});

export const mapEventTypeToResult = (
  eventType: string,
): SidebarHistoryItem["result"] => {
  if (eventType === "review_fail") return "fail";
  if (eventType === "review_hard") return "hard";
  if (eventType === "review_success") return "success";
  if (eventType === "review_easy") return "easy";
  return "neutral";
};
