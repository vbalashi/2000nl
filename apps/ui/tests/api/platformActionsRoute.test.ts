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
    expect(rpc).toHaveBeenCalledWith("handle_card_review", {
      p_user_id: "user-1",
      p_entry_id: "entry-1",
      p_card_type_id: "word-to-definition",
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
    expect(rpc).toHaveBeenCalledWith("handle_card_review", {
      p_user_id: "user-1",
      p_entry_id: "entry-1",
      p_card_type_id: "definition-to-word",
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
    expect(rpc).toHaveBeenCalledWith("handle_card_review", {
      p_user_id: "user-1",
      p_entry_id: "entry-1",
      p_card_type_id: "word-to-definition",
      p_result: "easy",
      p_turn_id: "turn-1",
    });
  });

  test("starts learning through the explicit start_learning_entry_card RPC", async () => {
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
    expect(rpc).toHaveBeenCalledWith("start_learning_entry_card", {
      p_user_id: "user-1",
      p_entry_id: "entry-1",
      p_card_type_id: "word-to-definition",
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
        default_scenario_id: "listening",
        card_policy: "restrict",
        card_type_ids: ["listen-recognize"],
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
        defaultScenarioId: "listening",
        cardPolicy: "restrict",
        cardTypeIds: ["listen-recognize"],
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
      p_default_scenario_id: "listening",
      p_card_policy: "restrict",
      p_card_type_ids: ["listen-recognize"],
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
          defaultScenarioId: "listening",
          cardPolicy: "restrict",
          cardTypeIds: ["listen-recognize"],
          itemCount: 0,
        },
      }),
    );
  });

  test("rejects invalid user list training intent payloads before RPC", async () => {
    const { POST } = await import("@/app/api/platform/actions/route");
    mockAuthenticatedUser();

    const badPolicyResponse = await POST(
      request({
        action: "create-user-list",
        name: "Mine",
        cardPolicy: "sometimes",
      }),
    );

    expect(badPolicyResponse.status).toBe(400);

    mockAuthenticatedUser();
    const badCardTypesResponse = await POST(
      request({
        action: "update-user-list",
        listId: "list-1",
        cardTypeIds: "word-to-definition",
      }),
    );

    expect(badCardTypesResponse.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
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
        default_scenario_id: "understanding",
        card_policy: "prefer",
        card_type_ids: ["definition-to-word", "word-to-definition"],
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
        defaultScenarioId: "understanding",
        cardPolicy: "prefer",
        cardTypeIds: ["definition-to-word", "word-to-definition"],
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
      p_default_scenario_id: "understanding",
      p_card_policy: "prefer",
      p_card_type_ids: ["definition-to-word", "word-to-definition"],
      p_clear_default_scenario: false,
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
          defaultScenarioId: "understanding",
          cardPolicy: "prefer",
          cardTypeIds: ["definition-to-word", "word-to-definition"],
          itemCount: 3,
        },
      }),
    );
  });

  test("clears user list default scenario when null is explicit", async () => {
    const { POST } = await import("@/app/api/platform/actions/route");
    mockAuthenticatedUser();
    rpc.mockResolvedValueOnce({
      data: {
        id: "list-1",
        name: "Mine updated",
        description: null,
        language_code: "nl",
        primary_language_code: "nl",
        default_scenario_id: null,
        card_policy: "inherit",
        card_type_ids: null,
        created_at: "2026-05-18T10:00:00.000Z",
        user_word_list_items: [{ count: 3 }],
      },
      error: null,
    });

    const response = await POST(
      request({
        action: "update-user-list",
        listId: "list-1",
        defaultScenarioId: null,
      }),
    );

    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("update_user_word_list", {
      p_user_id: "user-1",
      p_list_id: "list-1",
      p_name: null,
      p_description: null,
      p_language_code: null,
      p_primary_language_code: null,
      p_default_scenario_id: null,
      p_card_policy: null,
      p_card_type_ids: null,
      p_clear_default_scenario: true,
    });
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
      "record_card_view",
      expect.anything(),
    );
  });

  test("reports gated entry lookup failures as server errors", async () => {
    const { POST } = await import("@/app/api/platform/actions/route");
    mockAuthenticatedUser();
    rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "function exploded" },
    });

    const response = await POST(
      request({
        action: "record-view",
        entryId: "entry-1",
        cardTypeId: "word-to-definition",
      }),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "entry_lookup_failed",
      detail: "function exploded",
    });
    expect(rpc).toHaveBeenCalledWith("fetch_dictionary_entry_by_id_gated", {
      p_word_id: "entry-1",
    });
    expect(rpc).not.toHaveBeenCalledWith(
      "record_card_view",
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
