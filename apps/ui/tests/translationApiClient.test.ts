import { beforeEach, describe, expect, test, vi } from "vitest";

const { getSession } = vi.hoisted(() => ({ getSession: vi.fn() }));

vi.mock("@/lib/supabaseClient", () => ({
  supabase: { auth: { getSession } },
}));

import {
  fetchDictionaryMeaningTranslation,
  translationRequestHeaders,
} from "@/lib/translation/translationApiClient";

describe("translationApiClient", () => {
  beforeEach(() => {
    getSession.mockReset();
    getSession.mockResolvedValue({
      data: { session: { access_token: "session-token" } },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: "ready" }))),
    );
  });

  test("gets authorization from the Supabase session adapter", async () => {
    window.localStorage.setItem(
      "sb-forged-auth-token",
      JSON.stringify({ access_token: "forged-token" }),
    );

    await expect(translationRequestHeaders()).resolves.toMatchObject({
      authorization: "Bearer session-token",
    });
    expect(getSession).toHaveBeenCalledTimes(1);
  });

  test("uses one Platform translation transport for first-party callers", async () => {
    await fetchDictionaryMeaningTranslation({
      entryId: "entry-1",
      targetLanguageCode: "ru",
      force: true,
    });

    expect(fetch).toHaveBeenCalledWith(
      "/api/platform/translation",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          authorization: "Bearer session-token",
        }),
        body: JSON.stringify({
          entryId: "entry-1",
          targetLang: "ru",
          force: true,
        }),
      }),
    );
  });

  test("bounds a stalled translation request", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn((_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
        }),
      ),
    );

    const pending = fetchDictionaryMeaningTranslation({
      entryId: "entry-1",
      targetLanguageCode: "ru",
      timeoutMs: 10,
    });
    const rejection = expect(pending).rejects.toThrow("platform_request_timeout");
    await vi.advanceTimersByTimeAsync(10);
    await rejection;
    vi.useRealTimers();
  });

  test("bounds stalled session acquisition before fetch starts", async () => {
    vi.useFakeTimers();
    getSession.mockReturnValueOnce(new Promise(() => undefined));

    const pending = fetchDictionaryMeaningTranslation({
      entryId: "entry-1",
      targetLanguageCode: "ru",
      timeoutMs: 10,
    });
    const rejection = expect(pending).rejects.toThrow("platform_request_timeout");
    await vi.advanceTimersByTimeAsync(10);
    await rejection;
    expect(fetch).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  test("honors caller abort while session acquisition is pending", async () => {
    getSession.mockReturnValueOnce(new Promise(() => undefined));
    const controller = new AbortController();
    const pending = fetchDictionaryMeaningTranslation({
      entryId: "entry-1",
      targetLanguageCode: "ru",
      signal: controller.signal,
    });
    const rejection = expect(pending).rejects.toThrow("AbortError");
    controller.abort();
    await rejection;
    expect(fetch).not.toHaveBeenCalled();
  });
});
