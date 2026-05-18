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
  new NextRequest("http://localhost/api/platform/analyze-selection", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

function mockAuthenticatedUser() {
  getUser.mockResolvedValueOnce({
    data: { user: { id: "user-1" } },
    error: null,
  });
}

describe("/api/platform/analyze-selection", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    process.env.PLATFORM_API_ALLOWED_ORIGINS = "https://client.example";
    createClient.mockClear();
    getUser.mockReset();
    rpc.mockReset();
    from.mockReset();
  });

  test("is read-only when actions are omitted", async () => {
    const { POST } = await import("@/app/api/platform/analyze-selection/route");
    mockAuthenticatedUser();
    rpc.mockResolvedValueOnce({ data: null, error: null });

    const response = await POST(
      request({
        selection: "huis",
        includeUserState: false,
      }),
    );

    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("fetch_dictionary_entry_gated", {
      p_headword: "huis",
    });
    expect(from).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      lookup: { query: "huis", items: [] },
      actionResults: [],
    });
  });

  test("runs explicit actions only when provided", async () => {
    const { POST } = await import("@/app/api/platform/analyze-selection/route");
    mockAuthenticatedUser();
    rpc
      .mockResolvedValueOnce({
        data: [
          {
            id: "entry-1",
            dictionary_id: "dict-1",
            language_code: "nl",
            headword: "huis",
            meaning_id: 1,
            part_of_speech: "noun",
            gender: "n",
            raw: {},
            is_nt2_2000: true,
            meanings_count: 1,
            dictionary: {
              id: "dict-1",
              language_code: "nl",
              slug: "nl-vandale",
              name: "VanDale Dutch",
              kind: "curated",
              visibility: "public",
              owner_user_id: null,
              is_editable: false,
              schema_key: "nl-vandale-v1",
              schema_version: 1,
            },
          },
        ],
        error: null,
      })
      .mockResolvedValueOnce({
        data: { id: "entry-1", dictionary_id: "dict-1" },
        error: null,
      })
      .mockResolvedValueOnce({ data: null, error: null });

    const response = await POST(
      request({
        selection: "huis",
        includeUserState: false,
        actions: [
          {
            action: "start-learning",
            entryId: "entry-1",
            cardTypeId: "word-to-definition",
          },
        ],
      }),
    );

    expect(response.status).toBe(200);
    expect(from).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenLastCalledWith("start_learning_entry_card", {
      p_user_id: "user-1",
      p_entry_id: "entry-1",
      p_card_type_id: "word-to-definition",
    });
    const body = await response.json();
    expect(body.actionResults).toEqual([
      {
        status: 200,
        body: {
          ok: true,
          action: "start-learning",
          entryId: "entry-1",
          cardTypeId: "word-to-definition",
        },
      },
    ]);
    expect(body.lookup.items[0].entry.id).toBe("entry-1");
  });
});
