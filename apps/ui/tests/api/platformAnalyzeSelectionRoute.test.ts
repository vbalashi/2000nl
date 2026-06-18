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

const mutationRpcNames = [
  "record_card_view",
  "handle_card_review",
  "start_learning_entry_card",
  "add_entry_to_user_list",
  "remove_entries_from_user_list",
  "copy_entry_to_user_dictionary",
  "create_user_dictionary_entry",
  "update_user_dictionary_entry",
  "delete_user_dictionary_entry",
];

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
    for (const name of mutationRpcNames) {
      expect(rpc).not.toHaveBeenCalledWith(name, expect.anything());
    }
    await expect(response.json()).resolves.toEqual({
      lookup: {
        query: "huis",
        request: {
          languageCode: null,
          contextText: null,
          intent: null,
        },
        items: [],
      },
      actionResults: [],
    });
  });

  test("is read-only when actions are empty or not an array", async () => {
    const { POST } = await import("@/app/api/platform/analyze-selection/route");

    mockAuthenticatedUser();
    rpc.mockResolvedValueOnce({ data: null, error: null });

    const response = await POST(
      request({
        selection: "huis",
        includeUserState: false,
        actions: [],
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      lookup: {
        query: "huis",
        request: {
          languageCode: null,
          contextText: null,
          intent: null,
        },
        items: [],
      },
      actionResults: [],
    });

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("fetch_dictionary_entry_gated", {
      p_headword: "huis",
    });
    expect(from).not.toHaveBeenCalled();
    for (const name of mutationRpcNames) {
      expect(rpc).not.toHaveBeenCalledWith(name, expect.anything());
    }
  });

  test("rejects action blocks because analysis is read-only", async () => {
    const { POST } = await import("@/app/api/platform/analyze-selection/route");

    for (const actions of [{ action: "start-learning" }, [{ action: "start-learning" }]]) {
      mockAuthenticatedUser();

      const response = await POST(
        request({
          selection: "huis",
          includeUserState: false,
          actions,
        }),
      );

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({
        error: "analyze_selection_is_read_only",
        actionsEndpoint: "/api/platform/actions",
      });
    }

    expect(rpc).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });

  test("does not run explicit actions from analyze-selection", async () => {
    const { POST } = await import("@/app/api/platform/analyze-selection/route");
    mockAuthenticatedUser();

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

    expect(response.status).toBe(400);
    expect(rpc).not.toHaveBeenCalledWith("start_learning_entry_card", expect.anything());
    expect(from).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      error: "analyze_selection_is_read_only",
      actionsEndpoint: "/api/platform/actions",
    });
  });
});
