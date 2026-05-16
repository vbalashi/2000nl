import { supabase } from "../supabaseClient";
import { trainingDebug } from "../trainingDebug";
import type { DictionaryEntry, TrainingWord } from "../types";
import { mapDictionaryEntry, normalizeRaw } from "./wordMappers";

const fetchDictionaryEntryById = async (
  id: string,
): Promise<DictionaryEntry | null> => {
  const { data, error } = await supabase
    .from("word_entries")
    .select("id, headword, part_of_speech, gender, raw, is_nt2_2000")
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
): Promise<TrainingWord | null> => {
  const { data, error } = await supabase
    .from("word_entries")
    .select("id, headword, part_of_speech, gender, raw, is_nt2_2000")
    .eq("id", id)
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    if (error) {
      console.error("Unable to fetch training word by id", error);
    }
    return null;
  }

  return {
    id: data.id,
    headword: data.headword,
    part_of_speech: data.part_of_speech ?? undefined,
    gender: data.gender ?? undefined,
    raw: normalizeRaw(data.raw),
    is_nt2_2000: data.is_nt2_2000,
    isFirstEncounter: false,
  };
};

export const fetchTrainingWordByLookup = async (
  lookup: string,
): Promise<TrainingWord | null> => {
  const normalized = lookup.trim();
  if (!normalized) {
    return null;
  }

  const byId = await fetchTrainingWordById(normalized);
  if (byId) {
    return byId;
  }

  const { data, error } = await supabase
    .from("word_entries")
    .select("id, headword, part_of_speech, gender, raw, is_nt2_2000")
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
): Promise<
  | (DictionaryEntry & {
      stats?: { click_count: number; last_seen_at: string | null };
    })
  | null
> => {
  const normalized = (headword || "").trim();
  if (!normalized) return null;

  const tryFetchByHeadword = async (value: string) => {
    const { data, error } = await supabase
      .from("word_entries")
      .select("id, headword, part_of_speech, gender, raw, is_nt2_2000")
      .eq("headword", value)
      .limit(1)
      .maybeSingle();

    if (error || !data) {
      return null;
    }

    // Get count of siblings
    const { count } = await supabase
      .from("word_entries")
      .select("id", { count: "exact", head: true })
      .eq("headword", value);

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

  const entry = await fetchDictionaryEntryById(formRow.word_id);
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
