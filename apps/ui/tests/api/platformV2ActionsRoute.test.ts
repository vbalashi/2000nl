import { beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";

const rpc = vi.fn();
const getUser = vi.fn();
const createClient = vi.fn(() => ({
  auth: { getUser },
  rpc,
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient,
}));

const request = (body: unknown) =>
  new NextRequest("http://localhost/api/platform/v2/actions", {
    method: "POST",
    headers: {
      authorization: "Bearer user-token",
      "content-type": "application/json",
      origin: "chrome-extension://abc",
    },
    body: JSON.stringify(body),
  });

describe("/api/platform/v2/actions", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    process.env.PLATFORM_API_ALLOWED_ORIGINS = "chrome-extension://abc";
    process.env.PLATFORM_V2_ACTIONS_ENABLED = "1";
    delete process.env.PLATFORM_PRINCIPAL_TEST_LOOKUP;
    getUser.mockReset();
    rpc.mockReset();
    getUser.mockResolvedValue({
      data: { user: { id: "00000000-0000-4000-8000-000000000001" } },
      error: null,
    });
  });

  test("stays fail-closed until the V2 action boundary is enabled", async () => {
    delete process.env.PLATFORM_V2_ACTIONS_ENABLED;
    const { POST } = await import("@/app/api/platform/v2/actions/route");

    const response = await POST(
      request({
        actionId: "mark-known",
        clientEventId: "00000000-0000-4000-8000-000000000002",
        target: {
          kind: "sense-card",
          entryId: "00000000-0000-4000-8000-000000000003",
          cardTypeId: "word-to-definition",
          stateRevision: "untracked",
        },
      }),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "platform_v2_actions_not_enabled",
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  test("accepts Mark Known through the exact revision-checked RPC", async () => {
    rpc.mockResolvedValueOnce({
      data: {
        status: "accepted",
        actionId: "mark-known",
        clientEventId: "00000000-0000-4000-8000-000000000002",
        card: {
          cardTypeId: "word-to-definition",
          scheduler: { phase: "not-started" },
          knownMark: {
            markId: "00000000-0000-4000-8000-000000000004",
            revision: "00000000-0000-4000-8000-000000000005",
            markedAt: "2026-07-30T08:00:00.000Z",
          },
          stateRevision: "00000000-0000-4000-8000-000000000006",
        },
      },
      error: null,
    });
    const { POST } = await import("@/app/api/platform/v2/actions/route");

    const response = await POST(
      request({
        actionId: "mark-known",
        clientEventId: "00000000-0000-4000-8000-000000000002",
        target: {
          kind: "sense-card",
          entryId: "00000000-0000-4000-8000-000000000003",
          cardTypeId: "word-to-definition",
          stateRevision: "untracked",
        },
      }),
    );

    expect(rpc).toHaveBeenCalledWith(
      "perform_platform_v2_card_action",
      {
        p_user_id: "00000000-0000-4000-8000-000000000001",
        p_action_id: "mark-known",
        p_entry_id: "00000000-0000-4000-8000-000000000003",
        p_card_type_id: "word-to-definition",
        p_state_revision: "untracked",
        p_active_known_mark_id: null,
        p_known_mark_revision: null,
        p_review_result: null,
        p_client_event_id: "00000000-0000-4000-8000-000000000002",
        p_source_context: null,
        p_auth_kind: "first_party",
        p_connected_client_id: null,
      },
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        contractVersion: "platform-action-v2",
        actionId: "mark-known",
        clientEventId: "00000000-0000-4000-8000-000000000002",
        accepted: true,
        card: expect.objectContaining({
          knownMark: expect.objectContaining({
            markId: "00000000-0000-4000-8000-000000000004",
          }),
        }),
      }),
    );
  });

  test("rejects a stale Undo as a typed conflict", async () => {
    rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "platform_known_mark_conflict" },
    });
    const { POST } = await import("@/app/api/platform/v2/actions/route");

    const response = await POST(
      request({
        actionId: "undo-known",
        clientEventId: "00000000-0000-4000-8000-000000000007",
        target: {
          kind: "sense-card",
          entryId: "00000000-0000-4000-8000-000000000003",
          cardTypeId: "word-to-definition",
          stateRevision: "00000000-0000-4000-8000-000000000006",
          activeKnownMarkId: "00000000-0000-4000-8000-000000000004",
          knownMarkRevision: "00000000-0000-4000-8000-000000000005",
        },
      }),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "known_mark_conflict",
    });
  });

  test("rejects malformed targets before invoking the database", async () => {
    const { POST } = await import("@/app/api/platform/v2/actions/route");

    const response = await POST(
      request({
        actionId: "undo-known",
        clientEventId: "not-a-uuid",
        target: {
          kind: "sense-card",
          entryId: "not-a-uuid",
          cardTypeId: "word-to-definition",
          stateRevision: "",
        },
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "invalid_client_event_id",
    });
    expect(rpc).not.toHaveBeenCalled();
  });
});
