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

function mockConnectedClientPrincipal(
  scopes: string[],
  options: { sessionRevoked?: boolean; clientStatus?: string; grantRevoked?: boolean } = {},
) {
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
  process.env.PLATFORM_PRINCIPAL_TEST_LOOKUP = "1";
  from.mockImplementation((table: string) => {
    if (table === "connected_client_sessions") {
      return chain({
        data: {
          id: "session-1",
          client_id: "audiofilms_chrome",
          user_id: "user-1",
          scopes,
          revoked_at: options.sessionRevoked ? new Date().toISOString() : null,
          access_token_expires_at: new Date(Date.now() + 60_000).toISOString(),
        },
        error: null,
      });
    }
    if (table === "connected_clients") {
      return chain({
        data: { client_id: "audiofilms_chrome", status: options.clientStatus ?? "active" },
        error: null,
      });
    }
    if (table === "connected_client_grants") {
      return chain({
        data: {
          scopes,
          revoked_at: options.grantRevoked ? new Date().toISOString() : null,
        },
        error: null,
      });
    }
    return chain({ data: null, error: null });
  });
}

describe("/api/platform/actions", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    process.env.PLATFORM_API_ALLOWED_ORIGINS = "https://client.example";
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.PLATFORM_PRINCIPAL_TEST_LOOKUP;
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

  test.each([
    {
      action: "review-card",
      requestResult: "success",
      rpcResult: "success",
    },
    {
      action: "mark-known",
      requestResult: undefined,
      rpcResult: "easy",
    },
    {
      action: "mark-unknown",
      requestResult: undefined,
      rpcResult: "fail",
    },
  ])("passes the same turnId through on repeated $action retries", async ({
    action,
    requestResult,
    rpcResult,
  }) => {
    const { POST } = await import("@/app/api/platform/actions/route");
    const body = {
      action,
      entryId: "entry-1",
      cardTypeId: "word-to-definition",
      ...(requestResult ? { result: requestResult } : {}),
      turnId: "8b9df84e-7956-4712-a39a-3ea8363be1cf",
    };
    mockAuthenticatedUser();
    mockAccessibleEntry();
    rpc.mockResolvedValueOnce({ data: null, error: null });

    const firstResponse = await POST(request(body));

    mockAuthenticatedUser();
    mockAccessibleEntry();
    rpc.mockResolvedValueOnce({ data: null, error: null });

    const retryResponse = await POST(request(body));

    expect(firstResponse.status).toBe(200);
    expect(retryResponse.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("handle_card_review", {
      p_user_id: "user-1",
      p_entry_id: "entry-1",
      p_card_type_id: "word-to-definition",
      p_result: rpcResult,
      p_turn_id: "8b9df84e-7956-4712-a39a-3ea8363be1cf",
    });
    expect(
      rpc.mock.calls.filter(([name]) => name === "handle_card_review"),
    ).toHaveLength(2);
    await expect(firstResponse.json()).resolves.toEqual({
      ok: true,
      action,
      entryId: "entry-1",
      cardTypeId: "word-to-definition",
      result: rpcResult,
      turnId: "8b9df84e-7956-4712-a39a-3ea8363be1cf",
    });
    await expect(retryResponse.json()).resolves.toEqual({
      ok: true,
      action,
      entryId: "entry-1",
      cardTypeId: "word-to-definition",
      result: rpcResult,
      turnId: "8b9df84e-7956-4712-a39a-3ea8363be1cf",
    });
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

  test("records provenance-aware start-learning through the atomic platform action RPC", async () => {
    const { POST } = await import("@/app/api/platform/actions/route");
    mockAuthenticatedUser();
    mockAccessibleEntry();
    rpc.mockResolvedValueOnce({
      data: {
        status: "accepted",
        eventId: "event-1",
        sourceId: "source-1",
        locationId: "location-1",
      },
      error: null,
    });

    const response = await POST(
      request({
        action: "start-learning",
        entryId: "entry-1",
        cardTypeId: "word-to-definition",
        clientEventId: "8b9df84e-7956-4712-a39a-3ea8363be1cf",
        sourceContext: {
          contractVersion: "source-context-v1",
          client: { id: "audiofilms-youtube-extension" },
          source: {
            kind: "youtube_video",
            provider: "youtube",
            externalId: "4EE7m94mJpk",
            url: "https://www.youtube.com/watch?v=4EE7m94mJpk",
          },
          location: {
            kind: "caption_phrase",
            phraseIndex: 12,
            startMs: 54210,
            endMs: 58100,
          },
          context: {
            clickedForm: "huis",
            text: "Ik ga naar huis.",
          },
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("perform_platform_card_action", {
      p_user_id: "user-1",
      p_entry_id: "entry-1",
      p_card_type_id: "word-to-definition",
      p_action: "start-learning",
      p_result: null,
      p_turn_id: null,
      p_client_event_id: "8b9df84e-7956-4712-a39a-3ea8363be1cf",
      p_source_context: expect.objectContaining({
        contractVersion: "source-context-v1",
      }),
      p_auth_kind: "first_party",
      p_connected_client_id: null,
    });
    expect(rpc).not.toHaveBeenCalledWith(
      "start_learning_entry_card",
      expect.anything(),
    );
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        ok: true,
        action: "start-learning",
        clientEventId: "8b9df84e-7956-4712-a39a-3ea8363be1cf",
        provenance: {
          status: "accepted",
          eventId: "event-1",
          sourceId: "source-1",
          locationId: "location-1",
        },
      }),
    );
  });

  test("blocks connected clients without platform:write from mutating cards", async () => {
    const { POST } = await import("@/app/api/platform/actions/route");
    mockAuthenticatedUser();
    mockConnectedClientPrincipal(["platform:read"]);

    const response = await POST(
      request({
        action: "start-learning",
        entryId: "entry-1",
        cardTypeId: "word-to-definition",
      }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "insufficient_scope",
      requiredScope: "platform:write",
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  test("rejects revoked connected-client sessions before mutations", async () => {
    const { POST } = await import("@/app/api/platform/actions/route");
    mockAuthenticatedUser();
    mockConnectedClientPrincipal(["platform:read", "platform:write"], {
      sessionRevoked: true,
    });

    const response = await POST(
      request({
        action: "start-learning",
        entryId: "entry-1",
        cardTypeId: "word-to-definition",
      }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "connected_client_session_revoked",
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  test("rejects disabled connected clients before mutations", async () => {
    const { POST } = await import("@/app/api/platform/actions/route");
    mockAuthenticatedUser();
    mockConnectedClientPrincipal(["platform:read", "platform:write"], {
      clientStatus: "disabled",
    });

    const response = await POST(
      request({
        action: "start-learning",
        entryId: "entry-1",
        cardTypeId: "word-to-definition",
      }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "connected_client_disabled",
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  test("persists connected-client actor from the authenticated principal", async () => {
    const { performPlatformAction } = await import("@/lib/platform/platformApi");
    rpc.mockImplementation((name: string) => {
      if (name === "fetch_dictionary_entry_by_id_gated") {
        return Promise.resolve({
          data: { id: "entry-1", dictionary_id: "dict-1" },
          error: null,
        });
      }
      if (name === "perform_platform_card_action") {
        return Promise.resolve({
          data: {
            status: "accepted",
            eventId: "event-1",
            authKind: "connected_client",
            connectedClientId: "audiofilms_chrome",
          },
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: null });
    });

    const result = await performPlatformAction(
      {
        supabase: { rpc } as any,
        user: { id: "user-1" } as any,
        principal: {
          userId: "user-1",
          authKind: "connected_client",
          connectedClientId: "audiofilms_chrome",
          connectedSessionId: "session-1",
          scopes: new Set(["platform:read", "platform:write"]),
        },
      },
      {
        action: "record-view",
        entryId: "entry-1",
        cardTypeId: "word-to-definition",
        clientEventId: "client-event-1",
        sourceContext: {
          client: { version: "1.2.3" },
          source: { kind: "youtube_video", provider: "youtube" },
        },
      },
    );

    expect(result.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("perform_platform_card_action", {
      p_user_id: "user-1",
      p_entry_id: "entry-1",
      p_card_type_id: "word-to-definition",
      p_action: "record-view",
      p_result: null,
      p_turn_id: null,
      p_client_event_id: "client-event-1",
      p_source_context: expect.objectContaining({
        client: { version: "1.2.3" },
      }),
      p_auth_kind: "connected_client",
      p_connected_client_id: "audiofilms_chrome",
    });
  });

  test("rejects connected-client sourceContext client spoofing", async () => {
    const { performPlatformAction } = await import("@/lib/platform/platformApi");

    const result = await performPlatformAction(
      {
        supabase: { rpc } as any,
        user: { id: "user-1" } as any,
        principal: {
          userId: "user-1",
          authKind: "connected_client",
          connectedClientId: "audiofilms_chrome",
          connectedSessionId: "session-1",
          scopes: new Set(["platform:read", "platform:write"]),
        },
      },
      {
        action: "record-view",
        entryId: "entry-1",
        cardTypeId: "word-to-definition",
        clientEventId: "client-event-1",
        sourceContext: {
          client: { id: "other-client" },
          source: { kind: "youtube_video", provider: "youtube" },
        },
      },
    );

    expect(result.status).toBe(403);
    expect(result.payload).toEqual({
      error: "client_identity_mismatch",
      detail: "sourceContext.client.id must match the authenticated Connected Client.",
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  test("maps repeated provenance action retries to a duplicate response without legacy mutation calls", async () => {
    const { POST } = await import("@/app/api/platform/actions/route");
    mockAuthenticatedUser();
    mockAccessibleEntry();
    rpc.mockResolvedValueOnce({
      data: {
        status: "duplicate",
        eventId: "event-1",
        sourceId: "source-1",
        locationId: "location-1",
      },
      error: null,
    });

    const response = await POST(
      request({
        action: "record-view",
        entryId: "entry-1",
        cardTypeId: "word-to-definition",
        clientEventId: "client-event-1",
      }),
    );

    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("perform_platform_card_action", {
      p_user_id: "user-1",
      p_entry_id: "entry-1",
      p_card_type_id: "word-to-definition",
      p_action: "record-view",
      p_result: null,
      p_turn_id: null,
      p_client_event_id: "client-event-1",
      p_source_context: null,
      p_auth_kind: "first_party",
      p_connected_client_id: null,
    });
    expect(rpc).not.toHaveBeenCalledWith("record_card_view", expect.anything());
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        ok: true,
        action: "record-view",
        provenance: expect.objectContaining({ status: "duplicate" }),
      }),
    );
  });

  test("rejects provenance source context without a client event id", async () => {
    const { POST } = await import("@/app/api/platform/actions/route");
    mockAuthenticatedUser();

    const response = await POST(
      request({
        action: "start-learning",
        entryId: "entry-1",
        cardTypeId: "word-to-definition",
        sourceContext: {
          source: { kind: "youtube_video", provider: "youtube" },
        },
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "missing_client_event_id",
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  test("normalizes source-context-v2 before calling the atomic action RPC", async () => {
    const { POST } = await import("@/app/api/platform/actions/route");
    mockAuthenticatedUser();
    mockAccessibleEntry();
    rpc.mockResolvedValueOnce({
      data: {
        status: "accepted",
        eventId: "event-1",
        sourceId: "source-1",
        locationId: "location-1",
        artifactId: "artifact-1",
      },
      error: null,
    });

    const response = await POST(
      request({
        action: "start-learning",
        entryId: "entry-1",
        cardTypeId: "word-to-definition",
        clientEventId: "8b9df84e-7956-4712-a39a-3ea8363be1cf",
        sourceContext: {
          contractVersion: "source-context-v2",
          source: {
            kind: "youtube_video",
            provider: "youtube",
            externalId: "4EE7m94mJpk",
            url: "https://youtu.be/ignored",
            title: "Ignored volatile title",
            languageCode: "NL",
          },
          artifact: {
            artifactKind: "caption_phrase_set",
            producer: "audiofilms_backend",
            phraseSetRevisionId: "phrases-v1",
            timingEvidenceRevisionId: "timing-v1",
            builderVersion: "builder-1",
            languageCode: "nl",
            quality: "aligned",
          },
          location: {
            kind: "caption_phrase",
            phraseIndex: 12,
            startMs: 54210,
            endMs: 58100,
            locatorConfidence: "canonical",
          },
          selection: {
            clickedForm: "huis",
            tokenIndex: 3,
            charStart: 11,
            charEnd: 15,
            contextText: "Ik ga naar huis.",
          },
          observation: {
            title: "Volatile current page title",
            currentPlaybackTimeMs: 55000,
          },
          diagnostics: {
            warnings: ["ignored"],
          },
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("perform_platform_card_action", {
      p_user_id: "user-1",
      p_entry_id: "entry-1",
      p_card_type_id: "word-to-definition",
      p_action: "start-learning",
      p_result: null,
      p_turn_id: null,
      p_client_event_id: "8b9df84e-7956-4712-a39a-3ea8363be1cf",
      p_source_context: {
        contractVersion: "source-context-v2",
        source: {
          kind: "youtube_video",
          provider: "youtube",
          externalId: "4EE7m94mJpk",
          url: "https://www.youtube.com/watch?v=4EE7m94mJpk",
          languageCode: "nl",
        },
        artifact: {
          artifactKind: "caption_phrase_set",
          producer: "audiofilms_backend",
          phraseSetRevisionId: "phrases-v1",
          timingEvidenceRevisionId: "timing-v1",
          builderVersion: "builder-1",
          languageCode: "nl",
          quality: "aligned",
        },
        location: {
          kind: "caption_phrase",
          phraseIndex: 12,
          startMs: 54210,
          endMs: 58100,
          locatorConfidence: "canonical",
        },
        selection: {
          clickedForm: "huis",
          tokenIndex: 3,
          charStart: 11,
          charEnd: 15,
        },
        context: {
          clickedForm: "huis",
          text: "Ik ga naar huis.",
        },
      },
      p_auth_kind: "first_party",
      p_connected_client_id: null,
    });
  });

  test("strips volatile source-context-v2 observation and diagnostics before RPC", async () => {
    const { POST } = await import("@/app/api/platform/actions/route");
    mockAuthenticatedUser();
    mockAccessibleEntry();
    rpc.mockResolvedValueOnce({
      data: { status: "duplicate", eventId: "event-1" },
      error: null,
    });

    const response = await POST(
      request({
        action: "start-learning",
        entryId: "entry-1",
        cardTypeId: "word-to-definition",
        clientEventId: "8b9df84e-7956-4712-a39a-3ea8363be1cf",
        sourceContext: {
          contractVersion: "source-context-v2",
          source: {
            kind: "youtube_video",
            provider: "youtube",
            externalId: "4EE7m94mJpk",
          },
          location: {
            kind: "caption_phrase",
            phraseIndex: 12,
          },
          observation: {
            title: "volatile",
            currentPlaybackTimeMs: 12345,
          },
          diagnostics: {
            warnings: ["volatile"],
          },
        },
      }),
    );

    expect(response.status).toBe(200);
    const call = rpc.mock.calls.find(
      ([name]) => name === "perform_platform_card_action",
    );
    expect(call?.[1].p_source_context).toEqual({
      contractVersion: "source-context-v2",
      source: {
        kind: "youtube_video",
        provider: "youtube",
        externalId: "4EE7m94mJpk",
        url: "https://www.youtube.com/watch?v=4EE7m94mJpk",
      },
      location: {
        kind: "caption_phrase",
        phraseIndex: 12,
      },
    });
  });

  test.each([
    ["unsupported_source_kind", { source: { kind: "web_page", provider: "browser" } }],
    [
      "invalid_source_timing",
      {
        source: { kind: "youtube_video", provider: "youtube", externalId: "4EE7m94mJpk" },
        location: { kind: "caption_phrase", startMs: 2000, endMs: 1000 },
      },
    ],
  ])("rejects invalid source-context-v2 with %s", async (error, partialContext) => {
    const { POST } = await import("@/app/api/platform/actions/route");
    mockAuthenticatedUser();

    const response = await POST(
      request({
        action: "start-learning",
        entryId: "entry-1",
        cardTypeId: "word-to-definition",
        clientEventId: "8b9df84e-7956-4712-a39a-3ea8363be1cf",
        sourceContext: {
          contractVersion: "source-context-v2",
          ...partialContext,
        },
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error });
    expect(rpc).not.toHaveBeenCalled();
  });

  test("requires v2 review clientEventId to be a UUID and match turnId", async () => {
    const { POST } = await import("@/app/api/platform/actions/route");
    mockAuthenticatedUser();
    const sourceContext = {
      contractVersion: "source-context-v2",
      source: { kind: "youtube_video", provider: "youtube", externalId: "4EE7m94mJpk" },
    };

    const nonUuidResponse = await POST(
      request({
        action: "review-card",
        entryId: "entry-1",
        cardTypeId: "word-to-definition",
        result: "success",
        clientEventId: "client-event-1",
        sourceContext,
      }),
    );

    expect(nonUuidResponse.status).toBe(400);
    await expect(nonUuidResponse.json()).resolves.toEqual({
      error: "v2_client_event_id_must_be_uuid",
    });

    mockAuthenticatedUser();
    const mismatchResponse = await POST(
      request({
        action: "review-card",
        entryId: "entry-1",
        cardTypeId: "word-to-definition",
        result: "success",
        clientEventId: "8b9df84e-7956-4712-a39a-3ea8363be1cf",
        turnId: "9b9df84e-7956-4712-a39a-3ea8363be1cf",
        sourceContext,
      }),
    );

    expect(mismatchResponse.status).toBe(400);
    await expect(mismatchResponse.json()).resolves.toEqual({
      error: "v2_turn_id_mismatch",
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  test("returns conflict when v2 review turn was already consumed", async () => {
    const { POST } = await import("@/app/api/platform/actions/route");
    mockAuthenticatedUser();
    mockAccessibleEntry();
    rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "platform_review_turn_already_consumed" },
    });

    const response = await POST(
      request({
        action: "review-card",
        entryId: "entry-1",
        cardTypeId: "word-to-definition",
        result: "success",
        clientEventId: "8b9df84e-7956-4712-a39a-3ea8363be1cf",
        sourceContext: {
          contractVersion: "source-context-v2",
          source: {
            kind: "youtube_video",
            provider: "youtube",
            externalId: "4EE7m94mJpk",
          },
        },
      }),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "review_turn_already_consumed",
      detail: "platform_review_turn_already_consumed",
    });
  });

  test("returns idempotency conflict when a client event id is reused with a different payload", async () => {
    const { POST } = await import("@/app/api/platform/actions/route");
    mockAuthenticatedUser();
    mockAccessibleEntry();
    rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "platform_action_idempotency_conflict" },
    });

    const response = await POST(
      request({
        action: "start-learning",
        entryId: "entry-1",
        cardTypeId: "word-to-definition",
        clientEventId: "client-event-1",
      }),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "idempotency_conflict",
      detail: "platform_action_idempotency_conflict",
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
      p_entry_id: "entry-1",
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
      p_entry_ids: ["entry-1"],
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
      p_source_entry_id: "entry-1",
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

  test("fetches an accessible entry by id", async () => {
    const { POST } = await import("@/app/api/platform/actions/route");
    mockAuthenticatedUser();
    rpc.mockResolvedValueOnce({
      data: {
        id: "entry-1",
        dictionary_id: "dict-user",
        dictionary_name: "My dictionary",
        dictionary_kind: "user",
        headword: "gedoe",
        raw: { definition: "private definition" },
      },
      error: null,
    });

    const response = await POST(
      request({
        action: "fetch-entry",
        entryId: "entry-1",
      }),
    );

    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("fetch_dictionary_entry_by_id_gated", {
      p_entry_id: "entry-1",
    });
    await expect(response.json()).resolves.toEqual({
      ok: true,
      action: "fetch-entry",
      entryId: "entry-1",
      entry: {
        id: "entry-1",
        dictionary_id: "dict-user",
        dictionary_name: "My dictionary",
        dictionary_kind: "user",
        headword: "gedoe",
        raw: { definition: "private definition" },
      },
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
      p_entry_id: "entry-1",
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
      p_entry_id: "entry-1",
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
      p_entry_id: "entry-1",
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
      p_entry_id: "entry-1",
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
