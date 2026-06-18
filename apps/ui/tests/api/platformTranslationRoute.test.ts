import { beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";

const getUser = vi.fn();
const rpc = vi.fn();
const from = vi.fn();
const createClient = vi.fn();
const translate = vi.fn(async (texts: string[]) =>
  texts.map((text) => `translated:${text}`),
);

vi.mock("@supabase/supabase-js", () => ({
  createClient,
}));

vi.mock("@/lib/translation/translationProvider", () => ({
  createTranslator: vi.fn(() => ({
    provider: "openai",
    translator: { translate },
  })),
  loadTranslationConfigFromEnv: vi.fn(() => ({
    provider: "openai",
    fallback: null,
    apiKeys: {
      openai: "test-openai-key",
      deepl: null,
      gemini: null,
    },
  })),
}));

vi.mock("@/lib/translation/prompts/promptFingerprint", () => ({
  getTranslationPromptFingerprint: vi.fn(() => "prompt-fingerprint"),
}));

const ENTRY_ID = "00000000-0000-4000-8000-000000000001";

const request = (body: unknown, token = "token-1") =>
  new NextRequest("http://localhost/api/platform/v1/translation", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      origin: "https://client.example",
    },
    body: JSON.stringify(body),
  });

const queryChain = (result: { data?: unknown; error?: unknown }) => {
  const query: any = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    update: vi.fn(() => query),
    upsert: vi.fn(() => query),
    maybeSingle: vi.fn(async () => result),
    then: (resolve: any, reject: any) =>
      Promise.resolve(result).then(resolve, reject),
  };
  return query;
};

function mockAuthenticatedClients() {
  const userClient = {
    auth: { getUser },
    rpc,
  };
  const serviceClient = {
    from,
  };
  createClient
    .mockReturnValueOnce(userClient)
    .mockReturnValueOnce(serviceClient);
  getUser.mockResolvedValueOnce({
    data: { user: { id: "user-1" } },
    error: null,
  });
}

function mockAuthenticatedClientsWithPreference(targetLang = "en") {
  const preferenceClient = {
    auth: { getUser },
    rpc,
    from,
  };
  const translationUserClient = {
    auth: { getUser },
    rpc,
  };
  const serviceClient = {
    from,
  };
  createClient
    .mockReturnValueOnce(preferenceClient)
    .mockReturnValueOnce(translationUserClient)
    .mockReturnValueOnce(serviceClient);
  getUser
    .mockResolvedValueOnce({
      data: { user: { id: "user-1" } },
      error: null,
    })
    .mockResolvedValueOnce({
      data: { user: { id: "user-1" } },
      error: null,
    });
  from.mockImplementationOnce((table: string) => {
    if (table === "user_settings") {
      return queryChain({
        data: { translation_lang: targetLang },
        error: null,
      });
    }
    throw new Error(`unexpected table read: ${table}`);
  });
}

