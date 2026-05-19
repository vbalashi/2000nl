import { supabase } from "../supabaseClient";
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
      p_entry_id: id,
    });

    if (error || !data) {
      if (error) {
        console.error("Unable to fetch gated dictionary entry by id", error);
      }
      return null;
    }

    return mapDictionaryEntry(data);
  }

  return null;
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

  return null;
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

  return null;
};
