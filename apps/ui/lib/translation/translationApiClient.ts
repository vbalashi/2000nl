import { authenticatedJsonHeaders } from "@/lib/platform/platformV2Http";

export async function translationRequestHeaders(): Promise<HeadersInit> {
  return authenticatedJsonHeaders();
}

export async function fetchDictionaryMeaningTranslation(input: {
  entryId: string;
  targetLanguageCode: string;
  force?: boolean;
  debug?: boolean;
  signal?: AbortSignal;
}): Promise<Response> {
  return fetch("/api/platform/translation", {
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
  });
}
