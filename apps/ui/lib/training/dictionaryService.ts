import { supabase } from "../supabaseClient";
import { trainingDebug } from "../trainingDebug";
import type { DictionaryEntry, TrainingWord } from "../types";
import { mapDictionaryEntry, normalizeRaw } from "./wordMappers";

type DictionaryEntryWithStats = DictionaryEntry & {
  stats?: { click_count: number; last_seen_at: string | null };
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const mapDictionaryLookupPayload = (
  data: any,
): DictionaryEntryWithStats | null => {
  const payload = Array.isArray(data) ? data[0] : data;
  if (!payload) return null;
  const entry = mapDictionaryEntry(payload);
  return {
    ...entry,
    meanings_count: payload.meanings_count ?? entry.meanings_count,
    ...(payload.stats ? { stats: payload.stats } : {}),
  };
};

const fetchDictionaryEntryById = async (
  id: string,
  userId?: string,
): Promise<DictionaryEntry | null> => {
  if (userId) {
    const { data, error } = await supabase.rpc("fetch_dictionary_entry_by_id_gated", {
      p_word_id: id,
    });

    if (error || !data) {
      if (error) {
        console.error("Unable to fetch gated dictionary entry by id", error);
      }
      return null;
    }

    return mapDictionaryEntry(data);
  }

  const { data, error } = await supabase
    .from("word_entries")
    .select("id, dictionary_id, language_code, headword, part_of_speech, gender, raw, is_nt2_2000")
    .eq("id", id)
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    console.error("Unable to fetch dictionary entry by id", error);
    return null;
  }

  return mapDictionaryEntry(data);
};

export const fetchTrainingWordById = async (
  id: string,
  userId?: string,
): Promise<TrainingWord | null> => {
  const entry = await fetchDictionaryEntryById(id, userId);
  if (!entry) {
    return null;
  }

  return {
    id: entry.id,
    ...(entry.dictionary_id ? { dictionary_id: entry.dictionary_id } : {}),
    ...(entry.language_code ? { language_code: entry.language_code } : {}),
    headword: entry.headword,
    part_of_speech: entry.part_of_speech ?? undefined,
    gender: entry.gender ?? undefined,
    raw: normalizeRaw(entry.raw),
    is_nt2_2000: entry.is_nt2_2000,
    meanings_count: entry.meanings_count,
    isFirstEncounter: false,
  };
};

export const fetchTrainingWordByLookup = async (
  lookup: string,
  userId?: string,
): Promise<TrainingWord | null> => {
  const normalized = lookup.trim();
  if (!normalized) {
    return null;
  }

  if (UUID_PATTERN.test(normalized)) {
    const byId = await fetchTrainingWordById(normalized, userId);
    if (byId) {
      return byId;
    }
  }

  if (userId) {
    const entry = await fetchDictionaryEntry(normalized, userId);
    if (!entry) {
      return null;
    }

    return {
      id: entry.id,
      ...(entry.dictionary_id ? { dictionary_id: entry.dictionary_id } : {}),
      ...(entry.language_code ? { language_code: entry.language_code } : {}),
      headword: entry.headword,
      part_of_speech: entry.part_of_speech ?? undefined,
      gender: entry.gender ?? undefined,
      raw: normalizeRaw(entry.raw),
      is_nt2_2000: entry.is_nt2_2000,
      meanings_count: entry.meanings_count,
      isFirstEncounter: false,
    };
  }

  const { data, error } = await supabase
    .from("word_entries")
    .select("id, dictionary_id, language_code, headword, part_of_speech, gender, raw, is_nt2_2000")
    .ilike("headword", normalized)
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    if (error) {
      console.error("Unable to fetch training word by headword", error);
    }
    return null;
  }

  return {
    id: data.id,
    ...(data.dictionary_id ? { dictionary_id: data.dictionary_id } : {}),
    ...(data.language_code ? { language_code: data.language_code } : {}),
    headword: data.headword,
    part_of_speech: data.part_of_speech ?? undefined,
    gender: data.gender ?? undefined,
    raw: normalizeRaw(data.raw),
    is_nt2_2000: data.is_nt2_2000,
    isFirstEncounter: false,
  };
};

export const fetchDictionaryEntry = async (
  headword: string,
  userId?: string,
): Promise<DictionaryEntryWithStats | null> => {
  const normalized = (headword || "").trim();
  if (!normalized) return null;

  if (userId) {
    const { data, error } = await supabase.rpc("fetch_dictionary_entry_gated", {
      p_headword: normalized,
    });

    if (!error) {
      return mapDictionaryLookupPayload(data);
    }

    console.error("Unable to fetch gated dictionary entry", error);
    return null;
  }

  const tryFetchByHeadword = async (value: string) => {
    const { data, error } = await supabase
      .from("word_entries")
      .select("id, dictionary_id, language_code, headword, part_of_speech, gender, raw, is_nt2_2000")
      .eq("headword", value)
      .limit(1)
      .maybeSingle();

    if (error || !data) {
      return null;
    }

    // Get count of siblings
    let countQuery = supabase
      .from("word_entries")
      .select("id", { count: "exact", head: true })
      .eq("headword", value);
    if (data.dictionary_id) {
      countQuery = countQuery.eq("dictionary_id", data.dictionary_id);
    } else if (data.language_code) {
      countQuery = countQuery.eq("language_code", data.language_code);
    }
    const { count } = await countQuery;

    return { ...mapDictionaryEntry(data), meanings_count: count ?? 1 };
  };

  // 1) Exact headword match (case sensitive, then case-insensitive via lowercase).
  const directMatch =
    (await tryFetchByHeadword(normalized)) ??
    (normalized.toLowerCase() !== normalized
      ? await tryFetchByHeadword(normalized.toLowerCase())
      : null);
  if (directMatch) {
    if (userId) {
      const { data: statsData } = await supabase
        .from("user_word_status")
        .select("click_count, last_seen_at")
        .eq("user_id", userId)
        .eq("word_id", directMatch.id)
        .maybeSingle();

      if (statsData) {
        return { ...directMatch, stats: statsData };
      }
    }
    return directMatch;
  }

  // 2) Fallback to word_forms mapping (normalized to lowercase).
  const { data: formRow, error: formError } = await supabase
    .from("word_forms")
    .select("word_id, headword")
    .eq("form", normalized.toLowerCase())
    .order("headword", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (formError) {
    console.error("Unable to query word_forms", formError);
  }

  if (!formRow?.word_id) {
    trainingDebug.log("No dictionary entry found for:", normalized);
    return null;
  }

  const entry = await fetchDictionaryEntryById(formRow.word_id, userId);
  if (!entry) return null;

  if (userId) {
    const { data: statsData } = await supabase
      .from("user_word_status")
      .select("click_count, last_seen_at")
      .eq("user_id", userId)
      .eq("word_id", entry.id)
      .maybeSingle();

    if (statsData) {
      return { ...entry, stats: statsData };
    }
  }

  return entry;
};
