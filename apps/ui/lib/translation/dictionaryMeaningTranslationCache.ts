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
  randomSuffix = crypto.getRandomValues(new Uint16Array(1))[0] % 1_000,
) {
  const iso = now.toISOString();
  const candidate = (suffix: number) =>
    iso.replace("Z", `${suffix.toString().padStart(3, "0")}Z`);
  const first = candidate(randomSuffix);
  return first === excludedRevision
    ? candidate((randomSuffix + 1) % 1_000)
    : first;
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
