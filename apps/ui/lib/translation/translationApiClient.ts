import type { CurrentTrainingCardContext } from "@/lib/platform/trainingCurrentCardClient";
import { authenticatedJsonHeaders } from "@/lib/platform/platformV2Http";
import { forwardAbortSignal } from "@/lib/platform/platformFetchWithTimeout";
import { DICTIONARY_TRANSLATION_CLIENT_MS } from "./dictionaryTranslationBudgets";

const DEFAULT_TRANSLATION_TIMEOUT_MS = DICTIONARY_TRANSLATION_CLIENT_MS;

export async function translationRequestHeaders(): Promise<HeadersInit> {
  return authenticatedJsonHeaders();
}

export async function fetchDictionaryMeaningTranslation(input: {
  entryId: string;
  currentCard?: CurrentTrainingCardContext;
  targetLanguageCode: string;
  force?: boolean;
  debug?: boolean;
  observeOnly?: boolean;
  background?: boolean;
  signal?: AbortSignal;
  timeoutMs?: number;
}): Promise<Response> {
  const controller = new AbortController();
  const detach = forwardAbortSignal(input.signal, controller);
  let timedOut = false;
  const timeout = globalThis.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, input.timeoutMs ?? DEFAULT_TRANSLATION_TIMEOUT_MS);
  const aborted = new Promise<never>((_resolve, reject) => {
    const abortError = () =>
      timedOut
        ? new Error("platform_request_timeout")
        : new DOMException("The operation was aborted", "AbortError");
    if (controller.signal.aborted) {
      reject(abortError());
      return;
    }
    controller.signal.addEventListener(
      "abort",
      () => reject(abortError()),
      { once: true },
    );
  });

  try {
    return await Promise.race([
      (async () => {
        const response = await fetch("/api/platform/translation", {
          method: "POST",
          cache: "no-store",
          credentials: "same-origin",
          signal: controller.signal,
          headers: await Promise.race([translationRequestHeaders(), aborted]),
          body: JSON.stringify({
            entryId: input.entryId,
            ...(input.currentCard ? {currentCard:input.currentCard} : {}),
            targetLang: input.targetLanguageCode,
            ...(input.force ? { force: true } : {}),
            ...(input.debug ? { debug: true } : {}),
            ...(input.observeOnly ? { observeOnly: true } : {}),
            ...(input.background ? { background: true } : {}),
          }),
        });
        // Keep the deadline and caller cancellation active through the body.
        const body = await response.text();
        return new Response([204, 205, 304].includes(response.status) ? null : body, {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
        });
      })(),
      aborted,
    ]);
  } finally {
    globalThis.clearTimeout(timeout);
    detach();
  }
}
