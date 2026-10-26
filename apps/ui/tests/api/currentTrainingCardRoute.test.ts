import { NextRequest } from "next/server";
import { beforeEach, afterEach, expect, test, vi } from "vitest";
const { authenticate, service, scope, rpc, lookup } = vi.hoisted(() => ({
  authenticate: vi.fn(),
  service: vi.fn(),
  scope: vi.fn(),
  rpc: vi.fn(),
  lookup: vi.fn(),
}));
vi.mock("@/lib/platform/serverSupabase", () => ({
  getAuthenticatedSupabase: authenticate,
  getPlatformServiceSupabase: service,
  requirePlatformScope: scope,
  jsonNoStore: (body: unknown, status = 200) =>
    Response.json(body, { status, headers: { "cache-control": "no-store" } }),
}));
vi.mock("@/lib/platform/platformV2LookupService", () => ({
  performPlatformV2Lookup: lookup,
}));
import { POST } from "@/app/api/platform/v2/training/current-card/route";
const sessionId = "75400000-0000-4000-8000-000000000001",
  entryId = "75400000-0000-4000-8000-000000000002",
  permitId = "75400000-0000-4000-8000-000000000003";
const owner = {
  user: { id: "actual-owner" },
  principal: { authKind: "first_party" },
  supabase: { rpc },
};
const base = {
  operation: "acknowledge",
  sessionId,
  entryId,
  cardTypeId: "word-to-definition",
  sourceVersion: 3,
  stateRevision: "untracked",
};
const request = (body: unknown) =>
  new NextRequest("http://localhost/api/platform/v2/training/current-card", {
    method: "POST",
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_AUTHOR_ENTRY_ARCHIVE_ENABLED", "true");
  authenticate.mockResolvedValue(owner);
  scope.mockReturnValue(null);
  service.mockReturnValue({ supabase: {} });
  rpc.mockResolvedValue({
    data: { permitId, expiresAt: "2026-10-25T15:30:00Z", runGeneration: 1 },
    error: null,
  });
  lookup.mockResolvedValue({ payload: { groups: [] }, status: 200 });
});
afterEach(() => {
  vi.unstubAllEnvs();
});
test("display acknowledgement derives principal, requireswrite and never invokes lookup", async () => {
  const response = await POST(request(base));
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(scope).toHaveBeenCalledWith(owner, "platform:write");
  expect(rpc).toHaveBeenCalledWith("acknowledge_current_training_card_v1", {
    p_user_id: "actual-owner",
    p_session_id: sessionId,
    p_entry_id: entryId,
    p_card_type_id: "word-to-definition",
    p_content_version: 3,
    p_state_revision: "untracked",
    p_target_id: null,
    p_direction: null,
  });
  expect(lookup).not.toHaveBeenCalled();
  expect(service).not.toHaveBeenCalled();
});
test("rejects malformed or caller-owned authority before any RPC", async () => {
  for (const patch of [
    { userId: "victim" },
    { sourceVersion: 0 },
    { sourceVersion: 1.5 },
    { sourceVersion: "3" },
    { entryId: "invalid" },
    { cardTypeId: "idiom:recognition" },
    { cardTypeId: "idiom:direct" },
    { targetId: entryId },
    { stateRevision: "" },
  ])
    expect((await POST(request({ ...base, ...patch }))).status).toBe(400);
  expect(rpc).not.toHaveBeenCalled();
  expect(service).not.toHaveBeenCalled();
});
test("exercise display target uses exact family direction", async () => {
  expect(
    (
      await POST(
        request({
          ...base,
          cardTypeId: "idiom:reverse",
          targetId: entryId,
          direction: "reverse",
        }),
      )
    ).status,
  ).toBe(200);
  expect(rpc).toHaveBeenLastCalledWith(
    "acknowledge_current_training_card_v1",
    expect.objectContaining({
      p_target_id: entryId,
      p_card_type_id: "idiom:reverse",
      p_direction: "reverse",
    }),
  );
});
test("read is an exact permit-bound first-party projection, never a search", async () => {
  expect(
    (
      await POST(
        request({
          operation: "read",
          sessionId,
          permitId,
          entryId,
          cardTypeId: "word-to-definition",
          contentLanguageCode: "nl",
          translationTargetLanguageCode: null,
        }),
      )
    ).status,
  ).toBe(200);
  expect(scope).toHaveBeenCalledWith(owner, "platform:read");
  expect(rpc).not.toHaveBeenCalled();
  expect(lookup).toHaveBeenCalledWith(
    expect.objectContaining({ auth: owner }),
    expect.objectContaining({ entryId, intent: "training-review" }),
    undefined,
    { sessionId, permitId },
  );
});
test("unauthenticated/connected/disabled requests cannot create permits", async () => {
  authenticate.mockResolvedValueOnce(
    Response.json({ error: "unauthorized" }, { status: 401 }),
  );
  expect((await POST(request(base))).status).toBe(401);
  authenticate.mockResolvedValueOnce({
    ...owner,
    principal: { authKind: "connected_client" },
  });
  expect((await POST(request(base))).status).toBe(403);
  vi.stubEnv("NEXT_PUBLIC_AUTHOR_ENTRY_ARCHIVE_ENABLED", "false");
  expect((await POST(request(base))).status).toBe(503);
  expect(rpc).not.toHaveBeenCalled();
});
test("archive/revision failures remain explicit and do not leak database internals", async () => {
  for (const [code, status] of [
    ["42501", 403],
    ["40001", 409],
    ["22023", 400],
    ["XX000", 500],
  ] as const) {
    rpc.mockResolvedValueOnce({
      data: null,
      error: { code, message: "private SQL" },
    });
    const response = await POST(request(base));
    expect(response.status).toBe(status);
    expect(JSON.stringify(await response.json())).not.toContain("private SQL");
  }
});
