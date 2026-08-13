import { beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  contentFingerprint,
  normalizeDictionaryContent,
} from "@/lib/platform/projections/dictionaryContent";
import { translationPolicyVersion } from "@/lib/translation/translationPolicy";

const getUser = vi.fn();
const rpc = vi.fn();
const from = vi.fn();
const createClient = vi.fn();
const translateDictionaryMeaning = vi.hoisted(() => vi.fn());

vi.mock("@supabase/supabase-js", () => ({
  createClient,
}));

vi.mock("@/lib/translation/translationProvider", () => ({
  createTranslator: vi.fn(() => ({
    provider: "openai",
    translator: {
      translate: vi.fn(async () => []),
      translateDictionaryMeaning,
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

const currentPendingTranslation = () => ({
  status: "pending",
  overlay: null,
  note: null,
  source_content_revision: contentFingerprint(
    normalizeDictionaryContent(accessibleWord as any),
  ),
  translation_policy_version: translationPolicyVersion("openai"),
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
        usedFallback: false,
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
        }),
      }),
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
});
