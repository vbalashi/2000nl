/** Emergency coordinated rollback only. Normal readiness covers the whole source. */
export function fullSourceDictionaryTranslationEnabled() {
  return process.env.DICTIONARY_TRANSLATION_FULL_SOURCE_ENABLED !== "false";
}
