export type DictionaryMeaningTranslationCacheKey = {
  wordEntryId: string;
  targetLanguageCode: string;
  provider: string;
  sourceFingerprint: string;
  claimUpdatedAt: string;
};

export function newDictionaryMeaningTranslationClaimRevision(
  now = new Date(),
  excludedRevision: string | null = null,
) {
  const excludedMs = excludedRevision ? Date.parse(excludedRevision) : NaN;
  const revisionMs = Number.isFinite(excludedMs)
    ? Math.max(now.getTime(), excludedMs + 1)
    : now.getTime();
  return new Date(revisionMs).toISOString();
}

/**
 * Completes only the exact translation claim that produced `values`.
 * Both the exact source/prompt fingerprint and this attempt's lease revision
 * must still match, so neither a different request nor a same-fingerprint
 * lease successor can be overwritten by late provider completion.
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
    .eq("source_fingerprint", key.sourceFingerprint)
    .eq("updated_at", key.claimUpdatedAt);
}
