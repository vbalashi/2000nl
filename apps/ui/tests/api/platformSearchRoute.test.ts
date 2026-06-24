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

const searchPayload = {
  contractVersion: "dictionary-search-v1",
  query: "oog",
  request: { languageCode: "nl", scope: "authenticated" },
  groups: [
    {
      id: "headwords",
      total: 1,
      items: [
        {
          kind: "entry",
          entry: { id: "entry-1", headword: "oog", languageCode: "nl" },
          dictionary: { id: "dict-1", slug: "nl-vandale", kind: "curated" },
          match: { relation: "exact", matchedText: "oog" },
        },
      ],
      page: { limit: 6, nextCursor: null, hasMore: false },
    },
    {
      id: "examples",
      total: 2,
      items: [
        {
          kind: "field-match",
          resultKey: "entry-2:raw.meanings[0].examples[0]",
          entry: { id: "entry-2", headword: "onder vier ogen" },
          field: {
            kind: "example",
            sourcePath: "raw.meanings[0].examples[0]",
            text: "onder vier ogen",
          },
          match: { matchedText: "oog" },
        },
      ],
      page: { limit: 6, nextCursor: "cursor-1", hasMore: true },
    },
    {
      id: "definitions",
      total: 1,
      items: [],
      page: { limit: 6, nextCursor: null, hasMore: false },
    },
    {
      id: "alphabetical",
      total: 10,
      items: [],
      page: { limit: 6, nextCursor: "cursor-alpha", hasMore: true },
    },
  ],
};

