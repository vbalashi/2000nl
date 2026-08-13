import { beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";

const rpc = vi.fn();
const authenticatedRpc = vi.fn();
const getUser = vi.fn();
const createClient = vi.fn((_url: string, key: string) =>
  key === "service-key"
    ? { auth: { getUser }, rpc }
    : { auth: { getUser }, rpc: authenticatedRpc },
);

vi.mock("@supabase/supabase-js", () => ({
  createClient,
}));

const request = (body: unknown, extraHeaders: Record<string, string> = {}) =>
  new NextRequest("http://localhost/api/platform/v2/actions", {
    method: "POST",
    headers: {
      authorization: "Bearer user-token",
      "content-type": "application/json",
      origin: "chrome-extension://abc",
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  });

describe("/api/platform/v2/actions", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
    process.env.PLATFORM_API_ALLOWED_ORIGINS = "chrome-extension://abc";
    process.env.PLATFORM_V2_ACTIONS_ENABLED = "1";
    delete process.env.PLATFORM_PRINCIPAL_TEST_LOOKUP;
    getUser.mockReset();
    rpc.mockReset();
    authenticatedRpc.mockReset();
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
      "perform_platform_v2_card_action_as_principal",
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
    expect(authenticatedRpc).not.toHaveBeenCalled();
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

  test("returns a typed conflict when an action is not available in the current phase", async () => {
    rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "platform_action_not_available" },
    });
    const { POST } = await import("@/app/api/platform/v2/actions/route");

    const response = await POST(
      request({
        actionId: "start-learning",
        clientEventId: "00000000-0000-4000-8000-000000000008",
        target: {
          kind: "sense-card",
          entryId: "00000000-0000-4000-8000-000000000003",
          cardTypeId: "word-to-definition",
          stateRevision: "00000000-0000-4000-8000-000000000009",
        },
      }),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "action_not_available",
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

  test("records a privacy-safe commit-then-disconnect outcome for a duplicate retry", async () => {
    const telemetry = vi.spyOn(console, "info").mockImplementation(() => undefined);
    rpc.mockResolvedValueOnce({
      data: {
        status: "duplicate",
        actionId: "review-card",
        clientEventId: "00000000-0000-4000-8000-000000000002",
        card: {
          cardTypeId: "word-to-definition",
          scheduler: { phase: "reviewing", repeatCount: 4 },
          knownMark: null,
          stateRevision: "00000000-0000-4000-8000-000000000006",
        },
      },
      error: null,
    });
    const { POST } = await import("@/app/api/platform/v2/actions/route");

    const response = await POST(
      request(
        {
          actionId: "review-card",
          clientEventId: "00000000-0000-4000-8000-000000000002",
          target: {
            kind: "sense-card",
            entryId: "00000000-0000-4000-8000-000000000003",
            cardTypeId: "word-to-definition",
            stateRevision: "00000000-0000-4000-8000-000000000005",
          },
          reviewResult: "success",
        },
        { "x-platform-action-attempt": "2" },
      ),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("x-platform-review-outcome")).toBe(
      "commit_then_disconnect",
    );
    expect(telemetry).toHaveBeenCalledWith("[platform.training.review]", {
      actionId: "review-card",
      attempt: 2,
      cardTypeId: "word-to-definition",
      clientEventId: "00000000-0000-4000-8000-000000000002",
      outcome: "commit_then_disconnect",
      requestId: expect.any(String),
    });
    expect(JSON.stringify(telemetry.mock.calls)).not.toContain("success");
  });

  test("records a genuinely newer remote state after an ambiguous attempt", async () => {
    const telemetry = vi.spyOn(console, "info").mockImplementation(() => undefined);
    rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "platform_card_state_conflict" },
    });
    const { POST } = await import("@/app/api/platform/v2/actions/route");

    const response = await POST(
      request(
        {
          actionId: "review-card",
          clientEventId: "00000000-0000-4000-8000-000000000002",
          target: {
            kind: "sense-card",
            entryId: "00000000-0000-4000-8000-000000000003",
            cardTypeId: "word-to-definition",
            stateRevision: "00000000-0000-4000-8000-000000000005",
          },
          reviewResult: "hard",
        },
        { "x-platform-action-attempt": "2" },
      ),
    );

    expect(response.status).toBe(409);
    expect(response.headers.get("x-platform-review-outcome")).toBe(
      "newer_remote_state",
    );
    expect(telemetry).toHaveBeenCalledWith(
      "[platform.training.review]",
      expect.objectContaining({
        attempt: 2,
        clientEventId: "00000000-0000-4000-8000-000000000002",
        outcome: "newer_remote_state",
      }),
    );
  });

  test.each([
    {
      name: "timeout before commit",
      receiptStatus: "accepted",
      attempt: "2",
      outcome: "timeout_before_commit",
    },
    {
      name: "duplicate retry",
      receiptStatus: "duplicate",
      attempt: "1",
      outcome: "duplicate_retry",
    },
  ])("records the correlated $name outcome", async ({ receiptStatus, attempt, outcome }) => {
    const telemetry = vi.spyOn(console, "info").mockImplementation(() => undefined);
    rpc.mockResolvedValueOnce({
      data: {
        status: receiptStatus,
        actionId: "review-card",
        clientEventId: "00000000-0000-4000-8000-000000000002",
        card: {
          cardTypeId: "word-to-definition",
          scheduler: { phase: "reviewing", repeatCount: 4 },
          knownMark: null,
          stateRevision: "00000000-0000-4000-8000-000000000006",
        },
      },
      error: null,
    });
    const { POST } = await import("@/app/api/platform/v2/actions/route");

    const response = await POST(
      request(
        {
          actionId: "review-card",
          clientEventId: "00000000-0000-4000-8000-000000000002",
          target: {
            kind: "sense-card",
            entryId: "00000000-0000-4000-8000-000000000003",
            cardTypeId: "word-to-definition",
            stateRevision: "00000000-0000-4000-8000-000000000005",
          },
          reviewResult: "success",
        },
        { "x-platform-action-attempt": attempt },
      ),
    );

    expect(response.headers.get("x-platform-review-outcome")).toBe(outcome);
    expect(telemetry).toHaveBeenCalledWith(
      "[platform.training.review]",
      expect.objectContaining({
        clientEventId: "00000000-0000-4000-8000-000000000002",
        outcome,
      }),
    );
  });
});
