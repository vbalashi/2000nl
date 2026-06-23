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
    in: vi.fn(() => query),
    maybeSingle: vi.fn(async () => result),
    then: (resolve: any, reject: any) =>
      Promise.resolve(result).then(resolve, reject),
  };
  return query;
};

const request = (body: unknown, token = "token-1") =>
  new NextRequest("http://localhost/api/platform/lookup", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      origin: "chrome-extension://abc",
    },
    body: JSON.stringify(body),
  });

const mutationRpcNames = [
  "record_card_view",
  "handle_card_review",
  "start_learning_entry_card",
  "add_entry_to_user_list",
  "copy_entry_to_user_dictionary",
  "create_user_dictionary_entry",
  "update_user_dictionary_entry",
  "delete_user_dictionary_entry",
];

describe("/api/platform/lookup", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
    process.env.PLATFORM_API_ALLOWED_ORIGINS = "chrome-extension://abc";
    process.env.PLATFORM_CATALOG_ACCESS_TOKEN = "catalog-token";
    process.env.TRANSLATION_PROVIDER = "openai";
    createClient.mockClear();
    getUser.mockReset();
    rpc.mockReset();
    from.mockReset();
  });

  test("rejects missing bearer tokens", async () => {
    const { POST } = await import("@/app/api/platform/lookup/route");

    const response = await POST(
      new NextRequest("http://localhost/api/platform/lookup", {
        method: "POST",
        body: JSON.stringify({ query: "huis" }),
      }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "missing_bearer_token",
    });
    expect(createClient).not.toHaveBeenCalled();
  });

  test("answers CORS preflight for configured origins", async () => {
    const { OPTIONS } = await import("@/app/api/platform/lookup/route");

    const response = OPTIONS(
      new NextRequest("http://localhost/api/platform/lookup", {
        method: "OPTIONS",
        headers: {
          origin: "chrome-extension://abc",
        },
      }),
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe(
      "chrome-extension://abc",
    );
    expect(response.headers.get("access-control-allow-methods")).toContain(
      "POST",
    );
  });

  test("returns a read-only lookup payload with dictionary metadata and user state", async () => {
    const { POST } = await import("@/app/api/platform/lookup/route");
    getUser.mockResolvedValueOnce({
      data: { user: { id: "user-1" } },
      error: null,
    });
    rpc.mockImplementation((name: string, args: any) => {
      if (name === "fetch_dictionary_entry_gated") {
        return Promise.resolve({
          data: [
            {
              id: "entry-1",
              dictionary_id: "dict-1",
              language_code: "nl",
              headword: "huis",
              meaning_id: 1,
              part_of_speech: "zn",
              raw: { meanings: [{ definition: "gebouw" }] },
              is_nt2_2000: true,
              meanings_count: 1,
              dictionary: {
                id: "dict-1",
                language_code: "nl",
                slug: "nl-vandale",
                name: "VanDale Dutch",
                kind: "curated",
                visibility: "system",
                owner_user_id: null,
                is_editable: false,
                schema_key: "nl-vandale-v1",
                schema_version: 1,
              },
            },
            {
              id: "entry-2",
              dictionary_id: "dict-2",
              language_code: "nl",
              headword: "huis",
              meaning_id: 1,
              part_of_speech: "noun",
              raw: { translation: { languageCode: "en", text: "house" } },
              is_nt2_2000: false,
              meanings_count: 1,
              dictionary: {
                id: "dict-2",
                language_code: "nl",
                slug: "user-user1-nl",
                name: "My dictionary",
                kind: "user",
                visibility: "private",
                owner_user_id: "user-1",
                is_editable: true,
                schema_key: "user-entry-v1",
                schema_version: 1,
              },
            },
          ],
          error: null,
        });
      }
      if (name === "get_user_list_memberships_for_entries") {
        return Promise.resolve({
          data: [
            {
              entry_id: "entry-1",
              lists: [
                {
                  id: "list-1",
                  kind: "user",
                  name: "My list",
                  description: "Personal lookup list",
                  primary_language_code: "nl",
                  item_count: 3,
                },
              ],
            },
          ],
          error: null,
        });
      }
      if (name === "get_user_card_states_for_entries") {
        expect(args?.p_entry_ids).toEqual(["entry-1", "entry-2"]);
        return Promise.resolve({
          data: [
            {
              entry_id: "entry-1",
              card_type_id: "word-to-definition",
              click_count: 2,
              seen_count: 4,
              success_count: 1,
              last_seen_at: "2026-05-17T10:00:00.000Z",
              last_reviewed_at: "2026-05-17T11:00:00.000Z",
              next_review_at: "2026-05-18T11:00:00.000Z",
              hidden: false,
              frozen_until: null,
              in_learning: false,
              learning_due_at: null,
              fsrs_stability: null,
              fsrs_difficulty: null,
              fsrs_reps: 1,
              fsrs_lapses: 0,
              fsrs_last_grade: null,
              fsrs_last_interval: null,
              fsrs_params_version: "fsrs-6-default",
            },
          ],
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: null });
    });

    const response = await POST(request({ query: " huis " }));

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe(
      "chrome-extension://abc",
    );
    expect(createClient).toHaveBeenCalledWith(
      "http://localhost:54321",
      "anon-key",
      expect.objectContaining({
        global: { headers: { Authorization: "Bearer token-1" } },
      }),
    );
    expect(rpc).toHaveBeenCalledWith("fetch_dictionary_entry_gated", {
      p_headword: "huis",
    });
    expect(rpc).toHaveBeenCalledWith("get_user_list_memberships_for_entries", {
      p_user_id: "user-1",
      p_entry_ids: ["entry-1", "entry-2"],
    });
    expect(rpc).toHaveBeenCalledWith("get_user_card_states_for_entries", {
      p_user_id: "user-1",
      p_entry_ids: ["entry-1", "entry-2"],
      p_card_type_ids: expect.arrayContaining(["word-to-definition"]),
    });
    expect(from).not.toHaveBeenCalled();
    const payload = await response.json();
    expect(payload.items[0].entry).toEqual(
      expect.objectContaining({
        id: "entry-1",
        dictionaryId: "dict-1",
        languageCode: "nl",
        headword: "huis",
        meaningId: 1,
        partOfSpeech: "zn",
        isNt22000: true,
        meaningsCount: 1,
      }),
    );
    expect(payload.items[0].dictionary.slug).toBe("nl-vandale");
    expect(payload.items[0].dictionary.schemaKey).toBe("nl-vandale-v1");
    expect(payload.items[0].availableActions).toContain("copy-to-user-dictionary");
    expect(payload.items[0].availableActions).not.toContain("update-user-entry");
    expect(payload.items[0].availableActions).not.toContain("delete-user-entry");
    expect(payload.items[1].entry.id).toBe("entry-2");
    expect(payload.items[1].dictionary.schemaKey).toBe("user-entry-v1");
    expect(payload.items[1].dictionary.isEditable).toBe(true);
    expect(payload.items[1].availableActions).toEqual(
      expect.arrayContaining(["update-user-entry", "delete-user-entry"]),
    );
    expect(payload.items[0].userStateByCardType["word-to-definition"]).toEqual(
      expect.objectContaining({
        entryId: "entry-1",
        clickCount: 2,
        seenCount: 4,
        successCount: 1,
        lastReviewedAt: "2026-05-17T11:00:00.000Z",
        nextReviewAt: "2026-05-18T11:00:00.000Z",
        inLearning: false,
        learningDueAt: null,
        fsrs: expect.objectContaining({
          reps: 1,
          paramsVersion: "fsrs-6-default",
        }),
      }),
    );
    expect(payload.items[0].progressSummary).toEqual({
      status: "reviewing",
      trackedCardCount: 1,
      reviewedCardCount: 1,
      learningCardCount: 0,
      hiddenCardCount: 0,
      strongestCardTypeId: "word-to-definition",
      weakestCardTypeId: "word-to-definition",
      lastReviewedAt: "2026-05-17T11:00:00.000Z",
      nextReviewAt: "2026-05-18T11:00:00.000Z",
    });
    expect(payload.items[0].listMemberships).toEqual([
      {
        id: "list-1",
        kind: "user",
        name: "My list",
        description: "Personal lookup list",
        primaryLanguageCode: "nl",
        defaultScenarioId: null,
        cardPolicy: "inherit",
        cardTypeIds: null,
        itemCount: 3,
      },
    ]);
    expect(payload.items[1].listMemberships).toEqual([]);
    for (const name of mutationRpcNames) {
      expect(rpc).not.toHaveBeenCalledWith(name, expect.anything());
    }
  });

  test("does not read card state or mutate when user state is disabled", async () => {
    const { POST } = await import("@/app/api/platform/lookup/route");
    getUser.mockResolvedValueOnce({
      data: { user: { id: "user-1" } },
      error: null,
    });
    rpc.mockResolvedValueOnce({
      data: [
        {
          id: "entry-1",
          dictionary_id: "dict-1",
          language_code: "nl",
          headword: "huis",
          meaning_id: 1,
          raw: {},
          is_nt2_2000: true,
          meanings_count: 1,
          dictionary: {
            id: "dict-1",
            language_code: "nl",
            slug: "nl-vandale",
            name: "VanDale Dutch",
            kind: "curated",
            visibility: "system",
            owner_user_id: null,
            is_editable: false,
            schema_key: "nl-vandale-v1",
            schema_version: 1,
          },
        },
      ],
      error: null,
    });

    const response = await POST(
      request({ query: "huis", includeUserState: false }),
    );

    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("fetch_dictionary_entry_gated", {
      p_headword: "huis",
    });
    expect(from).not.toHaveBeenCalled();
    for (const name of [
      "get_card_user_state",
      "get_user_card_state",
      "get_user_card_states_for_entries",
      "get_user_list_memberships_for_entries",
      ...mutationRpcNames,
    ]) {
      expect(rpc).not.toHaveBeenCalledWith(name, expect.anything());
    }
    const payload = await response.json();
    expect(payload.items[0].userStateByCardType).toBeUndefined();
    expect(payload.items[0].listMemberships).toBeUndefined();
  });

  test("uses search semantics for external-click exact lookup with language filtering", async () => {
    const { POST } = await import("@/app/api/platform/lookup/route");
    getUser.mockResolvedValueOnce({
      data: { user: { id: "user-1" } },
      error: null,
    });
    rpc.mockImplementation((name: string) => {
      if (name === "search_word_entries_gated") {
        return Promise.resolve({
          data: {
            items: [
              {
                id: "entry-1",
                dictionary_id: "dict-1",
                dictionary_name: "VanDale Dutch",
                dictionary_slug: "nl-vandale",
                dictionary_kind: "curated",
                language_code: "nl",
                headword: "huis",
                meaning_id: 1,
                raw: { meanings: [{ definition: "gebouw" }] },
                search_match_group: "exact-headword",
                search_matched_text: "huis",
              },
            ],
            total: 1,
          },
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: null });
    });

    const response = await POST(
      request({
        query: "huis",
        languageCode: "nl",
        contextText: "ik woon in een huis",
        intent: "external-click",
        includeUserState: false,
      }),
    );

    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("search_word_entries_gated", {
      p_query: "huis",
      p_part_of_speech: null,
      p_is_nt2: null,
      p_filter_frozen: null,
      p_filter_hidden: null,
      p_page: 1,
      p_page_size: 10,
      p_language_code: "nl",
      p_dictionary_ids: null,
    });
    expect(rpc).not.toHaveBeenCalledWith("fetch_dictionary_entry_gated", {
      p_headword: "huis",
    });
    const payload = await response.json();
    expect(payload.request).toEqual({
      languageCode: "nl",
      contextText: "ik woon in een huis",
      intent: "external-click",
    });
    expect(payload.items[0].match).toEqual({
      queriedForm: "huis",
      matchedForm: "huis",
      relation: "exact",
    });
    expect(payload.items[0].dictionary).toEqual(
      expect.objectContaining({
        id: "dict-1",
        slug: "nl-vandale",
        kind: "curated",
      }),
    );
  });

  test("reports indexed word-form matches as inflection evidence", async () => {
    const { POST } = await import("@/app/api/platform/lookup/route");
    getUser.mockResolvedValueOnce({
      data: { user: { id: "user-1" } },
      error: null,
    });
    rpc.mockResolvedValueOnce({
      data: {
        items: [
          {
            id: "entry-1",
            dictionary_id: "dict-1",
            dictionary_name: "VanDale Dutch",
            dictionary_slug: "nl-vandale",
            dictionary_kind: "curated",
            language_code: "nl",
            headword: "lopen",
            meaning_id: 1,
            raw: { meanings: [{ definition: "te voet gaan" }] },
            search_match_group: "lemma-or-inflection",
            search_matched_text: null,
          },
        ],
        total: 1,
      },
      error: null,
    });

    const response = await POST(
      request({
        query: "loopt",
        languageCode: "nl",
        intent: "external-click",
        includeUserState: false,
      }),
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.items[0].entry.headword).toBe("lopen");
    expect(payload.items[0].match).toEqual({
      queriedForm: "loopt",
      matchedForm: "loopt",
      relation: "inflection",
    });
  });

  test("applies language scope for the same visible clicked token", async () => {
    const { POST } = await import("@/app/api/platform/lookup/route");
    getUser.mockResolvedValueOnce({
      data: { user: { id: "user-1" } },
      error: null,
    });
    rpc.mockImplementation((name: string, args: any) => {
      if (name === "search_word_entries_gated") {
        expect(args?.p_query).toBe("die");
        expect(args?.p_language_code).toBe("de");
        return Promise.resolve({
          data: {
            items: [
              {
                id: "entry-de-1",
                dictionary_id: "dict-de",
                dictionary_name: "German source",
                dictionary_slug: "de-source",
                dictionary_kind: "curated",
                language_code: "de",
                headword: "die",
                meaning_id: 1,
                raw: { meanings: [{ definition: "German article" }] },
                search_match_group: "exact-headword",
                search_matched_text: "die",
              },
            ],
            total: 1,
          },
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: null });
    });

    const response = await POST(
      request({
        query: "die",
        languageCode: "de",
        intent: "external-click",
        includeUserState: false,
      }),
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.items).toHaveLength(1);
    expect(payload.items[0].entry.id).toBe("entry-de-1");
    expect(payload.items[0].entry.languageCode).toBe("de");
    expect(payload.items[0].match).toEqual({
      queriedForm: "die",
      matchedForm: "die",
      relation: "exact",
    });
  });

  test("attaches cached translations to headword, summary, and stable sections", async () => {
    const { POST } = await import("@/app/api/platform/lookup/route");
    getUser.mockResolvedValueOnce({
      data: { user: { id: "user-1" } },
      error: null,
    });
    rpc.mockResolvedValueOnce({
      data: {
        items: [
          {
            id: "entry-1",
            dictionary_id: "dict-1",
            dictionary_name: "VanDale Dutch",
            dictionary_slug: "nl-vandale",
            dictionary_kind: "curated",
            language_code: "nl",
            headword: "huis",
            meaning_id: 1,
            raw: {
              meanings: [
                {
                  definition: "gebouw",
                  examples: ["Ik woon in een huis.", "Het huis is oud."],
                },
              ],
            },
            search_match_group: "exact-headword",
            search_matched_text: "huis",
          },
        ],
        total: 1,
      },
      error: null,
    });
    from.mockImplementation((table: string) => {
      if (table === "user_settings") {
        return chain({ data: { translation_lang: "ru" }, error: null });
      }
      if (table === "word_entry_translations") {
        return chain({
          data: [
            {
              id: "translation-1",
              word_entry_id: "entry-1",
              target_lang: "ru",
              provider: "openai",
              status: "ready",
              overlay: {
                headword: "дом",
                meanings: [
                  {
                    definition: "здание",
                    examples: ["Я живу в доме."],
                  },
                ],
              },
              source_fingerprint: "fingerprint-1",
              error_message: null,
            },
          ],
          error: null,
        });
      }
      throw new Error(`unexpected table read: ${table}`);
    });

    const response = await POST(
      request({
        query: "huis",
        languageCode: "nl",
        intent: "external-click",
        includeUserState: false,
        includeTranslations: true,
      }),
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(from).toHaveBeenCalledWith("user_settings");
    expect(from).toHaveBeenCalledWith("word_entry_translations");
    expect(payload.items[0].translation).toEqual({
      status: "ready",
      targetLanguageCode: "ru",
      translationId: "translation-1",
      translationPolicyVersion: "fingerprint-1",
    });
    expect(payload.items[0].entry.content.headwordTranslation).toBe("дом");
    expect(payload.items[0].entry.content.summary).toEqual({
      definition: "gebouw",
      definitionTranslation: "здание",
      example: "Ik woon in een huis.",
      exampleTranslation: "Я живу в доме.",
    });
    expect(payload.items[0].entry.content.sections).toEqual([
      {
        id: "meaning-1",
        sourcePath: "raw.meanings[0].definition",
        kind: "meaning",
        text: "gebouw",
        translation: "здание",
      },
      {
        id: "example-1-1",
        sourcePath: "raw.meanings[0].examples[0]",
        kind: "example",
        text: "Ik woon in een huis.",
        translation: "Я живу в доме.",
      },
      {
        id: "example-1-2",
        sourcePath: "raw.meanings[0].examples[1]",
        kind: "example",
        text: "Het huis is oud.",
      },
    ]);
  });

  test("attaches idiom translations to the idiom source section", async () => {
    const { POST } = await import("@/app/api/platform/lookup/route");
    getUser.mockResolvedValueOnce({
      data: { user: { id: "user-1" } },
      error: null,
    });
    rpc.mockResolvedValueOnce({
      data: [
        {
          id: "entry-idiom",
          dictionary_id: "dict-1",
          language_code: "nl",
          headword: "knoop",
          meaning_id: 1,
          raw: {
            meanings: [
              {
                definition: "verbinding",
                idioms: [
                  {
                    expression: "de knoop doorhakken",
                    explanation: "een beslissing nemen",
                  },
                ],
              },
            ],
          },
        },
      ],
      error: null,
    });
    from.mockImplementation((table: string) => {
      if (table === "user_settings") {
        return chain({ data: { translation_lang: "ru" }, error: null });
      }
      if (table === "word_entry_translations") {
        return chain({
          data: [
            {
              id: "translation-idiom",
              word_entry_id: "entry-idiom",
              target_lang: "ru",
              provider: "openai",
              status: "ready",
              overlay: {
                meanings: [
                  {
                    definition: "связь",
                    idioms: [{ expression: "принять решение" }],
                  },
                ],
              },
              source_fingerprint: "fingerprint-idiom",
              error_message: null,
            },
          ],
          error: null,
        });
      }
      throw new Error(`unexpected table read: ${table}`);
    });

    const response = await POST(
      request({
        query: "knoop",
        includeUserState: false,
        includeTranslations: true,
      }),
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.items[0].entry.content.sections).toContainEqual({
      id: "idiom-1-1",
      sourcePath: "raw.meanings[0].idioms[0]",
      kind: "idiom",
      text: "de knoop doorhakken",
      label: "een beslissing nemen",
      translation: "принять решение",
    });
  });

  test.each([
    {
      status: "pending",
      row: {
        id: "translation-pending",
        word_entry_id: "entry-1",
        target_lang: "ru",
        provider: "openai",
        status: "pending",
        overlay: null,
        source_fingerprint: null,
        error_message: null,
      },
      expected: {
        status: "pending",
        targetLanguageCode: "ru",
        translationId: "translation-pending",
      },
    },
    {
      status: "failed",
      row: {
        id: "translation-failed",
        word_entry_id: "entry-1",
        target_lang: "ru",
        provider: "openai",
        status: "failed",
        overlay: null,
        source_fingerprint: null,
        error_message: "provider timeout",
      },
      expected: {
        status: "failed",
        targetLanguageCode: "ru",
        translationId: "translation-failed",
        error: {
          code: "translation_failed",
          message: "provider timeout",
        },
      },
    },
  ])("returns cached $status translation status without overlay placement", async ({
    row,
    expected,
  }) => {
    const { POST } = await import("@/app/api/platform/lookup/route");
    getUser.mockResolvedValueOnce({
      data: { user: { id: "user-1" } },
      error: null,
    });
    rpc.mockResolvedValueOnce({
      data: [
        {
          id: "entry-1",
          dictionary_id: "dict-1",
          language_code: "nl",
          headword: "huis",
          meaning_id: 1,
          raw: { meanings: [{ definition: "gebouw" }] },
        },
      ],
      error: null,
    });
    from.mockImplementation((table: string) => {
      if (table === "user_settings") {
        return chain({ data: { translation_lang: "ru" }, error: null });
      }
      if (table === "word_entry_translations") {
        return chain({ data: [row], error: null });
      }
      throw new Error(`unexpected table read: ${table}`);
    });

    const response = await POST(
      request({
        query: "huis",
        includeUserState: false,
        includeTranslations: true,
      }),
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.items[0].translation).toEqual(expected);
    expect(payload.items[0].entry.content.sections[0]).toEqual({
      id: "meaning-1",
      sourcePath: "raw.meanings[0].definition",
      kind: "meaning",
      text: "gebouw",
    });
  });

  test("catalog lookup marks requested translations unavailable without target inference", async () => {
    const { POST } = await import("@/app/api/platform/catalog/lookup/route");
    rpc.mockResolvedValueOnce({
      data: {
        items: [
          {
            id: "entry-public",
            dictionary_id: "dict-1",
            dictionary_name: "VanDale Dutch",
            dictionary_slug: "nl-vandale",
            dictionary_kind: "curated",
            language_code: "nl",
            headword: "huis",
            raw: { meanings: [{ definition: "gebouw" }] },
            dictionary: {
              id: "dict-1",
              language_code: "nl",
              slug: "nl-vandale",
              name: "VanDale Dutch",
              kind: "curated",
              visibility: "system",
              is_editable: false,
              schema_key: "nl-vandale-v1",
              schema_version: 1,
            },
          },
        ],
      },
      error: null,
    });

    const response = await POST(
      request(
        {
          query: "huis",
          includeTranslations: true,
        },
        "catalog-token",
      ),
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.items[0].translation).toEqual({ status: "not_available" });
    expect(payload.items[0].entry.content.translation).toEqual({
      status: "not_available",
    });
  });

  test("preserves request metadata when external-click search has no results", async () => {
    const { POST } = await import("@/app/api/platform/lookup/route");
    getUser.mockResolvedValueOnce({
      data: { user: { id: "user-1" } },
      error: null,
    });
    rpc.mockResolvedValueOnce({
      data: { items: [], total: 0 },
      error: null,
    });

    const response = await POST(
      request({
        query: "bestaatniet",
        languageCode: "nl",
        contextText: "geen match",
        intent: "external-click",
      }),
    );

    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith(
      "search_word_entries_gated",
      expect.objectContaining({
        p_query: "bestaatniet",
        p_language_code: "nl",
      }),
    );
    await expect(response.json()).resolves.toEqual({
      query: "bestaatniet",
      request: {
        languageCode: "nl",
        contextText: "geen match",
        intent: "external-click",
      },
      items: [],
    });
  });

  test("fingerprint ignores volatile source metadata but sections keep stable source paths", async () => {
    const { POST } = await import("@/app/api/platform/lookup/route");
    getUser.mockResolvedValueOnce({
      data: { user: { id: "user-1" } },
      error: null,
    });
    rpc.mockResolvedValueOnce({
      data: [
        {
          id: "entry-1",
          dictionary_id: "dict-1",
          language_code: "nl",
          headword: "huis",
          meaning_id: 1,
          raw: {
            meanings: [{ definition: "gebouw" }],
            _metadata: { importedAt: "2026-06-18T08:00:00.000Z" },
          },
          dictionary: {
            id: "dict-1",
            language_code: "nl",
            slug: "nl-vandale",
            name: "VanDale Dutch",
            kind: "curated",
            visibility: "system",
            owner_user_id: null,
            is_editable: false,
            schema_key: "nl-vandale-v1",
            schema_version: 1,
          },
        },
        {
          id: "entry-2",
          dictionary_id: "dict-1",
          language_code: "nl",
          headword: "huis",
          meaning_id: 1,
          raw: {
            meanings: [{ definition: "gebouw" }],
            _metadata: { importedAt: "2026-06-18T09:00:00.000Z" },
          },
          dictionary: {
            id: "dict-1",
            language_code: "nl",
            slug: "nl-vandale",
            name: "VanDale Dutch",
            kind: "curated",
            visibility: "system",
            owner_user_id: null,
            is_editable: false,
            schema_key: "nl-vandale-v1",
            schema_version: 1,
          },
        },
      ],
      error: null,
    });

    const response = await POST(
      request({ query: "huis", includeUserState: false }),
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.items[0].entry.content.sourceMeta).toEqual({
      importedAt: "2026-06-18T08:00:00.000Z",
    });
    expect(payload.items[0].entry.content.sections).toEqual([
      {
        id: "meaning-1",
        sourcePath: "raw.meanings[0].definition",
        kind: "meaning",
        text: "gebouw",
      },
    ]);
    expect(payload.items[0].entry.contentFingerprint).toBe(
      payload.items[1].entry.contentFingerprint,
    );
  });

  test("does not infer Dutch when entry language is missing", async () => {
    const { POST } = await import("@/app/api/platform/lookup/route");
    getUser.mockResolvedValueOnce({
      data: { user: { id: "user-1" } },
      error: null,
    });
    rpc.mockResolvedValueOnce({
      data: [
        {
          id: "entry-unknown-language",
          dictionary_id: "dict-1",
          language_code: null,
          headword: "bonjour",
          meaning_id: 1,
          raw: { meanings: [{ definition: "salutation" }] },
          dictionary: {
            id: "dict-1",
            language_code: "fr",
            slug: "fr-source",
            name: "French Source",
            kind: "curated",
            visibility: "system",
            owner_user_id: null,
            is_editable: false,
            schema_key: "fr-source-v1",
            schema_version: 1,
          },
        },
      ],
      error: null,
    });

    const response = await POST(
      request({ query: "bonjour", includeUserState: false }),
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.items[0].entry.languageCode).toBeNull();
    expect(payload.items[0].entry.content.languageCode).toBeNull();
  });

  test("reports all-hidden progress as hidden, not known", async () => {
    const { POST } = await import("@/app/api/platform/lookup/route");
    getUser.mockResolvedValueOnce({
      data: { user: { id: "user-1" } },
      error: null,
    });
    rpc.mockImplementation((name: string, args: any) => {
      if (name === "fetch_dictionary_entry_gated") {
        return Promise.resolve({
          data: [
            {
              id: "entry-hidden",
              dictionary_id: "dict-1",
              language_code: "nl",
              headword: "verborgen",
              meaning_id: 1,
              raw: {},
              is_nt2_2000: true,
              meanings_count: 1,
              dictionary: {
                id: "dict-1",
                language_code: "nl",
                slug: "nl-vandale",
                name: "VanDale Dutch",
                kind: "curated",
                visibility: "system",
                owner_user_id: null,
                is_editable: false,
                schema_key: "nl-vandale-v1",
                schema_version: 1,
              },
            },
          ],
          error: null,
        });
      }
      if (name === "get_user_list_memberships_for_entries") {
        return Promise.resolve({ data: [], error: null });
      }
      if (name === "get_user_card_states_for_entries") {
        expect(args?.p_entry_ids).toEqual(["entry-hidden"]);
        return Promise.resolve({
          data: [
            {
              entry_id: "entry-hidden",
              card_type_id: "word-to-definition",
              click_count: 0,
              seen_count: 0,
              success_count: 0,
              last_seen_at: null,
              last_reviewed_at: null,
              next_review_at: null,
              hidden: true,
              frozen_until: null,
              in_learning: false,
              learning_due_at: null,
              fsrs_stability: null,
              fsrs_difficulty: null,
              fsrs_reps: 0,
              fsrs_lapses: 0,
              fsrs_last_grade: null,
              fsrs_last_interval: null,
              fsrs_params_version: "fsrs-6-default",
            },
          ],
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: null });
    });

    const response = await POST(request({ query: "verborgen" }));

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.items[0].progressSummary).toEqual(
      expect.objectContaining({
        status: "hidden",
        hiddenCardCount: 1,
        reviewedCardCount: 0,
      }),
    );
  });

  test.each([
    {
      name: "not-started",
      state: null,
      actions: ["start-learning", "mark-known"],
      reviewResults: undefined,
    },
    {
      name: "encountered",
      state: { click_count: 1, seen_count: 0, fsrs_reps: 0 },
      actions: ["start-learning", "mark-known"],
      reviewResults: undefined,
    },
    {
      name: "learning",
      state: { in_learning: true, seen_count: 1, fsrs_reps: 0 },
      actions: ["review-card"],
      reviewResults: ["fail", "hard", "success", "easy"],
    },
    {
      name: "reviewing",
      state: { seen_count: 1, fsrs_reps: 1 },
      actions: ["review-card"],
      reviewResults: ["fail", "hard", "success", "easy"],
    },
    {
      name: "hidden",
      state: { hidden: true, seen_count: 1, fsrs_reps: 1 },
      actions: [],
      reviewResults: undefined,
    },
    {
      name: "frozen",
      state: {
        frozen_until: "2999-01-01T00:00:00.000Z",
        seen_count: 1,
        fsrs_reps: 1,
      },
      actions: [],
      reviewResults: undefined,
    },
  ])(
    "returns phase-aware word-to-definition capabilities for $name cards",
    async ({ name, state, actions, reviewResults }) => {
      const { POST } = await import("@/app/api/platform/lookup/route");
      getUser.mockResolvedValueOnce({
        data: { user: { id: "user-1" } },
        error: null,
      });
      rpc.mockImplementation((rpcName: string) => {
        if (rpcName === "fetch_dictionary_entry_gated") {
          return Promise.resolve({
            data: [
              {
                id: `entry-${name}`,
                dictionary_id: "dict-1",
                language_code: "nl",
                headword: "huis",
                meaning_id: 1,
                raw: {},
                dictionary: {
                  id: "dict-1",
                  language_code: "nl",
                  slug: "nl-vandale",
                  name: "VanDale Dutch",
                  kind: "curated",
                  visibility: "system",
                  owner_user_id: null,
                  is_editable: false,
                  schema_key: "nl-vandale-v1",
                  schema_version: 1,
                },
              },
            ],
            error: null,
          });
        }
        if (rpcName === "get_user_list_memberships_for_entries") {
          return Promise.resolve({ data: [], error: null });
        }
        if (rpcName === "get_user_card_states_for_entries") {
          const baseState = {
            entry_id: `entry-${name}`,
            card_type_id: "word-to-definition",
            click_count: 0,
            seen_count: 0,
            success_count: 0,
            last_seen_at: null,
            last_reviewed_at: null,
            next_review_at: null,
            hidden: false,
            frozen_until: null,
            in_learning: false,
            learning_due_at: null,
            fsrs_stability: null,
            fsrs_difficulty: null,
            fsrs_reps: 0,
            fsrs_lapses: 0,
            fsrs_last_grade: null,
            fsrs_last_interval: null,
            fsrs_params_version: "fsrs-6-default",
          };
          return Promise.resolve({
            data: state ? [Object.assign(baseState, state)] : [],
            error: null,
          });
        }
        return Promise.resolve({ data: null, error: null });
      });

      const response = await POST(request({ query: "huis" }));

      expect(response.status).toBe(200);
      const payload = await response.json();
      expect(
        payload.items[0].cardCapabilitiesByType["word-to-definition"],
      ).toEqual({
        phase: name,
        actions,
        ...(reviewResults ? { reviewResults } : {}),
        frozenUntil: state?.frozen_until ?? null,
      });
    },
  );
});
