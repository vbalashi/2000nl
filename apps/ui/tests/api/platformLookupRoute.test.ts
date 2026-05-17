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
  new NextRequest("http://localhost/api/platform/lookup", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

describe("/api/platform/lookup", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
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

  test("returns a read-only lookup payload with dictionary metadata and user state", async () => {
    const { POST } = await import("@/app/api/platform/lookup/route");
    getUser.mockResolvedValueOnce({
      data: { user: { id: "user-1" } },
      error: null,
    });
    rpc.mockResolvedValueOnce({
      data: {
        id: "entry-1",
        dictionary_id: "dict-1",
        language_code: "nl",
        headword: "huis",
        meaning_id: 1,
        part_of_speech: "zn",
        raw: { meanings: [{ definition: "gebouw" }] },
        is_nt2_2000: true,
        meanings_count: 1,
      },
      error: null,
    });
    from
      .mockImplementationOnce(() =>
        chain({
          data: {
            id: "dict-1",
            language_code: "nl",
            slug: "nl-vandale",
            name: "VanDale Dutch",
            kind: "curated",
            visibility: "system",
            schema_key: "nl-vandale-v1",
            schema_version: 1,
          },
          error: null,
        }),
      )
      .mockImplementationOnce(() =>
        chain({
          data: [
            {
              mode: "word-to-definition",
              click_count: 2,
              last_seen_at: "2026-05-17T10:00:00.000Z",
              last_reviewed_at: null,
              next_review_at: null,
              hidden: false,
              frozen_until: null,
              fsrs_stability: null,
              fsrs_difficulty: null,
              fsrs_reps: 0,
              fsrs_lapses: 0,
              fsrs_last_grade: null,
              fsrs_last_interval: null,
            },
          ],
          error: null,
        }),
      );

    const response = await POST(request({ query: " huis " }));

    expect(response.status).toBe(200);
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
    expect(payload.items[0].userStateByCardType["word-to-definition"]).toEqual(
      expect.objectContaining({
        entryId: "entry-1",
        clickCount: 2,
      }),
    );
  });
});
