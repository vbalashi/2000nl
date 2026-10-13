type ReadyTranslation = { entryId: string; targetLanguageCode: string };
const listeners = new Set<(translation: ReadyTranslation) => void>();

/** Public dictionary identity only; never carries learner state or translation text. */
export function onDictionaryTranslationReady(listener: (translation: ReadyTranslation) => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function publishDictionaryTranslationReady(translation: ReadyTranslation) {
  for (const listener of [...listeners]) {
    try { listener(translation); } catch { /* A display subscriber cannot fail a completed server request. */ }
  }
}
