import { authenticatedJsonHeaders } from "@/lib/platform/platformV2Http";
import { platformFetchWithTimeout } from "@/lib/platform/platformFetchWithTimeout";

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
  return platformFetchWithTimeout("/api/platform/translation", {
    method: "POST",
    cache: "no-store",
    credentials: "same-origin",
    signal: input.signal,
    headers: await translationRequestHeaders(),
    body: JSON.stringify({
      entryId: input.entryId,
      targetLang: input.targetLanguageCode,
      ...(input.force ? { force: true } : {}),
      ...(input.debug ? { debug: true } : {}),
    }),
  }, input.timeoutMs);
}
