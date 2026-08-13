import { authenticatedJsonHeaders } from "@/lib/platform/platformV2Http";
import { forwardAbortSignal } from "@/lib/platform/platformFetchWithTimeout";

const DEFAULT_TRANSLATION_TIMEOUT_MS = 12_000;

export async function translationRequestHeaders(): Promise<HeadersInit> {
  return authenticatedJsonHeaders();
}

export async function fetchDictionaryMeaningTranslation(input: {
  entryId: string;
  targetLanguageCode: string;
  force?: boolean;
  debug?: boolean;
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
    controller.signal.addEventListener(
      "abort",
      () => reject(new Error(timedOut ? "platform_request_timeout" : "AbortError")),
      { once: true },
    );
  });

  try {
    return await Promise.race([
      (async () =>
        fetch("/api/platform/translation", {
          method: "POST",
          cache: "no-store",
          credentials: "same-origin",
          signal: controller.signal,
          headers: await Promise.race([translationRequestHeaders(), aborted]),
          body: JSON.stringify({
            entryId: input.entryId,
            targetLang: input.targetLanguageCode,
            ...(input.force ? { force: true } : {}),
            ...(input.debug ? { debug: true } : {}),
          }),
        }))(),
      aborted,
    ]);
  } finally {
    globalThis.clearTimeout(timeout);
    detach();
  }
}
