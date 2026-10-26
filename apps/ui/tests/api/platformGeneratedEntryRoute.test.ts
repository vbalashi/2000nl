import { beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";

const rpc = vi.fn();
const from = vi.fn();
const getUser = vi.fn();
const fetchMock = vi.fn();
const translationUpsert = vi.fn();
const createClient = vi.fn(() => ({
  auth: { getUser },
  rpc,
  from,
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient,
}));

vi.stubGlobal("fetch", fetchMock);

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
    process.env.OPENAI_API_KEY = "openai-key";
    process.env.OPENAI_MODEL = "gpt-test";
    delete process.env.AZURE_OPENAI_API_KEY;
    delete process.env.AZURE_OPENAI_ENDPOINT;
    delete process.env.AZURE_OPENAI_DEPLOYMENT;
    delete process.env.AZURE_OPENAI_MODEL;
    delete process.env.PLATFORM_PRINCIPAL_TEST_LOOKUP;
    createClient.mockClear();
    getUser.mockReset();
    rpc.mockReset();
    from.mockReset();
    fetchMock.mockReset();
    translationUpsert.mockReset();
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
        draftSetId: "gds-1",
        candidateId: "gdc-1",
        revision: 1,
        item: {
          entry: {
            contentFingerprint: "fingerprint-1",
            content: {
              headword: "gedoe",
              languageCode: "nl",
              partOfSpeech: "zn",
              sections: [
                {
                  id: "meaning-1",
                  kind: "meaning",
                  text: "Een situatie die veel moeite of ongemak geeft.",
                },
                {
                  id: "example-1",
                  kind: "example",
                  text: "Wat een gedoe.",
                },
              ],
              summary: {
                definition: "Een situatie die veel moeite of ongemak geeft.",
                example: "Wat een gedoe.",
              },
            },
          },
          generation: {
            provider: "openai",
            model: "gpt-test",
            promptVersion: "generated-user-entry-v1",
          },
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
        partOfSpeech: "zn",
        tags: ["generated"],
        generation: expect.objectContaining({
          kind: "llm",
          draftSetId: "gds-1",
          candidateId: "gdc-1",
          revision: 1,
          provider: "openai",
          model: "gpt-test",
          promptVersion: "generated-user-entry-v1",
          contentFingerprint: "fingerprint-1",
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
          draftSetId: "gds-1",
          candidateId: "gdc-1",
          revision: 1,
          requiresExplicitStartLearning: true,
        },
        nextActions: ["start-learning"],
      }),
    );
  });

  test("stores a ready draft translation overlay for the persisted generated entry", async () => {
    const { POST } = await import(
      "@/app/api/platform/v1/user-dictionary/generated-entry/route"
    );
    mockAuthenticatedUser();
    mockConnectedClientPrincipal(["platform:read", "platform:write"]);
    translationUpsert.mockResolvedValueOnce({ error: null });
    from.mockImplementation((table: string) => {
      if (table === "word_entry_translations") {
        return { upsert: translationUpsert };
      }
      if (table === "connected_client_sessions") {
        return chain({
          data: {
            id: "session-1",
            client_id: "audiofilms_chrome",
            user_id: "user-1",
            scopes: ["platform:read", "platform:write"],
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
        return chain({
          data: { scopes: ["platform:read", "platform:write"], revoked_at: null },
          error: null,
        });
      }
      return chain({ data: null, error: null });
    });
    rpc.mockResolvedValueOnce({ data: "entry-generated-1", error: null });

    const response = await POST(
      request({
        clickedForm: "gedoe",
        languageCode: "nl",
        contextText: "Wat een gedoe.",
        draftSetId: "gds-1",
        candidateId: "gdc-1",
        revision: 1,
        draftTranslation: {
          targetLang: "ru",
          status: "ready",
          overlay: {
            headword: "хлопоты",
            meanings: [{ definition: "ситуация с лишними усилиями" }],
          },
          note: "Context note",
          translationPolicyVersion: "platform-generated-draft-translation-v1",
        },
        item: {
          entry: {
            contentFingerprint: "fingerprint-1",
            content: {
              headword: "gedoe",
              languageCode: "nl",
              summary: { definition: "Een hoop onhandige moeite." },
              sections: [
                {
                  id: "meaning-1",
                  kind: "meaning",
                  text: "Een hoop onhandige moeite.",
                },
              ],
            },
          },
          generation: {
            provider: "openai",
            model: "gpt-test",
            promptVersion: "generated-user-entry-v1",
          },
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(translationUpsert).toHaveBeenCalledWith(
      {
        word_entry_id: "entry-generated-1",
        target_lang: "ru",
        provider: "openai",
        status: "ready",
        overlay: {
          headword: "хлопоты",
          meanings: [{ definition: "ситуация с лишними усилиями" }],
        },
        note: "Context note",
        source_fingerprint: "platform-generated-draft-translation-v1",
        error_message: null,
        updated_at: expect.any(String),
      },
      { onConflict: "word_entry_id,target_lang,provider" },
    );
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        ok: true,
        entryId: "entry-generated-1",
        generation: expect.objectContaining({
          draftTranslationCache: {
            status: "stored",
            targetLang: "ru",
            provider: "openai",
          },
        }),
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
        draftSetId: "gds-duplicate",
        candidateId: "gdc-duplicate",
        revision: 1,
        item: {
          entry: {
            content: {
              headword: "gedoe",
              languageCode: "nl",
              summary: { definition: "Een hoop onhandige moeite." },
              sections: [
                {
                  id: "meaning-1",
                  kind: "meaning",
                  text: "Een hoop onhandige moeite.",
                },
              ],
            },
          },
        },
      }),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "duplicate_user_entry",
      detail: "duplicate_user_entry",
    });
  });

  test("rejects generated saves without selected draft candidate identity", async () => {
    const { POST } = await import(
      "@/app/api/platform/v1/user-dictionary/generated-entry/route"
    );
    mockAuthenticatedUser();
    mockConnectedClientPrincipal(["platform:read", "platform:write"]);

    const response = await POST(
      request({
        clickedForm: "gedoe",
        languageCode: "nl",
        generated: { definition: "Een hoop onhandige moeite." },
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "missing_draft_candidate",
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  test("drafts generated entries through the provider without DB mutation", async () => {
    const { POST } = await import(
      "@/app/api/platform/v1/user-dictionary/generated-entry/draft/route"
    );
    mockAuthenticatedUser();
    mockConnectedClientPrincipal(["platform:read", "platform:write"]);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                definition: "Een situatie die veel moeite of ongemak geeft.",
                example: "Wat een gedoe met die tickets.",
                partOfSpeech: "zn",
                notes: "Informeel en vaak licht negatief.",
              }),
            },
          },
        ],
      }),
    });

    const response = await POST(
      request({
        clickedForm: "gedoe",
        languageCode: "nl",
        contextText: "Wat een gedoe.",
      }),
    );

    expect(response.status).toBe(200);
    expect(rpc).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.openai.com/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          authorization: "Bearer openai-key",
        }),
      }),
    );
    const payload = await response.json();
    expect(payload).toEqual(
      expect.objectContaining({
        ok: true,
        draft: expect.objectContaining({
          draftSetId: expect.any(String),
          candidateId: expect.any(String),
          revision: 1,
          clickedForm: "gedoe",
          languageCode: "nl",
          contextText: "Wat een gedoe.",
          item: expect.objectContaining({
            draftSetId: expect.any(String),
            candidateId: expect.any(String),
            revision: 1,
            entry: expect.objectContaining({
              id: expect.stringMatching(/^draft:/),
              languageCode: "nl",
              headword: "gedoe",
              content: expect.objectContaining({
                headword: "gedoe",
                languageCode: "nl",
                partOfSpeech: "zn",
                sections: expect.arrayContaining([
                  expect.objectContaining({
                    kind: "meaning",
                    text: "Een situatie die veel moeite of ongemak geeft.",
                  }),
                  expect.objectContaining({
                    kind: "example",
                    text: "Wat een gedoe met die tickets.",
                  }),
                  expect.objectContaining({
                    kind: "note",
                    text: "Informeel en vaak licht negatief.",
                  }),
                ]),
                summary: {
                  definition: "Een situatie die veel moeite of ongemak geeft.",
                  example: "Wat een gedoe met die tickets.",
                },
              }),
              contentFingerprint: expect.any(String),
              isGeneratedDraft: true,
            }),
            cardCapabilitiesByType: {
              "word-to-definition": {
                phase: "draft",
                actions: ["save-and-start-learning"],
              },
            },
            availableActions: ["save-and-start-learning"],
            generation: expect.objectContaining({
              status: "draft",
              provider: "openai",
              model: "gpt-test",
              promptVersion: "generated-user-entry-v1",
              contentFingerprint: expect.any(String),
              requiresExplicitSave: true,
            }),
          }),
        }),
        generation: {
          status: "draft",
          provider: "openai",
          model: "gpt-test",
          promptVersion: "generated-user-entry-v1",
          contentFingerprint: expect.any(String),
          requiresExplicitSave: true,
        },
        nextActions: ["save-and-start-learning"],
      }),
    );
  });

  test("keeps regenerated candidates in the requested draft set", async () => {
    const { POST } = await import(
      "@/app/api/platform/v1/user-dictionary/generated-entry/draft/route"
    );
    mockAuthenticatedUser();
    mockConnectedClientPrincipal(["platform:read", "platform:write"]);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                definition: "Een tweede kaart voor dezelfde context.",
                example: "Dat was weer gedoe.",
              }),
            },
          },
        ],
      }),
    });

    const response = await POST(
      request({
        draftSetId: "gds_existing",
        clickedForm: "gedoe",
        languageCode: "nl",
        contextText: "Wat een gedoe.",
      }),
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.draft).toEqual(
      expect.objectContaining({
        draftSetId: "gds_existing",
        candidateId: expect.stringMatching(/^gdc_/),
        revision: 1,
      }),
    );
    expect(payload.draft.item).toEqual(
      expect.objectContaining({
        draftSetId: "gds_existing",
        candidateId: payload.draft.candidateId,
      }),
    );
  });

  test("requires context text for generated draft sense disambiguation", async () => {
    const { POST } = await import(
      "@/app/api/platform/v1/user-dictionary/generated-entry/draft/route"
    );
    mockAuthenticatedUser();
    mockConnectedClientPrincipal(["platform:read", "platform:write"]);

    const response = await POST(
      request({
        clickedForm: "gedoe",
        languageCode: "nl",
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "missing_context_text",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("draft generation fails closed when provider config is missing", async () => {
    const { POST } = await import(
      "@/app/api/platform/v1/user-dictionary/generated-entry/draft/route"
    );
    delete process.env.OPENAI_API_KEY;
    mockAuthenticatedUser();

    const response = await POST(
      request({
        clickedForm: "gedoe",
        languageCode: "nl",
        contextText: "Wat een gedoe.",
      }),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "generated_entry_provider_not_configured",
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });
});