describe("/api/platform/v1/translation", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    process.env.SUPABASE_SECRET_KEY = "service-key";
    process.env.PLATFORM_API_ALLOWED_ORIGINS = "https://client.example";
    createClient.mockReset();
    getUser.mockReset();
    rpc.mockReset();
    from.mockReset();
    translate.mockClear();
  });

  test("answers CORS preflight for configured origins", async () => {
    const { OPTIONS } = await import("@/app/api/platform/v1/translation/route");

    const response = OPTIONS(
      new NextRequest("http://localhost/api/platform/v1/translation", {
        method: "OPTIONS",
        headers: {
          origin: "https://client.example",
        },
      }),
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe(
      "https://client.example",
    );
    expect(response.headers.get("access-control-allow-methods")).toContain(
      "POST",
    );
  });

  test("validates missing entry id before creating clients", async () => {
    const { POST } = await import("@/app/api/platform/v1/translation/route");

    const response = await POST(request({ targetLang: "ru" }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "missing_entry_id",
    });
    expect(createClient).not.toHaveBeenCalled();
  });

  test("returns platform CORS headers for auth failures", async () => {
    const { POST } = await import("@/app/api/platform/v1/translation/route");

    const response = await POST(
      new NextRequest("http://localhost/api/platform/v1/translation", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://client.example",
        },
        body: JSON.stringify({ entryId: ENTRY_ID, targetLang: "ru" }),
      }),
    );

    expect(response.status).toBe(401);
    expect(response.headers.get("access-control-allow-origin")).toBe(
      "https://client.example",
    );
    await expect(response.json()).resolves.toEqual({
      entryId: ENTRY_ID,
      targetLang: "ru",
      error: "missing_bearer_token",
    });
  });

  test("wraps a fresh pending cache response with platform contract fields", async () => {
    mockAuthenticatedClients();
    rpc.mockResolvedValueOnce({
      data: {
        id: ENTRY_ID,
        headword: "huis",
        gender: "het",
        part_of_speech: "zn",
        raw: { meanings: [{ definition: "woning" }] },
      },
      error: null,
    });
    from.mockImplementation((table: string) => {
      if (table === "word_entry_translations") {
        return queryChain({
          data: {
            status: "pending",
            overlay: null,
            note: null,
            updated_at: new Date().toISOString(),
          },
          error: null,
        });
      }
      throw new Error(`unexpected table read: ${table}`);
    });

    const { POST } = await import("@/app/api/platform/v1/translation/route");
    const response = await POST(request({ entryId: ENTRY_ID, targetLang: "ru" }));

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe(
      "https://client.example",
    );
    await expect(response.json()).resolves.toEqual({
      entryId: ENTRY_ID,
      targetLang: "ru",
      status: "pending",
    });
  });

  test("generates and stores a missing translation overlay", async () => {
    mockAuthenticatedClients();
    rpc.mockResolvedValueOnce({
      data: {
        id: ENTRY_ID,
        headword: "huis",
        gender: "het",
        part_of_speech: "zn",
        raw: { meanings: [{ definition: "woning" }] },
      },
      error: null,
    });

    const lookupChain = queryChain({ data: null, error: null });
    const insertChain = queryChain({ data: { word_entry_id: ENTRY_ID }, error: null });
    const updateChain = queryChain({ data: null, error: null });
    from
      .mockReturnValueOnce(lookupChain)
      .mockReturnValueOnce(insertChain)
      .mockReturnValueOnce(updateChain);

    const { POST } = await import("@/app/api/platform/v1/translation/route");
    const response = await POST(request({ entryId: ENTRY_ID, targetLang: "ru" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(translate).toHaveBeenCalledWith(["het huis", "woning"], "ru");
    expect(insertChain.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        word_entry_id: ENTRY_ID,
        target_lang: "ru",
        provider: "openai",
        status: "pending",
      }),
      { onConflict: "word_entry_id,target_lang,provider", ignoreDuplicates: true },
    );
    expect(updateChain.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "ready",
        overlay: expect.objectContaining({
          headword: "translated:het huis",
          meanings: [
            expect.objectContaining({
              definition: "translated:woning",
            }),
          ],
        }),
        error_message: null,
      }),
    );
    expect(body).toEqual(
      expect.objectContaining({
        entryId: ENTRY_ID,
        targetLang: "ru",
        status: "ready",
        overlay: expect.objectContaining({
          headword: "translated:het huis",
        }),
      }),
    );
  });

  test("resolves omitted target language from user settings", async () => {
    mockAuthenticatedClientsWithPreference("en");
    rpc.mockResolvedValueOnce({
      data: {
        id: ENTRY_ID,
        headword: "huis",
        gender: "het",
        part_of_speech: "zn",
        raw: { meanings: [{ definition: "woning" }] },
      },
      error: null,
    });

    const lookupChain = queryChain({ data: null, error: null });
    const insertChain = queryChain({ data: { word_entry_id: ENTRY_ID }, error: null });
    const updateChain = queryChain({ data: null, error: null });
    from
      .mockReturnValueOnce(lookupChain)
      .mockReturnValueOnce(insertChain)
      .mockReturnValueOnce(updateChain);

    const { POST } = await import("@/app/api/platform/v1/translation/route");
    const response = await POST(request({ entryId: ENTRY_ID }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual(
      expect.objectContaining({
        entryId: ENTRY_ID,
        targetLang: "en",
        status: "ready",
      }),
    );
    expect(translate).toHaveBeenCalledWith(["het huis", "woning"], "en");
  });

  test("translates free text without using the entry overlay cache", async () => {
    const userClient = {
      auth: { getUser },
      from,
    };
    createClient.mockReturnValueOnce(userClient);
    getUser.mockResolvedValueOnce({
      data: { user: { id: "user-1" } },
      error: null,
    });
    from.mockImplementationOnce((table: string) => {
      if (table === "user_settings") {
        return queryChain({
          data: { translation_lang: "en" },
          error: null,
        });
      }
      throw new Error(`unexpected table read: ${table}`);
    });

    const { POST } = await import("@/app/api/platform/v1/text-translation/route");
    const response = await POST(
      new NextRequest("http://localhost/api/platform/v1/text-translation", {
        method: "POST",
        headers: {
          authorization: "Bearer token-1",
          "content-type": "application/json",
          origin: "https://client.example",
        },
        body: JSON.stringify({
          text: "ik ga naar huis",
          sourceLanguageCode: "nl",
          purpose: "youtube-recall",
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(from).toHaveBeenCalledTimes(1);
    expect(translate).toHaveBeenCalledWith(["ik ga naar huis"], "en");
    await expect(response.json()).resolves.toEqual({
      text: "ik ga naar huis",
      translatedText: "translated:ik ga naar huis",
      sourceLanguageCode: "nl",
      targetLanguageCode: "en",
      purpose: "youtube-recall",
      provider: "openai",
    });
  });
});
