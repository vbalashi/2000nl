import { beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";
import crypto from "crypto";

const getUser = vi.fn();
const rpc = vi.fn();
const from = vi.fn();
const createClient = vi.fn();
const translate = vi.fn(async (texts: string[]) =>
  texts.map((text) => `translated:${text}`),
);
const translateWithContext = vi.fn(async (texts: string[]) =>
  texts.map((text) => `translated-with-context:${text}`),
);
let useTranslateWithContext = false;

vi.mock("@supabase/supabase-js", () => ({
  createClient,
}));

vi.mock("@/lib/translation/translationProvider", () => ({
  createTranslator: vi.fn(() => ({
    provider: "openai",
    translator: useTranslateWithContext
      ? { translate, translateWithContext }
      : { translate },
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
const sha256 = (value: string) => crypto.createHash("sha256").update(value).digest("hex");

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
    translateWithContext.mockClear();
    useTranslateWithContext = false;
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

  test("requires authentication when card translation target preference is omitted", async () => {
    const { POST } = await import("@/app/api/platform/v1/translation/route");

    const response = await POST(
      new NextRequest("http://localhost/api/platform/v1/translation", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://client.example",
        },
        body: JSON.stringify({ entryId: ENTRY_ID }),
      }),
    );

    expect(response.status).toBe(401);
    expect(response.headers.get("access-control-allow-origin")).toBe(
      "https://client.example",
    );
    await expect(response.json()).resolves.toEqual({
      entryId: ENTRY_ID,
      targetLang: null,
      error: "authentication_required",
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
          __meta: expect.objectContaining({
            translatedPaths: [["headword"], ["meanings", 0, "definition"]],
          }),
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
          __meta: expect.objectContaining({
            translatedPaths: [["headword"], ["meanings", 0, "definition"]],
          }),
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
    const cacheLookupChain = queryChain({ data: null, error: null });
    const pendingInsertChain = queryChain({ data: null, error: null });
    const readyUpdateChain = queryChain({ data: null, error: null });
    from.mockImplementation((table: string) => {
      if (table === "user_settings") {
        return queryChain({
          data: { translation_lang: "en" },
          error: null,
        });
      }
      if (table === "platform_text_translations") {
        if (from.mock.calls.filter(([name]) => name === table).length === 1) {
          return cacheLookupChain;
        }
        if (from.mock.calls.filter(([name]) => name === table).length === 2) {
          return pendingInsertChain;
        }
        return readyUpdateChain;
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
    expect(from).not.toHaveBeenCalledWith("word_entry_translations");
    expect(pendingInsertChain.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "pending",
        purpose: "youtube-recall",
      }),
      { onConflict: "translation_id", ignoreDuplicates: true },
    );
    expect(readyUpdateChain.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "ready",
        translated_text: "translated:ik ga naar huis",
        provider: "openai",
      }),
    );
    expect(translate).toHaveBeenCalledWith(["ik ga naar huis"], "en");
    await expect(response.json()).resolves.toEqual({
      translationId: expect.any(String),
      status: "ready",
      sourceTextHash: expect.any(String),
      sourceLanguageCode: "nl",
      targetLanguageCode: "en",
      translatedText: "translated:ik ga naar huis",
      translationPolicyVersion: "platform-text-translation-v1",
      cached: false,
    });
  });

  test("uses context hash in text translation artifact identity when provider consumes context", async () => {
    useTranslateWithContext = true;
    const runWithContext = async (contextText: string) => {
      vi.resetModules();
      createClient.mockReset();
      getUser.mockReset();
      from.mockReset();
      translateWithContext.mockClear();

      const userClient = {
        auth: { getUser },
        from,
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
      const cacheLookupChain = queryChain({ data: null, error: null });
      const pendingInsertChain = queryChain({ data: null, error: null });
      const readyUpdateChain = queryChain({ data: null, error: null });
      from.mockImplementation((table: string) => {
        if (table === "platform_text_translations") {
          const calls = from.mock.calls.filter(([name]) => name === table).length;
          if (calls === 1) return cacheLookupChain;
          if (calls === 2) return pendingInsertChain;
          return readyUpdateChain;
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
          },
          body: JSON.stringify({
            text: "ik ga naar huis",
            sourceLanguageCode: "nl",
            targetLanguageCode: "en",
            purpose: "youtube-recall",
            contextText,
          }),
        }),
      );

      expect(response.status).toBe(200);
      expect(translateWithContext).toHaveBeenCalledWith(
        ["ik ga naar huis"],
        "en",
        {
          sourceLanguageCode: "nl",
          purpose: "youtube-recall",
          contextText,
        },
      );
      expect(pendingInsertChain.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          source_text_hash: sha256("ik ga naar huis"),
          context_text_hash: sha256(contextText),
          purpose: "youtube-recall",
        }),
        { onConflict: "translation_id", ignoreDuplicates: true },
      );
      return response.json();
    };

    const first = await runWithContext("Hij is bijna thuis.");
    const second = await runWithContext("Hij vertrekt net.");

    expect(first).toMatchObject({
      sourceTextHash: sha256("ik ga naar huis"),
      contextTextHash: sha256("Hij is bijna thuis."),
      translatedText: "translated-with-context:ik ga naar huis",
    });
    expect(second).toMatchObject({
      sourceTextHash: sha256("ik ga naar huis"),
      contextTextHash: sha256("Hij vertrekt net."),
      translatedText: "translated-with-context:ik ga naar huis",
    });
    expect(first.translationId).not.toBe(second.translationId);
  });

  test("defaults text translation purpose for YouTube phrase practice", async () => {
    const userClient = {
      auth: { getUser },
      from,
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
    const cacheLookupChain = queryChain({ data: null, error: null });
    const pendingInsertChain = queryChain({ data: null, error: null });
    const readyUpdateChain = queryChain({ data: null, error: null });
    from.mockImplementation((table: string) => {
      if (table === "user_settings") {
        return queryChain({
          data: null,
          error: null,
        });
      }
      if (table === "platform_text_translations") {
        if (from.mock.calls.filter(([name]) => name === table).length === 1) {
          return cacheLookupChain;
        }
        if (from.mock.calls.filter(([name]) => name === table).length === 2) {
          return pendingInsertChain;
        }
        return readyUpdateChain;
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
        },
        body: JSON.stringify({
          text: "tot morgen",
          sourceLanguageCode: "nl",
        }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        status: "ready",
        sourceLanguageCode: "nl",
        targetLanguageCode: "en",
        translatedText: "translated:tot morgen",
        translationPolicyVersion: "platform-text-translation-v1",
        cached: false,
      }),
    );
  });

  test("returns cached ready text translation artifact without calling provider", async () => {
    const userClient = {
      auth: { getUser },
      from,
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
    from.mockImplementation((table: string) => {
      if (table === "platform_text_translations") {
        return queryChain({
          data: {
            translation_id: "translation-id",
            status: "ready",
            translated_text: "see you tomorrow",
            error_message: null,
            provider: "openai",
            source_text_hash: "source-hash",
            source_language_code: "nl",
            target_language_code: "en",
            purpose: "youtube-phrase-practice",
            translation_policy_version: "platform-text-translation-v1",
          },
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
        },
        body: JSON.stringify({
          text: "tot morgen",
          sourceLanguageCode: "nl",
          targetLanguageCode: "en",
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(translate).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      translationId: "translation-id",
      status: "ready",
      sourceTextHash: "source-hash",
      sourceLanguageCode: "nl",
      targetLanguageCode: "en",
      translatedText: "see you tomorrow",
      translationPolicyVersion: "platform-text-translation-v1",
      cached: true,
    });
  });

  test("returns cached pending text translation artifact without calling provider", async () => {
    const userClient = {
      auth: { getUser },
      from,
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
    from.mockImplementation((table: string) => {
      if (table === "platform_text_translations") {
        return queryChain({
          data: {
            translation_id: "translation-id",
            status: "pending",
            translated_text: null,
            error_message: null,
            provider: null,
            source_text_hash: "source-hash",
            source_language_code: "nl",
            target_language_code: "en",
            purpose: "youtube-phrase-practice",
            translation_policy_version: "platform-text-translation-v1",
          },
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
        },
        body: JSON.stringify({
          text: "tot morgen",
          sourceLanguageCode: "nl",
          targetLanguageCode: "en",
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(translate).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      translationId: "translation-id",
      status: "pending",
      sourceTextHash: "source-hash",
      sourceLanguageCode: "nl",
      targetLanguageCode: "en",
      translationPolicyVersion: "platform-text-translation-v1",
      cached: true,
    });
  });

  test("returns concurrent pending text translation artifact without calling provider", async () => {
    const userClient = {
      auth: { getUser },
      from,
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
    const cacheLookupChain = queryChain({ data: null, error: null });
    const duplicateInsertChain = queryChain({ data: null, error: null });
    const concurrentReadChain = queryChain({
      data: {
        translation_id: "translation-id",
        status: "pending",
        translated_text: null,
        error_message: null,
        provider: null,
        source_text_hash: "source-hash",
        source_language_code: "nl",
        target_language_code: "en",
        purpose: "youtube-phrase-practice",
        translation_policy_version: "platform-text-translation-v1",
      },
      error: null,
    });
    from.mockImplementation((table: string) => {
      if (table === "platform_text_translations") {
        const calls = from.mock.calls.filter(([name]) => name === table).length;
        if (calls === 1) return cacheLookupChain;
        if (calls === 2) return duplicateInsertChain;
        return concurrentReadChain;
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
        },
        body: JSON.stringify({
          text: "tot morgen",
          sourceLanguageCode: "nl",
          targetLanguageCode: "en",
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(duplicateInsertChain.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "pending",
      }),
      { onConflict: "translation_id", ignoreDuplicates: true },
    );
    expect(translate).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      translationId: "translation-id",
      status: "pending",
      sourceTextHash: "source-hash",
      sourceLanguageCode: "nl",
      targetLanguageCode: "en",
      translationPolicyVersion: "platform-text-translation-v1",
      cached: true,
    });
  });

  test("returns failed text translation artifact identity when provider fails", async () => {
    translate.mockRejectedValueOnce(new Error("provider down"));
    const userClient = {
      auth: { getUser },
      from,
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
    const cacheLookupChain = queryChain({ data: null, error: null });
    const pendingInsertChain = queryChain({ data: null, error: null });
    const failedUpdateChain = queryChain({ data: null, error: null });
    from.mockImplementation((table: string) => {
      if (table === "platform_text_translations") {
        if (from.mock.calls.filter(([name]) => name === table).length === 1) {
          return cacheLookupChain;
        }
        if (from.mock.calls.filter(([name]) => name === table).length === 2) {
          return pendingInsertChain;
        }
        return failedUpdateChain;
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
        },
        body: JSON.stringify({
          text: "tot morgen",
          sourceLanguageCode: "nl",
          targetLanguageCode: "en",
          purpose: "youtube-phrase-practice",
        }),
      }),
    );

    expect(response.status).toBe(502);
    expect(failedUpdateChain.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failed",
        error_message: "provider down",
      }),
    );
    await expect(response.json()).resolves.toEqual({
      translationId: expect.any(String),
      status: "failed",
      sourceTextHash: expect.any(String),
      sourceLanguageCode: "nl",
      targetLanguageCode: "en",
      translationPolicyVersion: "platform-text-translation-v1",
      cached: false,
      error: "provider down",
    });
  });
});
