import { DICTIONARY_TRANSLATION_OPERATION_MS } from "./dictionaryTranslationBudgets";
import { safeTranslationProviderError } from "./translationProviderFailure";

/** Also bounds generic-provider/fallback paths; late results cannot publish a cache write. */
export async function withDictionaryTranslationDeadline<T>(
  operation: () => Promise<T>,
  timeoutMs = DICTIONARY_TRANSLATION_OPERATION_MS,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(safeTranslationProviderError("provider_timeout", null)),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
