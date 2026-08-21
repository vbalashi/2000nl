import { beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";
import { buildDiagnosticReport } from "../../../../packages/shared/diagnostic-report/v1";

const rpc = vi.fn();
const from = vi.fn();
const getUser = vi.fn();
const performPlatformV2Lookup = vi.fn();
const createClient = vi.fn(() => ({ auth: { getUser }, rpc, from }));
vi.mock("@supabase/supabase-js", () => ({ createClient }));
vi.mock("@/lib/platform/platformV2LookupService", () => ({
  performPlatformV2Lookup,
}));

const chain = (result: { data?: unknown; error?: unknown }) => {
  const query: any = { select: vi.fn(() => query), eq: vi.fn(() => query), maybeSingle: vi.fn(async () => result) };
  return query;
};

const request = (url: string, options: { method?: string; body?: string; headers?: Record<string, string> } = {}) => new NextRequest(url, {
  method: options.method,
  body: options.body,
  headers: { authorization: "Bearer token", "content-type": "application/json", ...options.headers },
});

async function payload() {
  return buildDiagnosticReport({
    reportId: "11111111-1111-4111-8111-111111111111",
    feedback: { kind: "loading", problemType: "loading-failure", comment: null },
    target: { kind: "app-operation", route: "training", stage: "lookup-fetch", operationCorrelationId: "22222222-2222-4222-8222-222222222222", entryId: null },
    sourceContext: null,
    cardContent: null,
    observations: {
      capturedAt: "2026-08-20T10:00:00.000Z", timezoneOffsetMinutes: 180,
      timezoneName: "Europe/Moscow", route: "training", browserFamily: "chromium",
      browserMajorVersion: 140, osFamily: "android", osMajorVersion: 16,
      isPwa: true, isOnline: true, correlationIds: [], errorChain: [], recentEvents: [],
      omittedEventCount: 0, actionObservation: null,
    },
  });
}

async function sensePayload() {
  return buildDiagnosticReport({
    reportId: "44444444-4444-4444-8444-444444444444",
    feedback: { kind: "rendering", problemType: "rendering-layout-issue", comment: null },
    target: { kind: "sense-card", entryId: "11111111-1111-4111-8111-111111111111", cardTypeId: "word-to-definition", contentRevision: "revision-1", stateRevision: "22222222-2222-4222-8222-222222222222" },
    sourceContext: null,
    cardContent: { atoms: [
      { role: "headword", contentNodeId: null, text: "woord" },
      { role: "definition", contentNodeId: "node.definition:primary", text: "betekenis" },
    ] },
    observations: { ...(await payload()).observations, errorChain: [], correlationIds: [] },
  });
}

async function translationPayload() {
  const base = await sensePayload();
  const artifact = {
    targetKind: "entry" as const,
    entryId: "11111111-1111-4111-8111-111111111111",
    contentNodeId: null,
    translationId: "33333333-3333-4333-8333-333333333333",
    targetLanguageCode: "ru",
    sourceContentFingerprint: "d".repeat(64),
    translationPolicyVersion: "policy-1",
    providerRevision: "provider-1",
  };
  return buildDiagnosticReport({
    ...base,
    reportId: "77777777-7777-4777-8777-777777777777",
    feedback: {
      kind: "translation-quality",
      problemType: "bad-headword-translation",
      comment: null,
    },
    target: { kind: "translation-artifact", ...artifact },
    cardContent: {
      atoms: [
        ...base.cardContent!.atoms,
        {
          role: "displayed-translation",
          contentNodeId: null,
          text: "перевод",
          artifact,
        },
      ],
    },
  });
}

function translatedSenseCard() {
  const target = {
    kind: "translation" as const,
    targetKind: "entry" as const,
    entryId: "11111111-1111-4111-8111-111111111111",
    contentNodeId: null,
    translationId: "33333333-3333-4333-8333-333333333333",
    targetLanguageCode: "ru",
    sourceContentFingerprint: "d".repeat(64),
    translationPolicyVersion: "policy-1",
    providerRevision: "provider-1",
  };
  return {
    contractVersion: "platform-lookup-v2",
    groups: [{ entries: [{
      kind: "sense-card",
      entryId: target.entryId,
      translation: {
        ...target,
        status: "ready",
        text: "перевод",
        isFresh: true,
      },
      contentNodes: [],
      capabilities: [{
        actionId: "report-content",
        elementId: "sense-card.report.translation",
        messageKey: "senseCard.report",
        target,
      }],
    }] }],
  };
}

describe("feedback routes", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service";
    delete process.env.PLATFORM_PRINCIPAL_TEST_LOOKUP;
    getUser.mockReset(); rpc.mockReset(); from.mockReset();
    performPlatformV2Lookup.mockReset(); createClient.mockClear();
  });

  test("requires authentication before parsing a report", async () => {
    const { POST } = await import("@/app/api/feedback/reports/route");
    const response = await POST(new NextRequest("http://localhost/api/feedback/reports", { method: "POST", body: "{}" }));
    expect(response.status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  test("derives the principal and server metadata, then returns a stable receipt", async () => {
    const { POST } = await import("@/app/api/feedback/reports/route");
    getUser.mockResolvedValueOnce({ data: { user: { id: "user-1", app_metadata: {} } }, error: null });
    rpc.mockResolvedValueOnce({ data: null, error: null });
    rpc.mockResolvedValueOnce({ data: { status: "accepted", reportId: "11111111-1111-4111-8111-111111111111", feedbackItemId: "33333333-3333-4333-8333-333333333333", acceptedAt: "2026-08-20T10:00:01Z" }, error: null });
    const body = await payload();
    const response = await POST(request("http://localhost/api/feedback/reports", { method: "POST", body: JSON.stringify(body) }));
    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("submit_diagnostic_report_as_principal", expect.objectContaining({
      p_user_id: "user-1", p_source_client: "2000nl-web", p_report_id: body.reportId,
    }));
  });

  test("rejects a changed payload under the frozen hash", async () => {
    const { POST } = await import("@/app/api/feedback/reports/route");
    getUser.mockResolvedValueOnce({ data: { user: { id: "user-1", app_metadata: {} } }, error: null });
    const body: any = await payload();
    body.feedback.comment = "changed after freeze";
    const response = await POST(request("http://localhost/api/feedback/reports", { method: "POST", body: JSON.stringify(body) }));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "payload_hash_mismatch" });
    expect(rpc).not.toHaveBeenCalled();
  });

  test("bounds the request stream before JSON materialization", async () => {
    const { POST } = await import("@/app/api/feedback/reports/route");
    getUser.mockResolvedValueOnce({ data: { user: { id: "user-1", app_metadata: {} } }, error: null });
    const response = await POST(request("http://localhost/api/feedback/reports", {
      method: "POST", body: JSON.stringify({ padding: "x".repeat(72 * 1024) }),
    }));
    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({ error: "payload_too_large" });
    expect(rpc).not.toHaveBeenCalled();
  });

  test("denies admin query to ordinary users and permits bounded filters for admins", async () => {
    const { GET } = await import("@/app/api/admin/feedback/route");
    getUser.mockResolvedValueOnce({ data: { user: { id: "user-1", app_metadata: {} } }, error: null });
    const denied = await GET(request("http://localhost/api/admin/feedback"));
    expect(denied.status).toBe(403);

    getUser.mockResolvedValueOnce({ data: { user: { id: "admin-1", app_metadata: { role: "admin" } } }, error: null });
    rpc.mockResolvedValueOnce({ data: [], error: null });
    const allowed = await GET(request("http://localhost/api/admin/feedback?kind=loading&limit=25"));
    expect(allowed.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("query_feedback_items_admin", expect.objectContaining({ p_kind: "loading", p_limit: 25 }));
  });

  test("submits a SenseCard report to the atomic verifier after the dependency lands", async () => {
    const { POST } = await import("@/app/api/feedback/reports/route");
    getUser.mockResolvedValueOnce({ data: { user: { id: "user-1", app_metadata: {} } }, error: null });
    rpc.mockResolvedValueOnce({ data: null, error: null });
    rpc.mockResolvedValueOnce({ data: { status: "accepted", reportId: "44444444-4444-4444-8444-444444444444", feedbackItemId: "55555555-5555-4555-8555-555555555555", acceptedAt: "2026-08-21T10:00:01Z" }, error: null });
    const body = await sensePayload();
    const response = await POST(request("http://localhost/api/feedback/reports", { method: "POST", body: JSON.stringify(body) }));
    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith(
      "submit_diagnostic_report_as_principal",
      expect.objectContaining({ p_user_id: "user-1", p_payload: expect.objectContaining({ target: body.target }) }),
    );
  });

  test("passes an opaque ASCII Content Node identifier unchanged to the report RPC", async () => {
    const { POST } = await import("@/app/api/feedback/reports/route");
    getUser.mockResolvedValueOnce({ data: { user: { id: "user-1", app_metadata: {} } }, error: null });
    rpc.mockResolvedValueOnce({ data: null, error: null });
    rpc.mockResolvedValueOnce({
      data: {
        status: "accepted",
        reportId: "88888888-8888-4888-8888-888888888888",
        feedbackItemId: "99999999-9999-4999-8999-999999999999",
        acceptedAt: "2026-08-21T10:00:01Z",
      },
      error: null,
    });
    const base = await sensePayload();
    const body = await buildDiagnosticReport({
      ...base,
      reportId: "88888888-8888-4888-8888-888888888888",
      target: {
        kind: "content-node",
        entryId: "11111111-1111-4111-8111-111111111111",
        contentNodeId: "node/definition#primary",
        nodeKind: "definition",
        sourceTextFingerprint: "b".repeat(64),
      },
    });

    const response = await POST(request("http://localhost/api/feedback/reports", {
      method: "POST",
      body: JSON.stringify(body),
    }));

    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith(
      "submit_diagnostic_report_as_principal",
      expect.objectContaining({
        p_payload: expect.objectContaining({ target: body.target }),
      }),
    );
  });

  test("fails reordered SenseCard atoms closed rather than applying a route-only ordering rule", async () => {
    const { POST } = await import("@/app/api/feedback/reports/route");
    getUser.mockResolvedValueOnce({ data: { user: { id: "user-1", app_metadata: {} } }, error: null });
    rpc.mockResolvedValueOnce({ data: null, error: null });
    rpc.mockResolvedValueOnce({ data: null, error: { message: "report_atoms_mismatch" } });
    const original = await sensePayload();
    const body = await buildDiagnosticReport({
      ...original,
      cardContent: { ...original.cardContent!, atoms: [...original.cardContent!.atoms].reverse() },
    });
    const response = await POST(request("http://localhost/api/feedback/reports", { method: "POST", body: JSON.stringify(body) }));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "card_content_mismatch" });
  });

  test("returns the durable duplicate receipt before revalidating a now-stale projection", async () => {
    const { POST } = await import("@/app/api/feedback/reports/route");
    getUser.mockResolvedValueOnce({ data: { user: { id: "user-1", app_metadata: {} } }, error: null });
    const body = await sensePayload();
    const receipt = { status: "duplicate", reportId: body.reportId, feedbackItemId: "55555555-5555-4555-8555-555555555555", acceptedAt: "2026-08-20T10:00:01Z" };
    rpc.mockResolvedValueOnce({ data: receipt, error: null });
    const response = await POST(request("http://localhost/api/feedback/reports", { method: "POST", body: JSON.stringify(body) }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(receipt);
    expect(rpc).not.toHaveBeenCalledWith("submit_diagnostic_report_as_principal", expect.anything());
  });

  test("returns a durable idempotency conflict before projection work", async () => {
    const { POST } = await import("@/app/api/feedback/reports/route");
    getUser.mockResolvedValueOnce({ data: { user: { id: "user-1", app_metadata: {} } }, error: null });
    const body = await sensePayload();
    rpc.mockResolvedValueOnce({ data: { status: "conflict", reportId: body.reportId }, error: null });
    const response = await POST(request("http://localhost/api/feedback/reports", { method: "POST", body: JSON.stringify(body) }));
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: "idempotency_conflict", reportId: body.reportId });
  });

  test("denies connected clients without platform:write before body validation", async () => {
    const { POST } = await import("@/app/api/feedback/reports/route");
    process.env.PLATFORM_PRINCIPAL_TEST_LOOKUP = "1";
    getUser.mockResolvedValueOnce({ data: { user: { id: "user-1", app_metadata: {} } }, error: null });
    rpc.mockResolvedValueOnce({ data: null, error: null });
    from.mockImplementation((table: string) => {
      if (table === "connected_client_sessions") return chain({ data: { id: "session-1", client_id: "audiofilms", user_id: "user-1", scopes: ["platform:read"], revoked_at: null, access_token_expires_at: new Date(Date.now() + 60_000).toISOString() }, error: null });
      if (table === "connected_clients") return chain({ data: { client_id: "audiofilms", status: "active" }, error: null });
      if (table === "connected_client_grants") return chain({ data: { scopes: ["platform:read"], revoked_at: null }, error: null });
      return chain({ data: null, error: null });
    });
    const response = await POST(request("http://localhost/api/feedback/reports", { method: "POST", body: "{}" }));
    expect(response.status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
    delete process.env.PLATFORM_PRINCIPAL_TEST_LOOKUP;
  });

  test("accepts a bounded source context from a connected client with platform:write", async () => {
    const { POST } = await import("@/app/api/feedback/reports/route");
    process.env.PLATFORM_PRINCIPAL_TEST_LOOKUP = "1";
    getUser.mockResolvedValueOnce({ data: { user: { id: "user-1", app_metadata: {} } }, error: null });
    from.mockImplementation((table: string) => {
      if (table === "connected_client_sessions") return chain({ data: { id: "session-1", client_id: "audiofilms", user_id: "user-1", scopes: ["platform:write"], revoked_at: null, access_token_expires_at: new Date(Date.now() + 60_000).toISOString() }, error: null });
      if (table === "connected_clients") return chain({ data: { client_id: "audiofilms", status: "active" }, error: null });
      if (table === "connected_client_grants") return chain({ data: { scopes: ["platform:write"], revoked_at: null }, error: null });
      return chain({ data: null, error: null });
    });
    rpc.mockResolvedValueOnce({ data: null, error: null });
    rpc.mockResolvedValueOnce({ data: { status: "accepted", reportId: "11111111-1111-4111-8111-111111111111", feedbackItemId: "33333333-3333-4333-8333-333333333333", acceptedAt: "2026-08-20T10:00:01Z" }, error: null });
    const base = await payload();
    const body = await buildDiagnosticReport({
      ...base,
      sourceContext: {
        contractVersion: "diagnostic-source-context-v1",
        source: { kind: "youtube_video", provider: "youtube", externalId: "4EE7m94mJpk", languageCode: "nl" },
        location: { kind: "caption_phrase", startMs: 1000, endMs: 2500, phraseIndex: 3, locatorConfidence: "canonical" },
      },
    });
    const response = await POST(request("http://localhost/api/feedback/reports", { method: "POST", body: JSON.stringify(body) }));
    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenLastCalledWith("submit_diagnostic_report_as_principal", expect.objectContaining({ p_source_client: "audiofilms" }));
    delete process.env.PLATFORM_PRINCIPAL_TEST_LOOKUP;
  });

  test("submits a historical Training-action target to the receipt verifier", async () => {
    const { POST } = await import("@/app/api/feedback/reports/route");
    getUser.mockResolvedValueOnce({ data: { user: { id: "user-1", app_metadata: {} } }, error: null });
    rpc.mockResolvedValueOnce({ data: null, error: null });
    rpc.mockResolvedValueOnce({ data: { status: "accepted", reportId: "66666666-6666-4666-8666-666666666666", feedbackItemId: "77777777-7777-4777-8777-777777777777", acceptedAt: "2026-08-21T10:00:01Z", commitState: "committed" }, error: null });
    const base = await payload();
    const body = await buildDiagnosticReport({
      reportId: "66666666-6666-4666-8666-666666666666",
      feedback: { kind: "training-action", problemType: "training-action-failure", comment: null },
      target: { kind: "training-action", entryId: "11111111-1111-4111-8111-111111111111", cardTypeId: "word-to-definition", stateRevision: "22222222-2222-4222-8222-222222222222", contentRevision: "revision-1", actionId: "review-card", clientEventId: "33333333-3333-4333-8333-333333333333", reviewResult: "hard", activeKnownMarkId: null, knownMarkRevision: null },
      sourceContext: null,
      cardContent: { atoms: [{ role: "headword", contentNodeId: null, text: "woord" }] },
      observations: { ...base.observations, actionObservation: { clientObservedOutcome: "timeout" } },
    });
    const response = await POST(request("http://localhost/api/feedback/reports", { method: "POST", body: JSON.stringify(body) }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({
      status: "accepted",
      commitState: "committed",
    }));
  });

  test("accepts only the exact fresh displayed Translation Artifact selected by Platform", async () => {
    const { POST } = await import("@/app/api/feedback/reports/route");
    getUser.mockResolvedValue({ data: { user: { id: "user-1", app_metadata: {} } }, error: null });
    const body = await translationPayload();
    const sourceCardContent = {
      atoms: body.cardContent!.atoms.filter(
        (atom) => atom.role !== "displayed-translation",
      ),
      omittedAtomCount: 0,
    };
    rpc.mockResolvedValueOnce({ data: null, error: null });
    rpc.mockResolvedValueOnce({
      data: { contentRevision: "report-revision-1", cardContent: sourceCardContent },
      error: null,
    });
    rpc.mockResolvedValueOnce({
      data: {
        status: "accepted",
        reportId: "77777777-7777-4777-8777-777777777777",
        feedbackItemId: "88888888-8888-4888-8888-888888888888",
        acceptedAt: "2026-08-21T10:00:01Z",
      },
      error: null,
    });
    performPlatformV2Lookup.mockResolvedValue({
      status: 200,
      payload: translatedSenseCard(),
    });
    const accepted = await POST(request("http://localhost/api/feedback/reports", {
      method: "POST",
      body: JSON.stringify(body),
    }));
    expect(accepted.status).toBe(200);

    rpc.mockReset();
    rpc.mockResolvedValueOnce({ data: null, error: null });
    rpc.mockResolvedValueOnce({
      data: { contentRevision: "report-revision-1", cardContent: sourceCardContent },
      error: null,
    });
    const altered = await buildDiagnosticReport({
      ...body,
      reportId: "99999999-9999-4999-8999-999999999999",
      cardContent: {
        atoms: body.cardContent!.atoms.map((atom) =>
          atom.role === "displayed-translation"
            ? { ...atom, text: "подменено" }
            : atom,
        ),
      },
    });
    const rejected = await POST(request("http://localhost/api/feedback/reports", {
      method: "POST",
      body: JSON.stringify(altered),
    }));
    expect(rejected.status).toBe(400);
    await expect(rejected.json()).resolves.toEqual({
      error: "card_content_mismatch",
    });
    expect(rpc).not.toHaveBeenCalledWith(
      "submit_diagnostic_report_as_principal",
      expect.anything(),
    );
  });
});
