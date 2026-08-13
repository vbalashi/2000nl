import { beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  contentFingerprint,
  normalizeDictionaryContent,
} from "@/lib/platform/projections/dictionaryContent";
import { ordinaryTranslationPolicyVersion } from "@/lib/translation/translationPolicy";
import {
  IDIOM_ONLY_TRANSLATION_PIPELINE_VERSION,
  TRANSLATION_PIPELINE_VERSION,
} from "@/lib/translation/translationPolicy";
import { buildDictionaryMeaningTranslationRequest } from "@/lib/translation/dictionaryMeaningTranslationContract";
import { dictionaryMeaningTranslationFingerprint } from "@/lib/translation/dictionaryMeaningTranslationService";

const getUser = vi.fn();
const rpc = vi.fn();
const from = vi.fn();
const createClient = vi.fn();
const translateDictionaryMeaning = vi.hoisted(() => vi.fn());
const createTranslator = vi.hoisted(() => vi.fn());

vi.mock("@supabase/supabase-js", () => ({
  createClient,
}));

vi.mock("@/lib/translation/translationProvider", () => ({
  createTranslator,
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

const request = (token?: string, query = "") =>
  new NextRequest(
    `http://localhost/api/translation?word_id=00000000-0000-4000-8000-000000000001&lang=en${query}`,
    {
      headers: token ? { authorization: `Bearer ${token}` } : {},
    },
  );

const accessibleWord = {
  id: "00000000-0000-4000-8000-000000000001",
  headword: "huis",
  gender: "het",
  part_of_speech: "zn",
  raw: { meanings: [{ definition: "woning" }] },
};

const translationFingerprint = (word: any) => {
  const sourceContentRevision = contentFingerprint(
    normalizeDictionaryContent(word as any),
  );
  return dictionaryMeaningTranslationFingerprint({
    request: buildDictionaryMeaningTranslationRequest({
      entryId: word.id,
      sourceContentFingerprint: sourceContentRevision,
      sourceLanguageCode: "nl",
      targetLanguageCode: "en",
      word,
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
    normalizeDictionaryContent(accessibleWord as any),
  ),
  source_fingerprint: translationFingerprint(accessibleWord),
  translation_policy_version: ordinaryTranslationPolicyVersion("openai"),
  provider_revision: "prompt-fingerprint",
  updated_at: new Date().toISOString(),
});

const queryChain = (result: { data?: unknown; error?: unknown }) => {
  const query: any = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    update: vi.fn(() => query),
    maybeSingle: vi.fn(async () => result),
    then: (resolve: any, reject: any) =>
      Promise.resolve(result).then(resolve, reject),
  };
  return query;
};

describe("/api/translation", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    process.env.SUPABASE_SECRET_KEY = "service-key";
    delete process.env.PLATFORM_PRINCIPAL_TEST_LOOKUP;
    getUser.mockReset();
    rpc.mockReset();
    from.mockReset();
    createClient.mockReset();
    translateDictionaryMeaning.mockReset();
    createTranslator.mockReset();
    createTranslator.mockReturnValue({
      provider: "openai",
      translator: {
        translate: vi.fn(async () => []),
        translateText: vi.fn(async () => ({ translations: [], meta: {} })),
        translateDictionaryMeaning,
      },
    });
  });

  test("requires a bearer token before reading translation state", async () => {
    const { GET } = await import("@/app/api/translation/route");

    const response = await GET(request());

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "missing_bearer_token",
    });
    expect(createClient).not.toHaveBeenCalled();
  });

  test("rejects invalid target language metadata before provider work", async () => {
    const { GET } = await import("@/app/api/translation/route");
    const invalidRequest = new NextRequest(
      "http://localhost/api/translation?word_id=00000000-0000-4000-8000-000000000001&lang=ru%3Bignore",
      { headers: { authorization: "Bearer token-1" } },
    );

    const response = await GET(invalidRequest);

    expect(response.status).toBe(400);
    expect(createClient).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
    expect(translateDictionaryMeaning).not.toHaveBeenCalled();
  });

  test("normalizes translator construction failures in the legacy response", async () => {
    const providerSecret = "configuration-error-with-secret-token";
    createTranslator.mockImplementationOnce(() => {
      throw new Error(providerSecret);
    });
    getUser.mockResolvedValueOnce({
      data: { user: { id: "user-1" } },
      error: null,
    });
    rpc.mockResolvedValueOnce({ data: accessibleWord, error: null });
    createClient.mockReturnValueOnce({ auth: { getUser }, rpc });

    const { GET } = await import("@/app/api/translation/route");
    const response = await GET(request("token-1"));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(JSON.stringify(body)).not.toContain(providerSecret);
    expect(body.error).toMatch(/^provider_unknown_error:[a-f0-9]{24}$/);
  });

  test("does not require connected-client principal schema for first-party translation", async () => {
    process.env.PLATFORM_PRINCIPAL_TEST_LOOKUP = "1";
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
    rpc.mockResolvedValueOnce({ data: accessibleWord, error: null });
    from.mockImplementation((table: string) => {
      if (table === "connected_client_sessions") {
        return queryChain({
          data: null,
          error: {
            message:
              "column connected_client_sessions.access_token_expires_at does not exist",
          },
        });
      }
      if (table === "word_entry_translations") {
        return queryChain({
          data: currentPendingTranslation(),
          error: null,
        });
      }
      throw new Error(`unexpected table read: ${table}`);
    });

    const { GET } = await import("@/app/api/translation/route");

    const response = await GET(request("token-1"));

    expect(response.status).toBe(200);
    expect(response.headers.get("x-translation-cache")).toBe("pending");
    expect(from).not.toHaveBeenCalledWith("connected_client_sessions");
    expect(from).toHaveBeenCalledWith("word_entry_translations");
    await expect(response.json()).resolves.toEqual({
      status: "pending",
    });
  });

  test("does not read translation cache when gated source entry is inaccessible", async () => {
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
    rpc.mockResolvedValueOnce({ data: null, error: null });
    from.mockImplementation((table: string) => {
      if (table === "word_entry_translations") {
        return queryChain({ data: null, error: null });
      }
      throw new Error(`unexpected table read: ${table}`);
    });

    const { GET } = await import("@/app/api/translation/route");

    const response = await GET(request("token-1"));

    expect(response.status).toBe(404);
    expect(rpc).toHaveBeenCalledWith("fetch_dictionary_entry_by_id_gated", {
      p_entry_id: "00000000-0000-4000-8000-000000000001",
    });
    expect(from).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalledWith("word_entries");
    await expect(response.json()).resolves.toEqual({
      error: "word_entry_not_found",
    });
  });

  test("reads translation cache only after gated source access succeeds", async () => {
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
    rpc.mockResolvedValueOnce({ data: accessibleWord, error: null });
    from.mockImplementation((table: string) => {
      if (table === "word_entry_translations") {
        return queryChain({
          data: currentPendingTranslation(),
          error: null,
        });
      }
      throw new Error(`unexpected table read: ${table}`);
    });

    const { GET } = await import("@/app/api/translation/route");

    const response = await GET(request("token-1"));

    expect(response.status).toBe(200);
    expect(from).toHaveBeenCalledWith("word_entry_translations");
    expect(rpc.mock.invocationCallOrder[0]).toBeLessThan(
      from.mock.invocationCallOrder[0],
    );
    await expect(response.json()).resolves.toEqual({
      status: "pending",
    });
  });

  test("debug responses do not expose service key fragments", async () => {
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
    rpc.mockResolvedValueOnce({
      data: {
        id: "00000000-0000-4000-8000-000000000001",
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
          data: null,
          error: { message: "cache read failed" },
        });
      }
      throw new Error(`unexpected table read: ${table}`);
    });

    const { GET } = await import("@/app/api/translation/route");

    const response = await GET(request("token-1", "&debug=1"));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(JSON.stringify(body)).not.toContain("service-key");
    expect(JSON.stringify(body)).not.toContain("serviceKeyPrefix");
    expect(body).toEqual({
      error: "cache read failed",
      debug: expect.objectContaining({
        dbLang: "en",
        targetLang: "en",
        provider: "openai",
      }),
    });
  });

  test("stores a sense-aware artifact with generated alternatives", async () => {
    const userClient = { auth: { getUser }, rpc };
    const serviceClient = { from };
    createClient
      .mockReturnValueOnce(userClient)
      .mockReturnValueOnce(serviceClient);
    getUser.mockResolvedValueOnce({
      data: { user: { id: "user-1" } },
      error: null,
    });
    rpc.mockResolvedValueOnce({ data: accessibleWord, error: null });
    translateDictionaryMeaning.mockResolvedValueOnce({
      entryTranslation: {
        primaryText: "дом",
        alternativeTexts: ["жилище"],
        baseText: "дом",
        note: null,
      },
      contentTranslations: [
        { fieldId: "definition", text: "жилое помещение" },
      ],
      meta: {
        providerUsed: "openai",
        usedFallback: true,
        primaryFailure: {
          code: "provider_http_error",
          fingerprint: "0123456789abcdef01234567",
        },
        primaryError: "legacy-provider-secret-must-not-persist",
      },
    });

    const stalePending = {
      ...currentPendingTranslation(),
      updated_at: "2020-01-01T00:00:00.000Z",
    };
    const lookupChain = queryChain({ data: stalePending, error: null });
    const claimChain = queryChain({
      data: { word_entry_id: accessibleWord.id },
      error: null,
    });
    const readyChain = queryChain({ data: null, error: null });
    from
      .mockReturnValueOnce(lookupChain)
      .mockReturnValueOnce(claimChain)
      .mockReturnValueOnce(readyChain);

    const { GET } = await import("@/app/api/translation/route");
    const response = await GET(request("token-1"));

    expect(response.status).toBe(200);
    expect(translateDictionaryMeaning).toHaveBeenCalledWith(
      expect.objectContaining({
        contractVersion: "dictionary-meaning-translation-v1",
        entryId: accessibleWord.id,
        headword: expect.objectContaining({ text: "huis" }),
        content: [
          expect.objectContaining({
            fieldId: "definition",
            role: "definition",
            text: "woning",
          }),
        ],
      }),
    );
    expect(readyChain.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "ready",
        overlay: expect.objectContaining({
          headword: "дом",
          entryTranslation: {
            primaryText: "дом",
            alternativeTexts: ["жилище"],
            baseText: "дом",
            note: null,
          },
          __meta: expect.objectContaining({
            usedFallback: true,
            primaryFailure: {
              code: "provider_http_error",
              fingerprint: "0123456789abcdef01234567",
            },
          }),
        }),
      }),
    );
    expect(JSON.stringify(readyChain.update.mock.calls)).not.toContain(
      "legacy-provider-secret-must-not-persist",
    );
    expect(readyChain.eq).toHaveBeenCalledWith(
      "source_fingerprint",
      translationFingerprint(accessibleWord),
    );
    await expect(response.json()).resolves.toMatchObject({
      status: "ready",
      overlay: {
        headword: "дом",
        entryTranslation: {
          primaryText: "дом",
          alternativeTexts: ["жилище"],
          baseText: "дом",
          note: null,
        },
      },
    });
  });

  test("removes legacy raw provider errors from cached responses", async () => {
    const providerSecret = "legacy-provider-body-with-token";
    const userClient = { auth: { getUser }, rpc };
    const serviceClient = { from };
    createClient
      .mockReturnValueOnce(userClient)
      .mockReturnValueOnce(serviceClient);
    getUser.mockResolvedValueOnce({
      data: { user: { id: "user-1" } },
      error: null,
    });
    rpc.mockResolvedValueOnce({ data: accessibleWord, error: null });
    from.mockReturnValueOnce(
      queryChain({
        data: {
          ...currentPendingTranslation(),
          status: "ready",
          overlay: {
            headword: "house",
            __meta: {
              providerUsed: "openai",
              usedFallback: true,
              primaryError: providerSecret,
            },
          },
        },
        error: null,
      }),
    );

    const { GET } = await import("@/app/api/translation/route");
    const response = await GET(request("token-1"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(JSON.stringify(body)).not.toContain(providerSecret);
    expect(body.overlay.__meta).toEqual({
      providerUsed: "openai",
      usedFallback: true,
    });
  });

  test("reclaims a v1 idiom-only artifact even when examples exhaust the bounded payload", async () => {
    const idiomOnlyWord = {
      ...accessibleWord,
      headword: "goed",
      raw: {
        meanings: [
          {
            definition: "",
            examples: Array.from({ length: 40 }, (_, index) =>
              `standalone example ${index} ${"x".repeat(600)}`,
            ),
            idioms: [
              {
                expression: "zich te goed doen aan iets",
                explanation: "iets lekker opeten of opdrinken",
                examples: ["de kat deed zich te goed aan de kaas"],
              },
            ],
          },
        ],
      },
    };
    const userClient = { auth: { getUser }, rpc };
    const serviceClient = { from };
    createClient
      .mockReturnValueOnce(userClient)
      .mockReturnValueOnce(serviceClient);
    getUser.mockResolvedValueOnce({
      data: { user: { id: "user-1" } },
      error: null,
    });
    rpc.mockResolvedValueOnce({ data: idiomOnlyWord, error: null });
    translateDictionaryMeaning.mockImplementationOnce(async (meaningRequest) => ({
      entryTranslation: null,
      contentTranslations: meaningRequest.content.map((item: any) => ({
        fieldId: item.fieldId,
        text: "translation",
      })),
      meta: { providerUsed: "openai", usedFallback: false },
    }));
    const existing = {
      ...currentPendingTranslation(),
      status: "ready",
      overlay: { entryTranslation: { primaryText: "goods" } },
      source_content_revision: contentFingerprint(
        normalizeDictionaryContent(idiomOnlyWord as any),
      ),
      source_fingerprint: translationFingerprint(idiomOnlyWord),
      translation_policy_version: ordinaryTranslationPolicyVersion("openai"),
    };
    const lookupChain = queryChain({ data: existing, error: null });
    const claimChain = queryChain({
      data: { word_entry_id: idiomOnlyWord.id },
      error: null,
    });
    const readyChain = queryChain({ data: null, error: null });
    from
      .mockReturnValueOnce(lookupChain)
      .mockReturnValueOnce(claimChain)
      .mockReturnValueOnce(readyChain);

    const { GET } = await import("@/app/api/translation/route");
    const response = await GET(request("token-1"));

    expect(response.status).toBe(200);
    expect(translateDictionaryMeaning).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.arrayContaining([
          expect.objectContaining({ fieldId: "idiom:0", role: "idiom" }),
          expect.objectContaining({
            fieldId: "idiom:0:explanation",
            role: "idiom-explanation",
          }),
          expect.objectContaining({
            fieldId: "idiom:0:example:0",
            role: "example",
          }),
        ]),
      }),
    );
    expect(claimChain.update).toHaveBeenCalledWith(
      expect.objectContaining({
        translation_policy_version: expect.stringContaining(
          IDIOM_ONLY_TRANSLATION_PIPELINE_VERSION,
        ),
      }),
    );
  });

  test.each(["pending", "ready"])(
    "invalidates a fresh %s artifact when only the usage note changes",
    async (status) => {
      const oldWord = {
        ...accessibleWord,
        raw: {
          meanings: [{ definition: "woning", note: "oude toelichting" }],
        },
      };
      const changedWord = {
        ...accessibleWord,
        raw: {
          meanings: [{ definition: "woning", note: "nieuwe toelichting" }],
        },
      };
      const userClient = { auth: { getUser }, rpc };
      const serviceClient = { from };
      createClient
        .mockReturnValueOnce(userClient)
        .mockReturnValueOnce(serviceClient);
      getUser.mockResolvedValueOnce({
        data: { user: { id: "user-1" } },
        error: null,
      });
      rpc.mockResolvedValueOnce({ data: changedWord, error: null });
      translateDictionaryMeaning.mockResolvedValueOnce({
        entryTranslation: {
          primaryText: "house",
          alternativeTexts: [],
          baseText: "house",
          note: null,
        },
        contentTranslations: [
          { fieldId: "definition", text: "dwelling" },
          { fieldId: "usage-note", text: "new explanation" },
        ],
        meta: { providerUsed: "openai", usedFallback: false },
      });
      const existing = {
        ...currentPendingTranslation(),
        status,
        overlay:
          status === "ready"
            ? { headword: "house", meanings: [{ definition: "dwelling" }] }
            : null,
        source_fingerprint: translationFingerprint(oldWord),
        updated_at: new Date().toISOString(),
      };
      const lookupChain = queryChain({ data: existing, error: null });
      const claimChain = queryChain({
        data: { word_entry_id: accessibleWord.id },
        error: null,
      });
      const readyChain = queryChain({ data: null, error: null });
      from
        .mockReturnValueOnce(lookupChain)
        .mockReturnValueOnce(claimChain)
        .mockReturnValueOnce(readyChain);

      const { GET } = await import("@/app/api/translation/route");
      const response = await GET(request("token-1"));

      expect(response.status).toBe(200);
      expect(response.headers.get("x-translation-cache")).toBe("provider");
      expect(translateDictionaryMeaning).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.arrayContaining([
            expect.objectContaining({
              fieldId: "usage-note",
              text: "nieuwe toelichting",
            }),
          ]),
        }),
      );
    },
  );

  test("classifies a provider failure as provider work", async () => {
    const providerSecret = "provider-body-with-private-card-and-token";
    const userClient = { auth: { getUser }, rpc };
    const serviceClient = { from };
    createClient
      .mockReturnValueOnce(userClient)
      .mockReturnValueOnce(serviceClient);
    getUser.mockResolvedValueOnce({
      data: { user: { id: "user-1" } },
      error: null,
    });
    rpc.mockResolvedValueOnce({ data: accessibleWord, error: null });
    translateDictionaryMeaning.mockRejectedValueOnce(
      new Error(providerSecret),
    );
    const stalePending = {
      ...currentPendingTranslation(),
      updated_at: "2020-01-01T00:00:00.000Z",
    };
    from
      .mockReturnValueOnce(queryChain({ data: stalePending, error: null }))
      .mockReturnValueOnce(
        queryChain({
          data: { word_entry_id: accessibleWord.id },
          error: null,
        }),
      )
      .mockReturnValueOnce(queryChain({ data: null, error: null }));

    const { GET } = await import("@/app/api/translation/route");
    const response = await GET(request("token-1"));

    expect(response.status).toBe(502);
    expect(response.headers.get("x-translation-cache")).toBe("provider");
    const body = await response.json();
    expect(JSON.stringify(body)).not.toContain(providerSecret);
    const failedUpdateChain = from.mock.results.at(-1)?.value;
    const failedWrite = failedUpdateChain.update.mock.calls[0]?.[0];
    expect(JSON.stringify(failedWrite)).not.toContain(providerSecret);
    expect(failedWrite).toMatchObject({
      error_message: expect.stringMatching(
        /^provider_unknown_error:[a-f0-9]{24}$/,
      ),
    });
    expect(failedUpdateChain.eq).toHaveBeenCalledWith(
      "source_fingerprint",
      translationFingerprint(accessibleWord),
    );
  });
});
