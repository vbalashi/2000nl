export type DictionaryMeaningTranslationCacheKey = {
  wordEntryId: string;
  targetLanguageCode: string;
  provider: string;
  sourceFingerprint: string;
};

/**
 * Completes only the exact translation claim that produced `values`.
 * A newer source/prompt claim changes source_fingerprint and makes this update
 * a no-op, so late provider success or failure cannot overwrite newer work.
 */
export async function updateOwnedDictionaryMeaningTranslation(
  supabase: any,
  key: DictionaryMeaningTranslationCacheKey,
  values: Record<string, unknown>,
): Promise<{ error: { message?: string } | null }> {
  return supabase
    .from("word_entry_translations")
    .update(values)
    .eq("word_entry_id", key.wordEntryId)
    .eq("target_lang", key.targetLanguageCode)
    .eq("provider", key.provider)
    .eq("source_fingerprint", key.sourceFingerprint);
}
