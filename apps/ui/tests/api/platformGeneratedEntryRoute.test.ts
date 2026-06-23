import { beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";

const rpc = vi.fn();
const from = vi.fn();
const getUser = vi.fn();
const createClient = vi.fn(() => ({
  auth: { getUser },
  rpc,
  from,
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient,
}));

const chain = (result: { data?: any; error?: any }) => {
  const query: any = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    maybeSingle: vi.fn(async () => result),
    then: (resolve: any, reject: any) =>
      Promise.resolve(result).then(resolve, reject),
  };
  return query;
};

const request = (body: unknown, token = "token-1") =>
  new NextRequest(
    "http://localhost/api/platform/v1/user-dictionary/generated-entry",
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        origin: "chrome-extension://abc",
      },
      body: JSON.stringify(body),
    },
  );

function mockAuthenticatedUser() {
  getUser.mockResolvedValueOnce({
    data: { user: { id: "user-1" } },
    error: null,
  });
}

function mockConnectedClientPrincipal(scopes: string[]) {
  process.env.PLATFORM_PRINCIPAL_TEST_LOOKUP = "1";
  from.mockImplementation((table: string) => {
    if (table === "connected_client_sessions") {
      return chain({
        data: {
          id: "session-1",
          client_id: "audiofilms_chrome",
          user_id: "user-1",
          scopes,
          revoked_at: null,
          access_token_expires_at: new Date(Date.now() + 60_000).toISOString(),
        },
        error: null,
      });
    }
    if (table === "connected_clients") {
      return chain({
        data: { client_id: "audiofilms_chrome", status: "active" },
        error: null,
      });
    }
    if (table === "connected_client_grants") {
      return chain({ data: { scopes, revoked_at: null }, error: null });
    }
    return chain({ data: null, error: null });
  });
}

describe("/api/platform/v1/user-dictionary/generated-entry", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
    process.env.PLATFORM_API_ALLOWED_ORIGINS = "chrome-extension://abc";
    delete process.env.PLATFORM_PRINCIPAL_TEST_LOOKUP;
    createClient.mockClear();
    getUser.mockReset();
    rpc.mockReset();
    from.mockReset();
    from.mockImplementation(() => chain({ data: null, error: null }));
  });

  test("requires bearer auth", async () => {
    const { POST } = await import(
      "@/app/api/platform/v1/user-dictionary/generated-entry/route"
    );

    const response = await POST(
      new NextRequest(
        "http://localhost/api/platform/v1/user-dictionary/generated-entry",
        {
          method: "POST",
          body: JSON.stringify({ clickedForm: "gedoe" }),
        },
      ),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "missing_bearer_token",
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  test("rejects connected clients without platform write scope", async () => {
    const { POST } = await import(
      "@/app/api/platform/v1/user-dictionary/generated-entry/route"
    );
    mockAuthenticatedUser();
    mockConnectedClientPrincipal(["platform:read"]);

    const response = await POST(
      request({
        clickedForm: "gedoe",
        languageCode: "nl",
        generated: { definition: "Een hoop onhandige moeite." },
      }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "insufficient_scope",
      requiredScope: "platform:write",
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  test("persists generated user entries with generation metadata", async () => {
    const { POST } = await import(
      "@/app/api/platform/v1/user-dictionary/generated-entry/route"
    );
    mockAuthenticatedUser();
    mockConnectedClientPrincipal(["platform:read", "platform:write"]);
    rpc.mockResolvedValueOnce({ data: "entry-generated-1", error: null });

    const response = await POST(
      request({
        clickedForm: "gedoe",
        languageCode: "nl",
        contextText: "Wat een gedoe.",
        sourceContext: {
          contractVersion: "source-context-v2",
          source: {
            kind: "youtube_video",
            provider: "youtube",
            externalId: "abcDEF12345",
            languageCode: "nl",
          },
          artifact: {
            artifactKind: "caption_phrase_set",
            producer: "audiofilms",
            languageCode: "nl",
          },
          location: {
            kind: "caption_phrase",
            startMs: 1000,
            endMs: 2000,
            phraseIndex: 0,
          },
          selection: {
            clickedForm: "gedoe",
            contextText: "Wat een gedoe.",
            charStart: 8,
            charEnd: 13,
          },
        },
        generated: {
          definition: "Een situatie die veel moeite of ongemak geeft.",
          example: { source: "Wat een gedoe." },
          partOfSpeech: "noun",
          provider: "openai",
          model: "gpt-test",
          promptVersion: "generated-user-entry-v1",
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("create_user_dictionary_entry", {
      p_user_id: "user-1",
      p_dictionary_id: null,
      p_entry: expect.objectContaining({
        headword: "gedoe",
        languageCode: "nl",
        definition: "Een situatie die veel moeite of ongemak geeft.",
        example: { source: "Wat een gedoe." },
        partOfSpeech: "noun",
        tags: ["generated"],
        generation: expect.objectContaining({
          kind: "llm",
          provider: "openai",
          model: "gpt-test",
          promptVersion: "generated-user-entry-v1",
          generatedAt: expect.any(String),
          source: expect.objectContaining({
            clickedForm: "gedoe",
            languageCode: "nl",
            contextText: "Wat een gedoe.",
            connectedClientId: "audiofilms_chrome",
            sourceContextVersion: "v2",
            sourceContext: expect.objectContaining({
              contractVersion: "source-context-v2",
            }),
          }),
        }),
      }),
    });
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        ok: true,
        entryId: "entry-generated-1",
        generation: {
          status: "persisted",
          requiresExplicitStartLearning: true,
        },
        nextActions: ["start-learning"],
      }),
    );
  });

  test("maps duplicate generated entries to conflict responses", async () => {
    const { POST } = await import(
      "@/app/api/platform/v1/user-dictionary/generated-entry/route"
    );
    mockAuthenticatedUser();
    rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "duplicate_user_entry" },
    });

    const response = await POST(
      request({
        clickedForm: "gedoe",
        languageCode: "nl",
        generated: { definition: "Een hoop onhandige moeite." },
      }),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "duplicate_user_entry",
      detail: "duplicate_user_entry",
    });
  });
});
