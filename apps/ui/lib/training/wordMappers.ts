import type {
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
  ...(data.language_code ? { language_code: data.language_code } : {}),
  headword: data.headword,
  part_of_speech: data.part_of_speech ?? undefined,
  gender: data.gender ?? undefined,
  raw: normalizeRaw(data.raw),
  is_nt2_2000: data.is_nt2_2000,
  meanings_count: data.meanings_count ?? undefined,
});

export const mapCuratedListSummary = (row: any): WordListSummary => ({
  id: row.id,
  name: row.name,
  description: row.description,
  language_code: row.language_code,
  primary_language_code: row.primary_language_code ?? row.language_code ?? null,
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
  type: "user",
  item_count: row.user_word_list_items?.[0]?.count ?? undefined,
  created_at: row.created_at,
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
