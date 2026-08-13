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
      Authorization: "Bearer session-token",
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
          Authorization: "Bearer session-token",
        }),
        body: JSON.stringify({
          entryId: "entry-1",
          targetLang: "ru",
          force: true,
        }),
      }),
    );
  });
});
