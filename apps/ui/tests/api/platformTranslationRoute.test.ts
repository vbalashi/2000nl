import { beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";
import crypto from "crypto";
import {
  contentFingerprint,
  normalizeDictionaryContent,
} from "@/lib/platform/projections/dictionaryContent";
import {
  TRANSLATION_PIPELINE_VERSION,
  translationPolicyVersion,
} from "@/lib/translation/translationPolicy";
import { buildDictionaryMeaningTranslationRequest } from "@/lib/translation/dictionaryMeaningTranslationContract";
import { dictionaryMeaningTranslationFingerprint } from "@/lib/translation/dictionaryMeaningTranslationService";

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
const translateWithContextAndNote = vi.fn(async (texts: string[]) => ({
  translations: texts.map((text) => `translated-with-context:${text}`),
  literalTranslations: texts.map((text) => `literal:${text}`),
  note: "translator note",
}));
let useTranslateWithContext = false;
let useRichTranslateWithContext = false;

vi.mock("@supabase/supabase-js", () => ({
  createClient,
}));

vi.mock("@/lib/translation/translationProvider", () => ({
  createTranslator: vi.fn(() => ({
    provider: "openai",
    translator: useTranslateWithContext
      ? useRichTranslateWithContext
        ? { translate, translateWithContext, translateWithContextAndNote }
        : { translate, translateWithContext }
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
  getDictionaryMeaningPromptFingerprint: vi.fn(() => "prompt-fingerprint"),
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

const accessibleEntry = () => ({
  id: ENTRY_ID,
  headword: "huis",
  gender: "het",
  part_of_speech: "zn",
  raw: { meanings: [{ definition: "woning" }] },
});

const translationFingerprint = (entry: ReturnType<typeof accessibleEntry>) => {
  const sourceContentRevision = contentFingerprint(
    normalizeDictionaryContent(entry as any),
  );
  return dictionaryMeaningTranslationFingerprint({
    request: buildDictionaryMeaningTranslationRequest({
      entryId: entry.id,
      sourceContentFingerprint: sourceContentRevision,
      sourceLanguageCode: "nl",
      targetLanguageCode: "ru",
      word: entry,
    }),
    pipelineVersion: TRANSLATION_PIPELINE_VERSION,
    provider: "openai",
    promptFingerprint: "prompt-fingerprint",
  });
};

const currentPendingTranslation = () => ({
  status: "pending",
  overlay: null,
  note: null,
  source_content_revision: contentFingerprint(
    normalizeDictionaryContent(accessibleEntry() as any),
  ),
  source_fingerprint: translationFingerprint(accessibleEntry()),
  translation_policy_version: translationPolicyVersion("openai"),
  provider_revision: "prompt-fingerprint",
  updated_at: new Date().toISOString(),
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
  const platformUserClient = {
    auth: { getUser },
    rpc,
  };
  const translationUserClient = {
    auth: { getUser },
    rpc,
  };
  const serviceClient = {
    from,
  };
  createClient
    .mockReturnValueOnce(platformUserClient)
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
    translateWithContextAndNote.mockClear();
    useTranslateWithContext = false;
    useRichTranslateWithContext = false;
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
    const entry = {
      id: ENTRY_ID,
      headword: "huis",
      gender: "het",
      part_of_speech: "zn",
      raw: { meanings: [{ definition: "woning" }] },
    };
    rpc.mockResolvedValueOnce({
      data: entry,
      error: null,
    });
    from.mockImplementation((table: string) => {
      if (table === "word_entry_translations") {
        return queryChain({
          data: {
            status: "pending",
            overlay: null,
            note: null,
            source_content_revision: contentFingerprint(
              normalizeDictionaryContent(entry as any),
            ),
            source_fingerprint: translationFingerprint(entry),
            translation_policy_version:
              translationPolicyVersion("openai"),
            provider_revision: "prompt-fingerprint",
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
    expect(response.headers.get("x-platform-cache")).toBe("pending");
    expect(response.headers.get("access-control-allow-origin")).toBe(
      "https://client.example",
    );
    await expect(response.json()).resolves.toEqual({
      entryId: ENTRY_ID,
      targetLang: "ru",
      status: "pending",
    });
  });

  test("classifies a lost insert race as pending without provider work", async () => {
    mockAuthenticatedClients();
    rpc.mockResolvedValueOnce({ data: accessibleEntry(), error: null });
    from
      .mockReturnValueOnce(queryChain({ data: null, error: null }))
      .mockReturnValueOnce(queryChain({ data: null, error: null }))
      .mockReturnValueOnce(
        queryChain({ data: currentPendingTranslation(), error: null }),
      );

    const { POST } = await import("@/app/api/platform/v1/translation/route");
    const response = await POST(request({ entryId: ENTRY_ID, targetLang: "ru" }));

    expect(response.status).toBe(200);
    expect(response.headers.get("x-platform-cache")).toBe("pending");
    expect(translate).not.toHaveBeenCalled();
  });

  test("classifies a failed conditional claim as a cache hit", async () => {
    mockAuthenticatedClients();
    rpc.mockResolvedValueOnce({ data: accessibleEntry(), error: null });
    const stale = {
      ...currentPendingTranslation(),
      source_content_revision: "stale-revision",
      updated_at: "2026-08-13T00:00:00.000Z",
    };
    const ready = {
      ...currentPendingTranslation(),
      status: "ready",
      overlay: { headword: "дом", meanings: [{ definition: "жилище" }] },
    };
    from
      .mockReturnValueOnce(queryChain({ data: stale, error: null }))
      .mockReturnValueOnce(queryChain({ data: null, error: null }))
      .mockReturnValueOnce(queryChain({ data: ready, error: null }));

    const { POST } = await import("@/app/api/platform/v1/translation/route");
    const response = await POST(request({ entryId: ENTRY_ID, targetLang: "ru" }));

    expect(response.status).toBe(200);
    expect(response.headers.get("x-platform-cache")).toBe("hit");
    expect(translate).not.toHaveBeenCalled();
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
    expect(response.headers.get("x-platform-cache")).toBe("provider");
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

  test("translates generated draft items without requiring a persisted entry id", async () => {
    mockAuthenticatedClientsWithPreference("ru");

    const { POST } = await import("@/app/api/platform/v1/translation/route");
    const response = await POST(
      request({
        item: {
          entry: {
            id: "draft:gdc_1",
            content: {
              headword: "ruimtestraling",
              languageCode: "nl",
              sections: [
                {
                  id: "meaning-1",
                  kind: "meaning",
                  text: "Straling die afkomstig is uit de ruimte.",
                },
                {
                  id: "example-1",
                  kind: "example",
                  text: "Astronauten beschermen zich tegen ruimtestraling.",
                },
                {
                  id: "note-1",
                  kind: "note",
                  text: "Vaak genoemd in de context van ruimtevaart.",
                },
              ],
            },
          },
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(rpc).not.toHaveBeenCalled();
    expect(translate).toHaveBeenCalledWith(
      [
        "ruimtestraling",
        "Straling die afkomstig is uit de ruimte.",
        "Astronauten beschermen zich tegen ruimtestraling.",
        "Vaak genoemd in de context van ruimtevaart.",
      ],
      "ru",
    );
    await expect(response.json()).resolves.toEqual({
      entryId: "draft:gdc_1",
      targetLang: "ru",
      status: "ready",
      overlay: {
        headword: "translated:ruimtestraling",
        meanings: [
          {
            definition: "translated:Straling die afkomstig is uit de ruimte.",
            context: "translated:Vaak genoemd in de context van ruimtevaart.",
            examples: [
              "translated:Astronauten beschermen zich tegen ruimtestraling.",
            ],
          },
        ],
        __meta: {
          translationPolicyVersion: "platform-generated-draft-translation-v1",
        },
      },
      translationPolicyVersion: "platform-generated-draft-translation-v1",
    });
  });

  test("prefers generated draft item over draft entry id", async () => {
    mockAuthenticatedClientsWithPreference("en");

    const { POST } = await import("@/app/api/platform/v1/translation/route");
    const response = await POST(
      request({
        entryId: "draft:gdc_1",
        item: {
          entry: {
            id: "draft:gdc_1",
            content: {
              headword: "gedoe",
              languageCode: "nl",
              sections: [
                {
                  id: "meaning-1",
                  kind: "meaning",
                  text: "Situatie die veel moeite veroorzaakt.",
                },
              ],
            },
          },
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(rpc).not.toHaveBeenCalled();
    expect(translate).toHaveBeenCalledWith(
      ["gedoe", "Situatie die veel moeite veroorzaakt."],
      "en",
    );
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        entryId: "draft:gdc_1",
        status: "ready",
        translationPolicyVersion: "platform-generated-draft-translation-v1",
      }),
    );
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
        translation_policy_version: "platform-text-translation-v2",
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
      translationPolicyVersion: "platform-text-translation-v2",
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

  test("returns rich text translation fields when provider supplies them", async () => {
    useTranslateWithContext = true;
    useRichTranslateWithContext = true;
    vi.resetModules();
    createClient.mockReset();
    getUser.mockReset();
    from.mockReset();

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
          text: "enorm toe.",
          sourceLanguageCode: "nl",
          targetLanguageCode: "ru",
          purpose: "youtube-span-translation",
          contextText: "Plotseling nemen de kansen om leven in het universum te vinden enorm toe.",
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(translateWithContextAndNote).toHaveBeenCalledWith(
      ["enorm toe."],
      "ru",
      {
        sourceLanguageCode: "nl",
        purpose: "youtube-span-translation",
        contextText: "Plotseling nemen de kansen om leven in het universum te vinden enorm toe.",
      },
    );
    expect(readyUpdateChain.update).toHaveBeenCalledWith(
      expect.objectContaining({
        translated_text: "translated-with-context:enorm toe.",
        literal_translated_text: "literal:enorm toe.",
        translator_comment: "translator note",
      }),
    );
    await expect(response.json()).resolves.toMatchObject({
      translatedText: "translated-with-context:enorm toe.",
      literalTranslatedText: "literal:enorm toe.",
      translatorComment: "translator note",
    });

    useRichTranslateWithContext = false;
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
        translationPolicyVersion: "platform-text-translation-v2",
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
            translation_policy_version: "platform-text-translation-v2",
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
      translationPolicyVersion: "platform-text-translation-v2",
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
            translation_policy_version: "platform-text-translation-v2",
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
      translationPolicyVersion: "platform-text-translation-v2",
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
        translation_policy_version: "platform-text-translation-v2",
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
      translationPolicyVersion: "platform-text-translation-v2",
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
      translationPolicyVersion: "platform-text-translation-v2",
      cached: false,
      error: "provider down",
    });
  });
});
