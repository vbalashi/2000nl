import { beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";

const rpc = vi.fn();
const createClient = vi.fn(() => ({
  rpc,
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient,
}));

const request = (body: unknown, token = "catalog-token") =>
  new NextRequest("http://localhost/api/platform/v1/catalog/lookup", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      origin: "chrome-extension://abc",
    },
    body: JSON.stringify(body),
  });

describe("/api/platform/v1/catalog/lookup", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
    process.env.PLATFORM_CATALOG_ACCESS_TOKEN = "catalog-token";
    process.env.PLATFORM_API_ALLOWED_ORIGINS = "chrome-extension://abc";
    delete process.env.PLATFORM_STRICT_LOOKUP_ROUTES;
    delete process.env.PLATFORM_LOOKUP_LATENCY_LOGS;
    createClient.mockClear();
    rpc.mockReset();
  });

  test("rejects requests without the dedicated catalog token", async () => {
    const { POST } = await import("@/app/api/platform/v1/catalog/lookup/route");

    const response = await POST(
      new NextRequest("http://localhost/api/platform/v1/catalog/lookup", {
        method: "POST",
        body: JSON.stringify({ query: "huis" }),
      }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "invalid_catalog_token",
    });
    expect(createClient).not.toHaveBeenCalled();
  });

  test("reads only public catalog dictionaries and omits user/action surfaces", async () => {
    const { POST } = await import("@/app/api/platform/v1/catalog/lookup/route");
    rpc.mockResolvedValueOnce({
      data: {
        items: [
          {
            id: "entry-1",
            dictionary_id: "dict-1",
            language_code: "nl",
            headword: "huis",
            meaning_id: 1,
            part_of_speech: "zn",
            gender: "het",
            raw: { meanings: [{ definition: "gebouw" }] },
            is_nt2_2000: true,
            meanings_count: 1,
            search_match_group: "exact-headword",
            search_matched_text: "huis",
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
            id: "entry-private",
            dictionary_id: "dict-private",
            language_code: "nl",
            headword: "huis",
            meaning_id: 1,
            raw: { meanings: [{ definition: "private house" }] },
            dictionary: {
              id: "dict-private",
              language_code: "nl",
              slug: "user-private",
              name: "Private dictionary",
              kind: "user",
              visibility: "private",
              owner_user_id: "user-1",
              is_editable: true,
              schema_key: "user-entry-v1",
              schema_version: 1,
            },
          },
        ],
        total: 2,
      },
      error: null,
    });

    const response = await POST(
      request({
        query: " huis ",
        languageCode: "nl",
        contextText: "ik woon in een huis",
        intent: "external-click",
        includeUserState: true,
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("server-timing")).toEqual(
      expect.stringContaining("lookup.db"),
    );
    expect(response.headers.get("server-timing")).toEqual(
      expect.stringContaining("lookup.projection"),
    );
    expect(response.headers.get("server-timing")).toEqual(
      expect.stringContaining("route.total"),
    );
    expect(response.headers.get("x-request-id")).toBeTruthy();
    expect(response.headers.get("access-control-allow-origin")).toBe(
      "chrome-extension://abc",
    );
    expect(createClient).toHaveBeenCalledWith(
      "http://localhost:54321",
      "service-key",
      expect.objectContaining({
        auth: expect.objectContaining({ persistSession: false }),
      }),
    );
    expect(rpc).toHaveBeenCalledWith("lookup_public_catalog_entries_v1", {
      p_query: "huis",
      p_language_code: "nl",
      p_limit: 10,
    });

    const payload = await response.json();
    expect(payload).toEqual(
      expect.objectContaining({
        query: "huis",
        request: {
          languageCode: "nl",
          contextText: "ik woon in een huis",
          intent: "external-click",
        },
      }),
    );
    expect(payload.items[0].entry).toEqual(
      expect.objectContaining({
        id: "entry-1",
        dictionaryId: "dict-1",
        languageCode: "nl",
        content: expect.objectContaining({
          headword: "huis",
          languageCode: "nl",
        }),
        contentFingerprint: expect.any(String),
      }),
    );
    expect(payload.items[0].dictionary).toEqual(
      expect.objectContaining({
        id: "dict-1",
        visibility: "system",
      }),
    );
    expect(payload.items[0].match).toEqual({
      queriedForm: "huis",
      matchedForm: "huis",
      relation: "exact",
    });
    expect(payload.items).toHaveLength(1);
    expect(payload.items.map((item: any) => item.entry.id)).not.toContain(
      "entry-private",
    );
    expect(payload.items[0].userStateByCardType).toBeUndefined();
    expect(payload.items[0].progressSummary).toBeUndefined();
    expect(payload.items[0].listMemberships).toBeUndefined();
    expect(payload.items[0].cardCapabilitiesByType).toBeUndefined();
    expect(payload.items[0].availableActions).toBeUndefined();
  });

  test("reports catalog word-form matches as inflection evidence", async () => {
    const { POST } = await import("@/app/api/platform/v1/catalog/lookup/route");
    rpc.mockResolvedValueOnce({
      data: {
        items: [
          {
            id: "entry-1",
            dictionary_id: "dict-1",
            language_code: "nl",
            headword: "lopen",
            meaning_id: 1,
            raw: { meanings: [{ definition: "te voet gaan" }] },
            search_match_group: "lemma-or-inflection",
            search_matched_text: "loopt",
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
        total: 1,
      },
      error: null,
    });

    const response = await POST(
      request({
        query: "loopt",
        languageCode: "nl",
        intent: "external-click",
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

  test("returns 503 when the catalog search index is not ready", async () => {
    const { POST } = await import("@/app/api/platform/v1/catalog/lookup/route");
    rpc.mockResolvedValueOnce({
      data: {
        error: "search_index_not_ready",
        items: [],
        total: 0,
      },
      error: null,
    });

    const response = await POST(
      request({
        query: "huis",
        languageCode: "nl",
      }),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        error: "search_index_not_ready",
      }),
    );
  });

  test("can roll back catalog lookup to broad catalog search by feature flag", async () => {
    process.env.PLATFORM_STRICT_LOOKUP_ROUTES = "0";
    const { POST } = await import("@/app/api/platform/v1/catalog/lookup/route");
    rpc.mockResolvedValueOnce({
      data: { items: [], total: 0 },
      error: null,
    });

    const response = await POST(
      request({
        query: "huis",
        languageCode: "nl",
      }),
    );

    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("search_public_catalog_entries", {
      p_query: "huis",
      p_language_code: "nl",
      p_page: 1,
      p_page_size: 10,
    });
    expect(rpc).not.toHaveBeenCalledWith(
      "lookup_public_catalog_entries_v1",
      expect.anything(),
    );
  });
});
