import { supabase } from "@/lib/supabaseClient";

export async function translationRequestHeaders(): Promise<HeadersInit> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };

  if (typeof window === "undefined") {
    return headers;
  }

  const { data } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  return headers;
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
