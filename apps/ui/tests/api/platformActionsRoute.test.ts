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
    insert: vi.fn(async () => result),
    upsert: vi.fn(async () => result),
    then: (resolve: any, reject: any) =>
      Promise.resolve(result).then(resolve, reject),
  };
  return query;
};

const request = (body: unknown, token = "token-1") =>
  new NextRequest("http://localhost/api/platform/actions", {
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

function mockAccessibleEntry() {
  rpc.mockResolvedValueOnce({
    data: { id: "entry-1", dictionary_id: "dict-1" },
    error: null,
  });
}

describe("/api/platform/actions", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    process.env.PLATFORM_API_ALLOWED_ORIGINS = "https://client.example";
    createClient.mockClear();
    getUser.mockReset();
    rpc.mockReset();
    from.mockReset();
  });

  test("records explicit review-card actions", async () => {
    const { POST } = await import("@/app/api/platform/actions/route");
    mockAuthenticatedUser();
    mockAccessibleEntry();
    rpc.mockResolvedValueOnce({ data: null, error: null });

    const response = await POST(
      request({
        action: "review-card",
        entryId: "entry-1",
        cardTypeId: "word-to-definition",
        result: "success",
        turnId: "8b9df84e-7956-4712-a39a-3ea8363be1cf",
      }),
    );

    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("handle_review", {
      p_user_id: "user-1",
      p_word_id: "entry-1",
      p_mode: "word-to-definition",
      p_result: "success",
      p_turn_id: "8b9df84e-7956-4712-a39a-3ea8363be1cf",
    });
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        ok: true,
        action: "review-card",
        result: "success",
      }),
    );
  });

  test("answers CORS preflight for configured origins", async () => {
    const { OPTIONS } = await import("@/app/api/platform/actions/route");

    const response = OPTIONS(
      new NextRequest("http://localhost/api/platform/actions", {
        method: "OPTIONS",
        headers: {
          origin: "https://client.example",
        },
      }),
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe(
      "https://client.example",
    );
  });

  test("maps mark-unknown to an explicit fail review", async () => {
    const { POST } = await import("@/app/api/platform/actions/route");
    mockAuthenticatedUser();
    mockAccessibleEntry();
    rpc.mockResolvedValueOnce({ data: null, error: null });

    const response = await POST(
      request({
        action: "mark-unknown",
        entryId: "entry-1",
        cardTypeId: "definition-to-word",
      }),
    );

    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("handle_review", {
      p_user_id: "user-1",
      p_word_id: "entry-1",
      p_mode: "definition-to-word",
      p_result: "fail",
      p_turn_id: null,
    });
  });

  test("maps mark-known to an explicit easy review", async () => {
    const { POST } = await import("@/app/api/platform/actions/route");
    mockAuthenticatedUser();
    mockAccessibleEntry();
    rpc.mockResolvedValueOnce({ data: null, error: null });

    const response = await POST(
      request({
        action: "mark-known",
        entryId: "entry-1",
        cardTypeId: "word-to-definition",
        turnId: "turn-1",
      }),
    );

    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("handle_review", {
      p_user_id: "user-1",
      p_word_id: "entry-1",
      p_mode: "word-to-definition",
      p_result: "easy",
      p_turn_id: "turn-1",
    });
  });

  test("starts learning through the explicit start_learning_card RPC", async () => {
    const { POST } = await import("@/app/api/platform/actions/route");
    mockAuthenticatedUser();
    mockAccessibleEntry();
    rpc.mockResolvedValueOnce({ data: null, error: null });

    const response = await POST(
      request({
        action: "start-learning",
        entryId: "entry-1",
        cardTypeId: "word-to-definition",
      }),
    );

    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("start_learning_card", {
      p_user_id: "user-1",
      p_word_id: "entry-1",
      p_mode: "word-to-definition",
    });
  });

  test("adds accessible entries to owned user lists", async () => {
    const { POST } = await import("@/app/api/platform/actions/route");
    mockAuthenticatedUser();
    mockAccessibleEntry();
    rpc.mockResolvedValueOnce({ data: null, error: null });

    const response = await POST(
      request({
        action: "add-to-list",
        entryId: "entry-1",
        listId: "list-1",
      }),
    );

    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("add_entry_to_user_list", {
      p_user_id: "user-1",
      p_list_id: "list-1",
      p_word_id: "entry-1",
    });
  });

  test("removes accessible entries from owned user lists", async () => {
    const { POST } = await import("@/app/api/platform/actions/route");
    mockAuthenticatedUser();
    rpc.mockResolvedValueOnce({ data: null, error: null });

    const response = await POST(
      request({
        action: "remove-from-list",
        entryId: "entry-1",
        listId: "list-1",
      }),
    );

    expect(response.status).toBe(200);
    expect(from).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith("remove_entries_from_user_list", {
      p_user_id: "user-1",
      p_list_id: "list-1",
      p_word_ids: ["entry-1"],
    });
    await expect(response.json()).resolves.toEqual({
      ok: true,
      action: "remove-from-list",
      entryId: "entry-1",
      listId: "list-1",
    });
  });

  test("creates user lists through the explicit RPC", async () => {
    const { POST } = await import("@/app/api/platform/actions/route");
    mockAuthenticatedUser();
    rpc.mockResolvedValueOnce({
      data: {
        id: "list-1",
        name: "Mine",
        description: "Personal words",
        language_code: "nl",
        primary_language_code: "nl",
        created_at: "2026-05-18T10:00:00.000Z",
        user_word_list_items: [{ count: 0 }],
      },
      error: null,
    });

    const response = await POST(
      request({
        action: "create-user-list",
        name: "Mine",
        description: "Personal words",
        languageCode: "nl",
      }),
    );

    expect(response.status).toBe(200);
    expect(from).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith("create_user_word_list", {
      p_user_id: "user-1",
      p_name: "Mine",
      p_description: "Personal words",
      p_language_code: "nl",
      p_primary_language_code: "nl",
    });
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        ok: true,
        action: "create-user-list",
        listId: "list-1",
        list: {
          id: "list-1",
          kind: "user",
          name: "Mine",
          description: "Personal words",
          primaryLanguageCode: "nl",
          itemCount: 0,
        },
      }),
    );
  });

  test("deletes user lists through the explicit RPC", async () => {
    const { POST } = await import("@/app/api/platform/actions/route");
    mockAuthenticatedUser();
    rpc.mockResolvedValueOnce({ data: null, error: null });

    const response = await POST(
      request({
        action: "delete-user-list",
        listId: "list-1",
      }),
    );

    expect(response.status).toBe(200);
    expect(from).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith("delete_user_word_list", {
      p_user_id: "user-1",
      p_list_id: "list-1",
    });
  });

  test("updates user lists through the explicit RPC", async () => {
    const { POST } = await import("@/app/api/platform/actions/route");
    mockAuthenticatedUser();
    rpc.mockResolvedValueOnce({
      data: {
        id: "list-1",
        name: "Mine updated",
        description: "Updated words",
        language_code: "nl",
        primary_language_code: "nl",
        created_at: "2026-05-18T10:00:00.000Z",
        user_word_list_items: [{ count: 3 }],
      },
      error: null,
    });

    const response = await POST(
      request({
        action: "update-user-list",
        listId: "list-1",
        name: "Mine updated",
        description: "Updated words",
        languageCode: "nl",
      }),
    );

    expect(response.status).toBe(200);
    expect(from).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith("update_user_word_list", {
      p_user_id: "user-1",
      p_list_id: "list-1",
      p_name: "Mine updated",
      p_description: "Updated words",
      p_language_code: "nl",
      p_primary_language_code: "nl",
    });
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        ok: true,
        action: "update-user-list",
        listId: "list-1",
        list: {
          id: "list-1",
          kind: "user",
          name: "Mine updated",
          description: "Updated words",
          primaryLanguageCode: "nl",
          itemCount: 3,
        },
      }),
    );
  });

  test("copies accessible entries to a user dictionary", async () => {
    const { POST } = await import("@/app/api/platform/actions/route");
    mockAuthenticatedUser();
    mockAccessibleEntry();
    rpc.mockResolvedValueOnce({ data: "copy-1", error: null });

    const response = await POST(
      request({
        action: "copy-to-user-dictionary",
        entryId: "entry-1",
        overrides: {
          translation: {
            languageCode: "en",
            text: "house",
          },
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("copy_entry_to_user_dictionary", {
      p_user_id: "user-1",
      p_source_word_id: "entry-1",
      p_target_dictionary_id: null,
      p_overrides: {
        translation: {
          languageCode: "en",
          text: "house",
        },
      },
    });
    await expect(response.json()).resolves.toEqual({
      ok: true,
      action: "copy-to-user-dictionary",
      entryId: "entry-1",
      copiedEntryId: "copy-1",
      targetDictionaryId: null,
    });
  });

  test("creates user dictionary entries without requiring an existing entry id", async () => {
    const { POST } = await import("@/app/api/platform/actions/route");
    mockAuthenticatedUser();
    rpc.mockResolvedValueOnce({ data: "created-entry-1", error: null });

    const response = await POST(
      request({
        action: "create-user-entry",
        entry: {
          headword: "gedoe",
          languageCode: "nl",
          translation: {
            languageCode: "en",
            text: "hassle",
          },
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(from).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith("create_user_dictionary_entry", {
      p_user_id: "user-1",
      p_dictionary_id: null,
      p_entry: {
        headword: "gedoe",
        languageCode: "nl",
        translation: {
          languageCode: "en",
          text: "hassle",
        },
      },
    });
    await expect(response.json()).resolves.toEqual({
      ok: true,
      action: "create-user-entry",
      entryId: "created-entry-1",
      dictionaryId: null,
    });
  });

  test("updates user dictionary entries through the explicit RPC", async () => {
    const { POST } = await import("@/app/api/platform/actions/route");
    mockAuthenticatedUser();
    rpc.mockResolvedValueOnce({ data: "entry-1", error: null });

    const response = await POST(
      request({
        action: "update-user-entry",
        entryId: "entry-1",
        entry: {
          headword: "gedoe",
          languageCode: "nl",
          definition: "updated definition",
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(from).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith("update_user_dictionary_entry", {
      p_user_id: "user-1",
      p_word_id: "entry-1",
      p_entry: {
        headword: "gedoe",
        languageCode: "nl",
        definition: "updated definition",
      },
    });
  });

  test("deletes user dictionary entries through the explicit RPC", async () => {
    const { POST } = await import("@/app/api/platform/actions/route");
    mockAuthenticatedUser();
    rpc.mockResolvedValueOnce({ data: null, error: null });

    const response = await POST(
      request({
        action: "delete-user-entry",
        entryId: "entry-1",
      }),
    );

    expect(response.status).toBe(200);
    expect(from).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith("delete_user_dictionary_entry", {
      p_user_id: "user-1",
      p_word_id: "entry-1",
    });
  });

  test("rejects inaccessible entries before mutating", async () => {
    const { POST } = await import("@/app/api/platform/actions/route");
    mockAuthenticatedUser();
    rpc.mockResolvedValueOnce({ data: null, error: null });

    const response = await POST(
      request({
        action: "record-view",
        entryId: "entry-1",
        cardTypeId: "word-to-definition",
      }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "entry_not_accessible",
    });
    expect(rpc).toHaveBeenCalledWith("fetch_dictionary_entry_by_id_gated", {
      p_word_id: "entry-1",
    });
    expect(rpc).not.toHaveBeenCalledWith(
      "record_word_view",
      expect.anything(),
    );
  });

  test("rejects unsupported actions without touching Supabase tables", async () => {
    const { POST } = await import("@/app/api/platform/actions/route");
    mockAuthenticatedUser();

    const response = await POST(
      request({
        action: "passive-lookup",
        entryId: "entry-1",
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "unsupported_action",
    });
    expect(from).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });
});
