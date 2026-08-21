import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  contentFingerprint,
  normalizeDictionaryContent,
} from "@/lib/platform/projections/dictionaryContent";
import { ordinaryTranslationPolicyVersion } from "@/lib/translation/translationPolicy";

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

const chain = (result: { data?: unknown; error?: unknown }) => {
  const query: any = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    in: vi.fn(() => query),
    maybeSingle: vi.fn(async () => result),
    then: (resolve: any, reject: any) =>
      Promise.resolve(result).then(resolve, reject),
  };
  return query;
};

const authenticatedRequest = (body: unknown) =>
  new NextRequest("http://localhost/api/platform/v2/lookup", {
    method: "POST",
    headers: {
      authorization: "Bearer user-token",
      "content-type": "application/json",
      origin: "chrome-extension://abc",
    },
    body: JSON.stringify(body),
  });

const catalogRequest = (body: unknown) =>
  new NextRequest("http://localhost/api/platform/v2/catalog/lookup", {
    method: "POST",
    headers: {
      authorization: "Bearer catalog-token",
      "content-type": "application/json",
      origin: "chrome-extension://abc",
    },
    body: JSON.stringify(body),
  });

describe("/api/platform/v2/lookup", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
    process.env.PLATFORM_CATALOG_ACCESS_TOKEN = "catalog-token";
    process.env.TRANSLATION_PROVIDER = "openai";
    process.env.PLATFORM_API_ALLOWED_ORIGINS = "chrome-extension://abc";
    process.env.PLATFORM_V2_LOOKUP_ENABLED = "1";
    process.env.PLATFORM_V2_ACTIONS_ENABLED = "1";
    delete process.env.PLATFORM_PRINCIPAL_TEST_LOOKUP;
    createClient.mockClear();
    getUser.mockReset();
    rpc.mockReset();
    from.mockReset();
    from.mockImplementation(() => chain({ data: null, error: null }));
  });

  test("keeps Platform V2 lookup unavailable until the corpus readiness gate is enabled", async () => {
    delete process.env.PLATFORM_V2_LOOKUP_ENABLED;
    const { POST } = await import("@/app/api/platform/v2/lookup/route");
    getUser.mockResolvedValueOnce({
      data: { user: { id: "user-1" } },
      error: null,
    });

    const response = await POST(
      authenticatedRequest({
        query: "huis",
        cardTypeId: "word-to-definition",
      }),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "platform_v2_lookup_not_enabled",
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  test("returns one semantic SenseCard group without raw or positional identity", async () => {
    const { POST } = await import("@/app/api/platform/v2/lookup/route");
    const entry = {
      id: "entry-1",
      dictionary_id: "dict-1",
      language_code: "nl",
      headword: "huis",
      meaning_id: 1,
      part_of_speech: "zn",
      gender: "het",
      is_nt2_2000: true,
      raw: {
        providerOnly: "must-not-leak",
        pronunciation: "huis",
        pronunciation_with_stress: "ˈhuis",
        meanings: [
          {
            definition: "een gebouw om in te wonen",
            examples: ["dit is mijn huis"],
            synonyms: ["woning"],
            usage_labels: ["informeel"],
            note: "Vaak gebruikt voor een woonhuis.",
          },
        ],
      },
      dictionary: {
        id: "dict-1",
        language_code: "nl",
        slug: "nl-vandale",
        name: "Van Dale",
        kind: "curated",
        visibility: "system",
        owner_user_id: null,
        is_editable: false,
        schema_key: "nl-vandale-v2",
        schema_version: 1,
      },
      platform_v2_identity: {
        entryId: "entry-1",
        headwordGroupId: "group-1",
        meaningOrdinal: 1,
        contentNodeBindings: [
          {
            contentNodeId: "node-definition-1",
            sourcePath: "raw.meanings[0].definition",
            kind: "definition",
            parentContentNodeId: null,
            sourceTextFingerprint: "definition-fingerprint-1",
          },
          {
            contentNodeId: "node-example-1",
            sourcePath: "raw.meanings[0].examples[0]",
            kind: "example",
            parentContentNodeId: null,
            sourceTextFingerprint: "example-fingerprint-1",
          },
          {
            contentNodeId: "node-note-1",
            sourcePath: "raw.meanings[0].note",
            kind: "usage-note",
            parentContentNodeId: null,
            sourceTextFingerprint: "note-fingerprint-1",
          },
        ],
      },
    };
    const sourceContentRevision = contentFingerprint(
      normalizeDictionaryContent(entry),
    );
    getUser.mockResolvedValueOnce({
      data: { user: { id: "user-1" } },
      error: null,
    });
    from.mockImplementation((table: string) =>
      table === "word_entry_translations"
        ? chain({
            data: [
              {
                id: "translation-entry-1",
                word_entry_id: "entry-1",
                target_lang: "ru",
                provider: "openai",
                status: "ready",
                overlay: {
                  headword: "дом",
                  __meta: {
                    providerUsed: "deepl",
                    usedFallback: true,
                    primaryFailure: {
                      code: "provider_http_error",
                      fingerprint: "0123456789abcdef01234567",
                    },
                    primaryError: "legacy-provider-secret",
                    unknownMetadata: "must-not-cross-v2",
                  },
                  meanings: [
                    {
                      definition: "здание для проживания",
                      examples: ["это мой дом"],
                    },
                  ],
                },
                source_content_revision: sourceContentRevision,
                translation_policy_version:
                  ordinaryTranslationPolicyVersion("openai"),
                provider_revision: "openai:test",
                error_message: null,
              },
            ],
            error: null,
          })
        : chain({ data: null, error: null }),
    );
    rpc.mockImplementation((name: string, args: any) => {
      if (name === "lookup_platform_v2_entries") {
        expect(args).toEqual({
          p_user_id: "user-1",
          p_catalog: false,
          p_query: "huis",
          p_language_code: "nl",
          p_cursor: null,
          p_group_limit: 10,
          p_group_entry_bound: 50,
        });
        return Promise.resolve({
          data: {
            items: [entry],
            page: {
              selectedTierComplete: true,
              nextGroupCursor: null,
            },
          },
          error: null,
        });
      }
      if (name === "get_platform_v2_card_states_for_entries") {
        expect(args.p_card_type_ids).toEqual(["word-to-definition"]);
        return Promise.resolve({ data: [], error: null });
      }
      return Promise.resolve({ data: null, error: null });
    });

    const response = await POST(
      authenticatedRequest({
        query: " huis ",
        contentLanguageCode: "nl",
        translationTargetLanguageCode: "ru",
        cardTypeId: "word-to-definition",
        intent: "external-click",
      }),
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(JSON.stringify(payload)).not.toContain("legacy-provider-secret");
    expect(JSON.stringify(payload)).not.toContain("unknownMetadata");
    expect(JSON.stringify(payload)).not.toContain("primaryFailure");
    expect(payload).toEqual(
      expect.objectContaining({
        contractVersion: "platform-lookup-v2",
        query: "huis",
        request: {
          contentLanguageCode: "nl",
          translationTargetLanguageCode: "ru",
          cardTypeId: "word-to-definition",
          intent: "external-click",
        },
        page: {
          selectedTierComplete: true,
          nextGroupCursor: null,
        },
      }),
    );
    expect(payload.groups).toHaveLength(1);
    expect(payload.groups[0]).toEqual(
      expect.objectContaining({
        headwordGroupId: "group-1",
        senseCount: 1,
        entryCount: 1,
        header: expect.objectContaining({
          displayPronunciation: "ˈhuis",
          pronunciation: "huis",
          audio: {
            audioId: "group-1:headword:nl",
            actionId: "play-audio",
            contentLanguageCode: "nl",
          },
        }),
      }),
    );
    expect(payload.groups[0].entries[0].card).toEqual(
      expect.objectContaining({
        cardTypeId: "word-to-definition",
        scheduler: expect.objectContaining({ phase: "not-started" }),
      }),
    );
    expect(payload.groups[0].entries[0].translation).toEqual(
      expect.objectContaining({
        translationId: "translation-entry-1",
        status: "ready",
        text: "дом",
        sourceContentFingerprint: sourceContentRevision,
        isFresh: true,
      }),
    );
    expect(payload.groups[0].entries[0].contentNodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          contentNodeId: "node-definition-1",
          translations: [
            expect.objectContaining({
              status: "ready",
              text: "здание для проживания",
              sourceTextFingerprint: "definition-fingerprint-1",
            }),
          ],
        }),
      ]),
    );
    expect(payload.groups[0].entries[0].wordDetails).toEqual(
      expect.objectContaining({
        entryId: "entry-1",
        lexicalRelations: [
          expect.objectContaining({ kind: "synonym", text: "woning" }),
        ],
        labels: [
          expect.objectContaining({
            messageKey: "wordDetails.usageLabel",
            sourceValue: "informeel",
          }),
        ],
        usageNotes: [
          expect.objectContaining({
            text: "Vaak gebruikt voor een woonhuis.",
            contentNodeId: "node-note-1",
          }),
        ],
      }),
    );
    expect(payload.groups[0].entries[0].capabilities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actionId: "start-learning",
          target: expect.objectContaining({
            stateRevision: "untracked",
          }),
        }),
        expect.objectContaining({
          actionId: "mark-known",
          target: expect.objectContaining({
            stateRevision: "untracked",
          }),
        }),
        expect.objectContaining({
          actionId: "report-content",
          target: expect.objectContaining({
            kind: "content-node",
            contentNodeId: "node-definition-1",
          }),
        }),
        expect.objectContaining({
          actionId: "open-word-details",
          target: expect.objectContaining({
            kind: "entry",
            entryId: "entry-1",
          }),
        }),
        expect.objectContaining({
          actionId: "report-content",
          target: expect.objectContaining({
            kind: "translation",
            translationId: "translation-entry-1",
            sourceTextFingerprint: sourceContentRevision,
          }),
        }),
      ]),
    );
    expect(JSON.stringify(payload)).not.toContain("providerOnly");
    expect(JSON.stringify(payload)).not.toContain("sourcePath");
    expect(JSON.stringify(payload)).not.toContain("undo-known");
    expect(rpc).not.toHaveBeenCalledWith(
      "read_platform_v2_presentation_identity",
      expect.anything(),
    );
  });

  test("resolves an authenticated training entry exactly and returns its complete readable group", async () => {
    const { POST } = await import("@/app/api/platform/v2/lookup/route");
    const targetEntryId = "00000000-0000-4000-8000-000000000101";
    const siblingEntryId = "00000000-0000-4000-8000-000000000102";
    const decoyEntryId = "00000000-0000-4000-8000-000000000201";
    const dictionary = {
      id: "dict-1",
      language_code: "nl",
      slug: "nl-vandale",
      name: "Van Dale",
      kind: "curated",
      visibility: "system",
      owner_user_id: null,
      is_editable: false,
      schema_key: "nl-vandale-v2",
      schema_version: 1,
    };
    const entry = (
      id: string,
      meaningId: number,
      definition: string,
      sourceDictionary = dictionary,
    ) => ({
      id,
      dictionary_id: sourceDictionary.id,
      language_code: "nl",
      headword: "bank",
      meaning_id: meaningId,
      part_of_speech: "zn",
      raw: { meanings: [{ definition }] },
      dictionary: sourceDictionary,
      platform_v2_identity: {
        entryId: id,
        headwordGroupId:
          sourceDictionary.id === "dict-2" ? "group-decoy" : "group-target",
        meaningOrdinal: meaningId,
        contentNodeBindings: [
          {
            contentNodeId: `node-${id}`,
            sourcePath: "raw.meanings[0].definition",
            kind: "definition",
            parentContentNodeId: null,
            sourceTextFingerprint: `fingerprint-${id}`,
          },
        ],
      },
    });
    const target = entry(targetEntryId, 1, "zitmeubel");
    const sibling = entry(siblingEntryId, 2, "financiële instelling");

    getUser.mockResolvedValueOnce({
      data: { user: { id: "user-1" } },
      error: null,
    });
    rpc.mockImplementation((name: string, args: any) => {
      if (name === "read_platform_v2_training_group") {
        expect(args).toEqual({
          p_user_id: "user-1",
          p_entry_id: targetEntryId,
          p_group_entry_bound: 50,
        });
        return Promise.resolve({
          data: {
            items: [target, sibling],
            page: {
              selectedTierComplete: true,
              nextGroupCursor: null,
            },
          },
          error: null,
        });
      }
      if (name === "get_platform_v2_card_states_for_entries") {
        return Promise.resolve({ data: [], error: null });
      }
      return Promise.resolve({ data: null, error: null });
    });

    const response = await POST(
      authenticatedRequest({
        entryId: targetEntryId,
        contentLanguageCode: "nl",
        cardTypeId: "word-to-definition",
        intent: "training-review",
      }),
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.query).toBe("bank");
    expect(payload.groups).toHaveLength(1);
    expect(payload.groups[0]).toEqual(
      expect.objectContaining({
        headwordGroupId: "group-target",
        entryCount: 2,
        senseCount: 2,
      }),
    );
    expect(payload.groups[0].entries.map((item: any) => item.entryId)).toEqual([
      targetEntryId,
      siblingEntryId,
    ]);
    expect(JSON.stringify(payload)).not.toContain(decoyEntryId);
    expect(JSON.stringify(payload)).not.toContain("dict-2");
    expect(rpc).not.toHaveBeenCalledWith(
      "lookup_platform_v2_entries",
      expect.anything(),
    );
    expect(rpc).not.toHaveBeenCalledWith(
      "read_platform_v2_presentation_identity",
      expect.anything(),
    );
  });

  test("returns a stable error when the direct exact-group RPC fails", async () => {
    const { POST } = await import("@/app/api/platform/v2/lookup/route");
    const targetEntryId = "00000000-0000-4000-8000-000000000501";
    getUser.mockResolvedValueOnce({
      data: { user: { id: "user-1" } },
      error: null,
    });
    rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "private database detail" },
    });

    const response = await POST(
      authenticatedRequest({
        entryId: targetEntryId,
        cardTypeId: "word-to-definition",
        intent: "training-review",
      }),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "exact_group_lookup_failed",
    });
  });

  test("overlaps exact-group user state and translation reads once atomic identity is available", async () => {
    vi.useFakeTimers();
    const { POST } = await import("@/app/api/platform/v2/lookup/route");
    const targetEntryId = "00000000-0000-4000-8000-000000000701";
    const stateStarted = vi.fn();
    const translationsStarted = vi.fn();
    const dictionary = {
      id: "dict-1",
      language_code: "nl",
      slug: "nl-vandale",
      name: "Van Dale",
      kind: "curated",
      visibility: "system",
      owner_user_id: null,
      is_editable: false,
      schema_key: "nl-vandale-v2",
      schema_version: 1,
    };
    const entry = {
      id: targetEntryId,
      dictionary_id: dictionary.id,
      language_code: "nl",
      headword: "huis",
      meaning_id: 1,
      part_of_speech: "zn",
      raw: { meanings: [{ definition: "een gebouw om in te wonen" }] },
      dictionary,
      platform_v2_identity: {
        entryId: targetEntryId,
        headwordGroupId: "group-target",
        meaningOrdinal: 1,
        contentNodeBindings: [
          {
            contentNodeId: "node-definition",
            sourcePath: "raw.meanings[0].definition",
            kind: "definition",
            parentContentNodeId: null,
            sourceTextFingerprint: "definition-fingerprint",
          },
        ],
      },
    };
    getUser.mockResolvedValueOnce({
      data: { user: { id: "user-1" } },
      error: null,
    });
    rpc.mockImplementation((name: string) => {
      if (name === "read_platform_v2_training_group") {
        return Promise.resolve({
          data: {
            items: [entry],
            page: { selectedTierComplete: true, nextGroupCursor: null },
          },
          error: null,
        });
      }
      if (name === "get_platform_v2_card_states_for_entries") {
        stateStarted();
        return new Promise((resolve) =>
          setTimeout(() => resolve({ data: [], error: null }), 200),
        );
      }
      return Promise.resolve({ data: null, error: null });
    });
    from.mockImplementation((table: string) => {
      if (table !== "word_entry_translations") {
        return chain({ data: null, error: null });
      }
      const query: any = {
        select: vi.fn(() => query),
        eq: vi.fn(() => query),
        in: vi.fn(() => query),
        then: (resolve: any, reject: any) => {
          translationsStarted();
          return new Promise((resolveTranslations) =>
            setTimeout(
              () => resolveTranslations({ data: [], error: null }),
              300,
            ),
          ).then(resolve, reject);
        },
      };
      return query;
    });

    const responsePromise = POST(
      authenticatedRequest({
        entryId: targetEntryId,
        contentLanguageCode: "nl",
        translationTargetLanguageCode: "ru",
        cardTypeId: "word-to-definition",
        intent: "training-review",
      }),
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(stateStarted).toHaveBeenCalledOnce();
    const overlapped = translationsStarted.mock.calls.length === 1;
    let completedWithinParallelWindow = false;
    void responsePromise.then(() => {
      completedWithinParallelWindow = true;
    });
    await vi.advanceTimersByTimeAsync(300);
    const completedAt300Ms = completedWithinParallelWindow;
    await vi.advanceTimersByTimeAsync(200);
    const response = await responsePromise;

    expect(overlapped).toBe(true);
    expect(completedAt300Ms).toBe(true);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        contractVersion: "platform-lookup-v2",
        query: "huis",
        groups: [
          expect.objectContaining({
            headwordGroupId: "group-target",
            entries: [
              expect.objectContaining({
                kind: "sense-card",
                entryId: targetEntryId,
              }),
            ],
          }),
        ],
      }),
    );
  });

  test("does not expose an inaccessible exact training entry", async () => {
    const { POST } = await import("@/app/api/platform/v2/lookup/route");
    const entryId = "00000000-0000-4000-8000-000000000301";
    getUser.mockResolvedValueOnce({
      data: { user: { id: "user-1" } },
      error: null,
    });
    rpc.mockImplementation((name: string, args: any) => {
      if (name === "read_platform_v2_training_group") {
        expect(args).toEqual({
          p_user_id: "user-1",
          p_entry_id: entryId,
          p_group_entry_bound: 50,
        });
        return Promise.resolve({
          data: { error: "entry_not_accessible" },
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: null });
    });

    const response = await POST(
      authenticatedRequest({
        entryId,
        cardTypeId: "word-to-definition",
        intent: "training-review",
      }),
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "entry_not_accessible",
    });
    expect(rpc).not.toHaveBeenCalledWith(
      "lookup_platform_v2_entries",
      expect.anything(),
    );
  });

  test.each([
    {
      name: "ordinary authenticated lookup",
      importRoute: () => import("@/app/api/platform/v2/lookup/route"),
      request: authenticatedRequest,
      authenticate: () =>
        getUser.mockResolvedValueOnce({
          data: { user: { id: "user-1" } },
          error: null,
        }),
      intent: "dictionary-lookup",
    },
    {
      name: "catalog lookup",
      importRoute: () =>
        import("@/app/api/platform/v2/catalog/lookup/route"),
      request: catalogRequest,
      authenticate: () => undefined,
      intent: "training-review",
    },
  ])(
    "rejects entryId on $name",
    async ({ importRoute, request, authenticate, intent }) => {
      const { POST } = await importRoute();
      authenticate();

      const response = await POST(
        request({
          query: "bank",
          entryId: "00000000-0000-4000-8000-000000000401",
          cardTypeId: "word-to-definition",
          intent,
        }),
      );

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({
        error: "entry_id_not_allowed",
      });
      expect(rpc).not.toHaveBeenCalled();
    },
  );

  test("requires an explicit cardTypeId", async () => {
    const { POST } = await import("@/app/api/platform/v2/lookup/route");
    getUser.mockResolvedValueOnce({
      data: { user: { id: "user-1" } },
      error: null,
    });

    const response = await POST(
      authenticatedRequest({
        query: "huis",
        contentLanguageCode: "nl",
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "missing_card_type_id",
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  test.each([
    {
      name: "authenticated",
      importRoute: () => import("@/app/api/platform/v2/lookup/route"),
      request: authenticatedRequest,
      authenticate: () =>
        getUser.mockResolvedValueOnce({
          data: { user: { id: "user-1" } },
          error: null,
        }),
    },
    {
      name: "catalog",
      importRoute: () =>
        import("@/app/api/platform/v2/catalog/lookup/route"),
      request: catalogRequest,
      authenticate: () => undefined,
    },
  ])(
    "rejects a client-invented cardTypeId on the $name route",
    async ({ importRoute, request, authenticate }) => {
      const { POST } = await importRoute();
      authenticate();

      const response = await POST(
        request({
          query: "huis",
          cardTypeId: "client-invented-card",
        }),
      );

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({
        error: "unsupported_card_type_id",
      });
      expect(rpc).not.toHaveBeenCalled();
    },
  );

  test("returns catalog cards without user state or mutation capabilities", async () => {
    const { POST } = await import(
      "@/app/api/platform/v2/catalog/lookup/route"
    );
    rpc.mockImplementation((name: string, args: any) => {
      if (name === "lookup_platform_v2_entries") {
        expect(args).toEqual({
          p_user_id: null,
          p_catalog: true,
          p_query: "huis",
          p_language_code: "nl",
          p_cursor: null,
          p_group_limit: 10,
          p_group_entry_bound: 50,
        });
        return Promise.resolve({
          data: {
            items: [
              {
                id: "entry-catalog-1",
                dictionary_id: "dict-1",
                language_code: "nl",
                headword: "huis",
                meaning_id: 1,
                part_of_speech: "zn",
                is_nt2_2000: true,
                raw: {
                  meanings: [{ definition: "een gebouw om in te wonen" }],
                },
                dictionary: {
                  id: "dict-1",
                  language_code: "nl",
                  slug: "nl-vandale",
                  name: "Van Dale",
                  kind: "curated",
                  visibility: "system",
                  owner_user_id: null,
                  is_editable: false,
                  schema_key: "nl-vandale-v2",
                  schema_version: 1,
                },
              },
            ],
            page: {
              selectedTierComplete: true,
              nextGroupCursor: null,
            },
          },
          error: null,
        });
      }
      if (name === "read_platform_v2_presentation_identity") {
        expect(args).toEqual({
          p_user_id: null,
          p_entry_ids: ["entry-catalog-1"],
          p_catalog: true,
        });
        return Promise.resolve({
          data: {
            entries: [
              {
                entryId: "entry-catalog-1",
                headwordGroupId: "group-catalog-1",
                meaningOrdinal: 1,
                contentNodeBindings: [
                  {
                    contentNodeId: "node-catalog-definition-1",
                    sourcePath: "raw.meanings[0].definition",
                    kind: "definition",
                    parentContentNodeId: null,
                    sourceTextFingerprint: "catalog-definition-fingerprint",
                  },
                ],
              },
            ],
          },
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: null });
    });

    const response = await POST(
      catalogRequest({
        query: "huis",
        contentLanguageCode: "nl",
        translationTargetLanguageCode: "ru",
        cardTypeId: "word-to-definition",
        intent: "external-click",
      }),
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.groups[0].entries[0]).toEqual(
      expect.objectContaining({
        kind: "sense-card",
        card: null,
        capabilities: [],
      }),
    );
    expect(rpc).not.toHaveBeenCalledWith(
      "get_platform_v2_card_states_for_entries",
      expect.anything(),
    );
  });

  test("projects redirect-only dictionary records as non-learnable cross-references", async () => {
    const { POST } = await import(
      "@/app/api/platform/v2/catalog/lookup/route"
    );
    rpc.mockImplementation((name: string, args: Record<string, unknown>) => {
      if (name === "lookup_platform_v2_entries") {
        if (args.p_query === "selderie") {
          return Promise.resolve({
            data: {
              items: [
                {
                  id: "entry-selderie-1",
                  dictionary_id: "dict-1",
                  language_code: "nl",
                  headword: "selderie",
                  meaning_id: 1,
                  part_of_speech: "zn",
                  raw: { meanings: [{ definition: "target definition" }] },
                },
              ],
              page: { selectedTierComplete: true, nextGroupCursor: null },
            },
            error: null,
          });
        }
        return Promise.resolve({
          data: {
            items: [
              {
                id: "entry-selder-1",
                dictionary_id: "dict-1",
                language_code: "nl",
                headword: "selder",
                meaning_id: 1,
                part_of_speech: "zn",
                raw: {
                  cross_reference: "selderie",
                  meanings: [],
                },
                dictionary: {
                  id: "dict-1",
                  language_code: "nl",
                  slug: "nl-vandale",
                  name: "Van Dale",
                  kind: "curated",
                  visibility: "system",
                  owner_user_id: null,
                  is_editable: false,
                  schema_key: "nl-vandale-v2",
                  schema_version: 1,
                },
              },
            ],
            page: {
              selectedTierComplete: true,
              nextGroupCursor: null,
            },
          },
          error: null,
        });
      }
      if (name === "read_platform_v2_presentation_identity") {
        if (
          Array.isArray(args.p_entry_ids) &&
          args.p_entry_ids.includes("entry-selderie-1")
        ) {
          return Promise.resolve({
            data: {
              entries: [
                {
                  entryId: "entry-selderie-1",
                  headwordGroupId: "group-selderie-1",
                  meaningOrdinal: 1,
                  contentNodeBindings: [],
                },
              ],
            },
            error: null,
          });
        }
        return Promise.resolve({
          data: {
            entries: [
              {
                entryId: "entry-selder-1",
                headwordGroupId: "group-selder-1",
                meaningOrdinal: 1,
                contentNodeBindings: [],
              },
            ],
          },
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: null });
    });

    const response = await POST(
      catalogRequest({
        query: "selder",
        contentLanguageCode: "nl",
        cardTypeId: "word-to-definition",
      }),
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.groups[0]).toEqual(
      expect.objectContaining({
        senseCount: 0,
        entryCount: 1,
        indicators: [],
      }),
    );
    expect(payload.groups[0].entries).toEqual([
      {
        kind: "cross-reference",
        crossReferenceId: "entry-selder-1",
        meaningOrdinal: 1,
        label: {
          termId: "cross-reference.see",
          messageKey: "crossReference.see",
        },
        text: "selderie",
        target: {
          query: "selderie",
          headwordGroupId: "group-selderie-1",
          entryId: "entry-selderie-1",
        },
        capabilities: [
          {
            actionId: "follow-cross-reference",
            elementId: "cross-reference.follow",
            messageKey: "crossReference.follow",
          },
        ],
      },
    ]);
    expect(JSON.stringify(payload)).not.toContain("sense-card");
    expect(JSON.stringify(payload)).not.toContain("start-learning");
  });

  test("returns the complete real-world-sized Headword Group beyond the V1 limit", async () => {
    const { POST } = await import(
      "@/app/api/platform/v2/catalog/lookup/route"
    );
    const entries = Array.from({ length: 11 }, (_, index) => ({
      id: `entry-goed-${index + 1}`,
      dictionary_id: "dict-1",
      language_code: "nl",
      headword: "goed",
      meaning_id: index + 1,
      part_of_speech: "bn",
      raw: {
        meanings: [{ definition: `betekenis ${index + 1}` }],
      },
      dictionary: {
        id: "dict-1",
        language_code: "nl",
        slug: "nl-vandale",
        name: "Van Dale",
        kind: "curated",
        visibility: "system",
        owner_user_id: null,
        is_editable: false,
        schema_key: "nl-vandale-v2",
        schema_version: 1,
      },
    }));
    rpc.mockImplementation((name: string) => {
      if (name === "lookup_platform_v2_entries") {
        return Promise.resolve({
          data: {
            items: entries,
            page: {
              selectedTierComplete: true,
              nextGroupCursor: null,
            },
          },
          error: null,
        });
      }
      if (name === "read_platform_v2_presentation_identity") {
        return Promise.resolve({
          data: {
            entries: entries.map((entry, index) => ({
              entryId: entry.id,
              headwordGroupId: "group-goed",
              meaningOrdinal: index + 1,
              contentNodeBindings: [
                {
                  contentNodeId: `node-goed-${index + 1}`,
                  sourcePath: "raw.meanings[0].definition",
                  kind: "definition",
                  parentContentNodeId: null,
                  sourceTextFingerprint: `fingerprint-goed-${index + 1}`,
                },
              ],
            })),
          },
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: null });
    });

    const response = await POST(
      catalogRequest({
        query: "goed",
        contentLanguageCode: "nl",
        cardTypeId: "word-to-definition",
      }),
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.groups).toHaveLength(1);
    expect(payload.groups[0]).toEqual(
      expect.objectContaining({
        headwordGroupId: "group-goed",
        senseCount: 11,
        entryCount: 11,
      }),
    );
    expect(payload.groups[0].entries).toHaveLength(11);
    expect(payload.page).toEqual({
      selectedTierComplete: true,
      nextGroupCursor: null,
    });
  });

  test("forwards an opaque group cursor and preserves continuation metadata", async () => {
    const { POST } = await import(
      "@/app/api/platform/v2/catalog/lookup/route"
    );
    rpc.mockImplementation((name: string, args: any) => {
      if (name === "lookup_platform_v2_entries") {
        expect(args.p_cursor).toBe("opaque-current");
        return Promise.resolve({
          data: {
            items: [],
            page: {
              selectedTierComplete: false,
              nextGroupCursor: "opaque-next",
            },
          },
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: null });
    });

    const response = await POST(
      catalogRequest({
        query: "lopen",
        contentLanguageCode: "nl",
        cardTypeId: "word-to-definition",
        cursor: "opaque-current",
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        groups: [],
        page: {
          selectedTierComplete: false,
          nextGroupCursor: "opaque-next",
        },
      }),
    );
  });

  test("fails explicitly when one complete group exceeds the safety bound", async () => {
    const { POST } = await import(
      "@/app/api/platform/v2/catalog/lookup/route"
    );
    rpc.mockImplementation((name: string) => {
      if (name === "lookup_platform_v2_entries") {
        return Promise.resolve({
          data: {
            error: "group-too-large",
            group: {
              headwordGroupId: "group-oversized",
              entryCount: 51,
              safetyBound: 50,
            },
          },
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: null });
    });

    const response = await POST(
      catalogRequest({
        query: "oversized",
        contentLanguageCode: "nl",
        cardTypeId: "word-to-definition",
      }),
    );

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({
      error: "group-too-large",
      group: {
        headwordGroupId: "group-oversized",
        entryCount: 51,
        safetyBound: 50,
      },
    });
    expect(rpc).not.toHaveBeenCalledWith(
      "read_platform_v2_presentation_identity",
      expect.anything(),
    );
  });
});
