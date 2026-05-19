import { beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";

const getUser = vi.fn();
const rpc = vi.fn();
const from = vi.fn();
const createClient = vi.fn();

vi.mock("@supabase/supabase-js", () => ({
  createClient,
}));

vi.mock("@/lib/translation/translationProvider", () => ({
  createTranslator: vi.fn(() => ({
    provider: "openai",
    translator: { translate: vi.fn(async () => []) },
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

const request = (token?: string) =>
  new NextRequest(
    "http://localhost/api/translation?word_id=00000000-0000-4000-8000-000000000001&lang=en",
    {
      headers: token ? { authorization: `Bearer ${token}` } : {},
    },
  );

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
    getUser.mockReset();
    rpc.mockReset();
    from.mockReset();
    createClient.mockReset();
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

  test("reads source entries through gated RPC instead of word_entries", async () => {
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

    expect(response.status).toBe(500);
    expect(rpc).toHaveBeenCalledWith("fetch_dictionary_entry_by_id_gated", {
      p_entry_id: "00000000-0000-4000-8000-000000000001",
    });
    expect(from).toHaveBeenCalledWith("word_entry_translations");
    expect(from).not.toHaveBeenCalledWith("word_entries");
    await expect(response.json()).resolves.toEqual({
      status: "failed",
      error: "word_entries.raw not found",
    });
  });
});
