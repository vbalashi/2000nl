import { beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";

const from = vi.fn();
const createClient = vi.fn(() => ({
  from,
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

function queryChain(result: { data?: any; error?: any }) {
  const query: any = {
    select: vi.fn(() => query),
    ilike: vi.fn(() => query),
    in: vi.fn(() => query),
    eq: vi.fn(() => query),
    limit: vi.fn(() => query),
    then: (resolve: any, reject: any) =>
      Promise.resolve(result).then(resolve, reject),
  };
  return query;
}

describe("/api/platform/v1/catalog/lookup", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
    process.env.PLATFORM_CATALOG_ACCESS_TOKEN = "catalog-token";
    process.env.PLATFORM_API_ALLOWED_ORIGINS = "chrome-extension://abc";
    createClient.mockClear();
    from.mockReset();
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
    const query = queryChain({
      data: [
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
      error: null,
    });
    from.mockReturnValue(query);

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
    expect(from).toHaveBeenCalledWith("word_entries");
    expect(query.ilike).toHaveBeenCalledWith("headword", "huis");
    expect(query.in).toHaveBeenCalledWith("dictionary.visibility", [
      "system",
      "public",
    ]);
    expect(query.eq).toHaveBeenCalledWith("language_code", "nl");

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
});