const request = (path: string, body: unknown, token = "token-1") =>
  new NextRequest(`http://localhost${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      origin: "chrome-extension://abc",
    },
    body: JSON.stringify(body),
  });

const chain = (result: { data?: any; error?: any }) => {
  const query: any = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    maybeSingle: vi.fn(async () => result),
  };
  return query;
};

describe("/api/platform/v1/search", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
    process.env.PLATFORM_CATALOG_ACCESS_TOKEN = "catalog-token";
    process.env.PLATFORM_API_ALLOWED_ORIGINS = "chrome-extension://abc";
    delete process.env.PLATFORM_PRINCIPAL_TEST_LOOKUP;
    createClient.mockClear();
    getUser.mockReset();
    rpc.mockReset();
    from.mockReset();
    from.mockImplementation(() => chain({ data: null, error: null }));
  });

  test("returns grouped authenticated previews without lookup overlays", async () => {
    const { POST } = await import("@/app/api/platform/v1/search/route");
    getUser.mockResolvedValueOnce({
      data: { user: { id: "user-1" } },
      error: null,
    });
    rpc.mockResolvedValueOnce({ data: searchPayload, error: null });

    const response = await POST(
      request("/api/platform/v1/search", {
        query: " oog ",
        languageCode: "nl",
        dictionaryIds: ["dict-1", "dict-1"],
        limit: 6,
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("server-timing")).toEqual(
      expect.stringContaining("search.db"),
    );
    expect(rpc).toHaveBeenCalledWith("search_dictionary_groups_v1", {
      p_query: "oog",
      p_language_code: "nl",
      p_dictionary_ids: ["dict-1"],
      p_group: null,
      p_limit: 6,
      p_cursor: null,
    });

    const payload = await response.json();
    expect(payload).toEqual(searchPayload);
    expect(JSON.stringify(payload)).not.toContain("availableActions");
    expect(JSON.stringify(payload)).not.toContain("progressSummary");
    expect(payload.groups[0].items[0].entry.raw).toBeUndefined();
    expect(payload.groups[1].items[0].entry.raw).toBeUndefined();
  });

  test("passes group-specific pagination to the authenticated RPC", async () => {
    const { POST } = await import("@/app/api/platform/v1/search/route");
    getUser.mockResolvedValueOnce({
      data: { user: { id: "user-1" } },
      error: null,
    });
    rpc.mockResolvedValueOnce({
      data: {
        ...searchPayload,
        request: { languageCode: "nl", scope: "authenticated", group: "examples" },
        groups: [searchPayload.groups[1]],
      },
      error: null,
    });

    const response = await POST(
      request("/api/platform/v1/search", {
        query: "oog",
        languageCode: "nl",
        group: "examples",
        limit: 50,
        cursor: "cursor-1",
      }),
    );

    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("search_dictionary_groups_v1", {
      p_query: "oog",
      p_language_code: "nl",
      p_dictionary_ids: null,
      p_group: "examples",
      p_limit: 50,
      p_cursor: "cursor-1",
    });
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        groups: [searchPayload.groups[1]],
      }),
    );
  });

  test("maps grouped search readiness failures to 503", async () => {
    const { POST } = await import("@/app/api/platform/v1/search/route");
    getUser.mockResolvedValueOnce({
      data: { user: { id: "user-1" } },
      error: null,
    });
    rpc.mockResolvedValueOnce({
      data: {
        error: "search_index_not_ready",
        detail: "Grouped dictionary search index is not ready.",
      },
      error: null,
    });

    const response = await POST(
      request("/api/platform/v1/search", { query: "oog" }),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "search_index_not_ready",
      detail: "Grouped dictionary search index is not ready.",
    });
  });

  test("rejects invalid groups before calling the RPC", async () => {
    const { POST } = await import("@/app/api/platform/v1/search/route");
    getUser.mockResolvedValueOnce({
      data: { user: { id: "user-1" } },
      error: null,
    });

    const response = await POST(
      request("/api/platform/v1/search", {
        query: "oog",
        group: "related-headword",
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "invalid_search_group",
    });
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("/api/platform/v1/catalog/search", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
    process.env.PLATFORM_CATALOG_ACCESS_TOKEN = "catalog-token";
    process.env.PLATFORM_API_ALLOWED_ORIGINS = "chrome-extension://abc";
    createClient.mockClear();
    getUser.mockReset();
    rpc.mockReset();
    from.mockReset();
  });

  test("requires the dedicated catalog token", async () => {
    const { POST } = await import("@/app/api/platform/v1/catalog/search/route");

    const response = await POST(
      new NextRequest("http://localhost/api/platform/v1/catalog/search", {
        method: "POST",
        body: JSON.stringify({ query: "oog" }),
      }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "invalid_catalog_token",
    });
    expect(createClient).not.toHaveBeenCalled();
  });

  test("returns public catalog grouped search through the catalog RPC", async () => {
    const { POST } = await import("@/app/api/platform/v1/catalog/search/route");
    const catalogPayload = {
      ...searchPayload,
      request: { languageCode: "nl", scope: "public-catalog" },
    };
    rpc.mockResolvedValueOnce({ data: catalogPayload, error: null });

    const response = await POST(
      request(
        "/api/platform/v1/catalog/search",
        { query: "oog", languageCode: "nl", group: "headwords", limit: 3 },
        "catalog-token",
      ),
    );

    expect(response.status).toBe(200);
    expect(createClient).toHaveBeenCalledWith(
      "http://localhost:54321",
      "service-key",
      expect.objectContaining({
        auth: expect.objectContaining({ persistSession: false }),
      }),
    );
    expect(rpc).toHaveBeenCalledWith("search_public_dictionary_groups_v1", {
      p_query: "oog",
      p_language_code: "nl",
      p_group: "headwords",
      p_limit: 3,
      p_cursor: null,
    });
    await expect(response.json()).resolves.toEqual(catalogPayload);
  });

  test("maps public catalog readiness failures to 503", async () => {
    const { POST } = await import("@/app/api/platform/v1/catalog/search/route");
    rpc.mockResolvedValueOnce({
      data: {
        error: "search_index_not_ready",
        detail: "Grouped dictionary search index is not ready.",
      },
      error: null,
    });

    const response = await POST(
      request("/api/platform/v1/catalog/search", { query: "oog" }, "catalog-token"),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "search_index_not_ready",
      detail: "Grouped dictionary search index is not ready.",
    });
  });
});
