vi.mock("@/lib/providers/providerSafety", async () => ({
  ...await vi.importActual<typeof import("@/lib/providers/providerSafety")>("@/lib/providers/providerSafety"),
  runProviderWork: async (input: { execute: () => Promise<unknown> }) => ({status:"ready", result:await input.execute(), cached:false}),
}));
import { beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";
import crypto from "crypto";
import {
  contentFingerprint,
  normalizeDictionaryContent,
} from "@/lib/platform/projections/dictionaryContent";
import {
  TRANSLATION_PIPELINE_VERSION,
  ordinaryTranslationPolicyVersion,
} from "@/lib/translation/translationPolicy";
import { buildDictionaryMeaningTranslationRequest } from "@/lib/translation/dictionaryMeaningTranslationContract";
import { dictionaryMeaningTranslationFingerprint } from "@/lib/translation/dictionaryMeaningTranslationService";

const getUser = vi.fn();
const rpc = vi.fn();
const from = vi.fn();
const createClient = vi.fn();
const translate = vi.fn(async (texts: string[], _target?: string) =>
  texts.map((text) => `translated:${text}`),
);
const translateWithContext = vi.fn(async (texts: string[], _target?: string, _context?: unknown) =>
  texts.map((text) => `translated-with-context:${text}`),
);
const translateWithContextAndNote = vi.fn(async (texts: string[], _target?: string, _context?: unknown) => ({
  translations: texts.map((text) => `translated-with-context:${text}`),
  literalTranslations: texts.map((text) => `literal:${text}`),
  note: "translator note",
  meta: {
    providerSelected: "openai",
    providerUsed: "deepl",
    usedFallback: true,
  },
}));
const translateText = vi.fn(async (request: {
  texts: string[];
  targetLanguageCode: string;
  sourceLanguageCode?: string;
  purpose?: string;
  contextText?: string | null;
}) => {
  const context = {
    sourceLanguageCode: request.sourceLanguageCode,
    purpose: request.purpose,
    contextText: request.contextText,
  };
  if (useRichTranslateWithContext) {
    return translateWithContextAndNote(
      request.texts,
      request.targetLanguageCode,
      context,
    );
  }
  const translations = useTranslateWithContext
    ? await translateWithContext(
        request.texts,
        request.targetLanguageCode,
        context,
      )
    : await translate(request.texts, request.targetLanguageCode);
  return {
    translations,
    meta: {
      providerSelected: "openai",
      providerUsed: "openai",
      usedFallback: false,
    },
  };
});
let useTranslateWithContext = false;
let useRichTranslateWithContext = false;

vi.mock("@supabase/supabase-js", async () => {
 const { withSessionAuthorityFactory } = await import("../fixtures/sessionAuthority");
 return { createClient: withSessionAuthorityFactory(createClient) };
});

vi.mock("@/lib/translation/translationProvider", () => ({
  createTranslator: vi.fn(() => ({
    provider: "openai",
    translator: {
      translate,
      translateText,
      ...(useTranslateWithContext
        ? useRichTranslateWithContext
          ? { translateWithContext, translateWithContextAndNote }
          : { translateWithContext }
        : {}),
    },
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
  translation_policy_version: ordinaryTranslationPolicyVersion("openai"),
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
  const serviceClient = {
    from,
  };
  createClient
    .mockReturnValueOnce(platformUserClient)
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
  const serviceClient = {
    from,
  };
  createClient
    .mockReturnValueOnce(preferenceClient)
    .mockReturnValueOnce(serviceClient);
  getUser.mockResolvedValueOnce({
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
    rpc.mockResolvedValue({
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
              ordinaryTranslationPolicyVersion("openai"),
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
    expect(getUser).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(response.headers.get("access-control-allow-origin")).toBe(
      "https://client.example",
    );
    await expect(response.json()).resolves.toEqual({
      entryId: ENTRY_ID,
      targetLang: "ru",
      status: "pending",
    });
  });

  test("does not create the service cache client before gated entry authorization", async () => {
    const platformUserClient = { auth: { getUser }, rpc };
    createClient.mockReturnValueOnce(platformUserClient);
    getUser.mockResolvedValueOnce({
      data: { user: { id: "user-1" } },
      error: null,
    });
    rpc.mockResolvedValue({ data: null, error: null });

    const { POST } = await import("@/app/api/platform/v1/translation/route");
    const response = await POST(request({ entryId: ENTRY_ID, targetLang: "ru" }));

    expect(response.status).toBe(404);
    expect(rpc).toHaveBeenCalledWith("fetch_dictionary_entry_by_id_gated", {
      p_entry_id: ENTRY_ID,
    });
    expect(createClient).toHaveBeenCalledTimes(1);
    expect(from).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      entryId: ENTRY_ID,
      targetLang: "ru",
      error: "word_entry_not_found",
    });
  });

  test("rejects an invalid target language loaded from user settings", async () => {
    const preferenceClient = { auth: { getUser }, rpc, from };
    createClient.mockReturnValueOnce(preferenceClient);
    getUser.mockResolvedValueOnce({
      data: { user: { id: "user-1" } },
      error: null,
    });
    from.mockImplementationOnce((table: string) => {
      if (table === "user_settings") {
        return queryChain({ data: { translation_lang: "ru;ignore" }, error: null });
      }
      throw new Error(`unexpected table read: ${table}`);
    });

    const { POST } = await import("@/app/api/platform/v1/translation/route");
    const response = await POST(request({ entryId: ENTRY_ID }));

    expect(response.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      entryId: ENTRY_ID,
      targetLang: "ru;ignore",
      error: "Invalid lang",
    });
  });

  test("classifies a lost insert race as pending without provider work", async () => {
    mockAuthenticatedClients();
    rpc.mockResolvedValue({ data: accessibleEntry(), error: null });
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

  test("keeps a failed lost-insert race classified as cached pending", async () => {
    mockAuthenticatedClients();
    rpc.mockResolvedValue({ data: accessibleEntry(), error: null });
    from
      .mockReturnValueOnce(queryChain({ data: null, error: null }))
      .mockReturnValueOnce(queryChain({ data: null, error: null }))
      .mockReturnValueOnce(
        queryChain({
          data: {
            ...currentPendingTranslation(),
            status: "failed",
            error_message: "provider_unknown_error:000000000000000000000000",
          },
          error: null,
        }),
      );

    const { POST } = await import("@/app/api/platform/v1/translation/route");
    const response = await POST(request({ entryId: ENTRY_ID, targetLang: "ru" }));

    expect(response.status).toBe(200);
    expect(response.headers.get("x-platform-cache")).toBe("pending");
    expect(translate).not.toHaveBeenCalled();
  });

  test("classifies a failed conditional claim as a cache hit", async () => {
    mockAuthenticatedClients();
    rpc.mockResolvedValue({ data: accessibleEntry(), error: null });
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

  test("keeps a failed conditional-claim result classified as cached pending", async () => {
    mockAuthenticatedClients();
    rpc.mockResolvedValue({ data: accessibleEntry(), error: null });
    const stale = {
      ...currentPendingTranslation(),
      source_content_revision: "stale-revision",
      updated_at: "2026-08-13T00:00:00.000Z",
    };
    const failed = {
      ...currentPendingTranslation(),
      status: "failed",
      error_message: "provider_unknown_error:000000000000000000000000",
    };
    from
      .mockReturnValueOnce(queryChain({ data: stale, error: null }))
      .mockReturnValueOnce(queryChain({ data: null, error: null }))
      .mockReturnValueOnce(queryChain({ data: failed, error: null }));

    const { POST } = await import("@/app/api/platform/v1/translation/route");
    const response = await POST(request({ entryId: ENTRY_ID, targetLang: "ru" }));

    expect(response.status).toBe(200);
    expect(response.headers.get("x-platform-cache")).toBe("pending");
    expect(translate).not.toHaveBeenCalled();
  });

  test("generates and stores a missing translation overlay", async () => {
    mockAuthenticatedClients();
    rpc.mockResolvedValue({
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
    rpc.mockResolvedValue({
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

});
