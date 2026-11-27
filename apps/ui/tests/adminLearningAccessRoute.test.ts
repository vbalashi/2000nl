import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireAdmin: vi.fn(), rpc: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/admin/adminAccess", () => ({
  requireAdmin: mocks.requireAdmin,
  adminErrorResponse: (error: { status?: number }) => Response.json({}, { status: error.status ?? 503 }),
}));
vi.mock("@/lib/admin/adminServerClient", () => ({ createAdminServiceClient: () => ({ rpc: mocks.rpc }) }));
vi.mock("@/lib/billing/paddleSandboxWebhook", () => ({ sandboxFulfillmentEnabled: () => false }));
vi.mock("@/lib/runtime/publicConfig", () => ({ runtimeEnv: () => undefined }));

import { GET, POST } from "@/app/api/admin/users/[id]/learning-access/route";

const id = "11111111-1111-4111-8111-111111111111";
const groupId = "22222222-2222-4222-8222-222222222222";
const requestId = "33333333-3333-4333-8333-333333333333";
const readId = "44444444-4444-4444-8444-444444444444";
const operatorId = "55555555-5555-4555-8555-555555555555";
const origin = "https://example.test";
const url = `${origin}/api/admin/users/${id}/learning-access`;
const context = { params: Promise.resolve({ id }) };
const access = {
  premium: false, manualUntil: null, aiRepliesRemaining: 2, dictationsRemaining: 10,
  groups: [{ id: groupId, name: "Testers" }],
};
const credit = { action: "credit", aiReplies: 4, dictations: 6, reason: " Support ", requestId };

function post(body: object, requestOrigin = origin) {
  return POST(new Request(url, { method: "POST", headers: { origin: requestOrigin }, body: JSON.stringify(body) }), context);
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireAdmin.mockResolvedValue({ userId: operatorId, requestId: readId, permissions: ["users.read"] });
  mocks.rpc.mockResolvedValue({ data: access, error: null });
});

it("reads current access under the authenticated operator and projects only known fields", async () => {
  mocks.rpc.mockResolvedValue({ data: { ...access, groups: [{ ...access.groups[0], private: true }], staff: true }, error: null });
  const result = await GET(new Request(url), context);
  expect(await result.json()).toEqual({ ...access, groups: [] });
  mocks.requireAdmin.mockResolvedValue({ userId: operatorId, requestId: readId, permissions: ["users.read", "entitlements.manage"] });
  expect(await (await GET(new Request(url), context)).json()).toEqual(access);
  expect(result.headers.get("cache-control")).toContain("no-store");
  expect(mocks.requireAdmin).toHaveBeenCalledWith(expect.any(Request), "users.read");
  expect(mocks.rpc).toHaveBeenCalledWith("admin_assistant_allowances_v1", {
    p_operator: operatorId, p_user: id, p_request: readId, p_allow_sandbox: false,
  });
});

it("requires write permission and the configured origin", async () => {
  expect((await post(credit)).status).toBe(403);
  expect((await post(credit, "https://unrelated.test")).status).toBe(403);
  expect(mocks.rpc).not.toHaveBeenCalled();
});

it("binds account and group grants to the verified operator and validates quantities", async () => {
  mocks.requireAdmin.mockResolvedValue({ userId: operatorId, requestId: readId, permissions: ["users.read", "entitlements.manage"] });
  mocks.rpc.mockResolvedValue({ data: { grantedUsers: 1, replayed: false }, error: null });
  expect((await post({ ...credit, p_user: "other", p_operator: "other" })).status).toBe(200);
  expect(mocks.rpc).toHaveBeenLastCalledWith("admin_grant_assistant_allowance_v1", {
    p_operator: operatorId, p_request: requestId, p_reason: "Support", p_user: id, p_group: null, p_ai_replies: 4, p_dictations: 6,
  });
  expect((await post({ ...credit, groupId })).status).toBe(200);
  expect(mocks.rpc).toHaveBeenLastCalledWith("admin_grant_assistant_allowance_v1", expect.objectContaining({ p_user: null, p_group: groupId }));
  expect((await post({ ...credit, aiReplies: 10_001 })).status).toBe(400);
  expect((await post({ ...credit, aiReplies: 0, dictations: 0 })).status).toBe(400);
  expect(mocks.rpc).toHaveBeenCalledTimes(2);
});

it("grants timed Premium independently of credits and relays a conflicting request identifier", async () => {
  mocks.requireAdmin.mockResolvedValue({ userId: operatorId, requestId: readId, permissions: ["users.read", "owner"] });
  const validUntil = "2099-07-01T10:00:00.000Z";
  mocks.rpc.mockResolvedValueOnce({ data: { manualUntil: validUntil, replayed: false }, error: null });
  const grant = { action: "grantPremium", validUntil, requestId, reason: "Support" };
  const response = await post(grant);
  expect(await response.json()).toEqual({ manualUntil: validUntil, replayed: false });
  expect(mocks.rpc).toHaveBeenLastCalledWith("admin_grant_manual_premium_v1", {
    p_operator: operatorId, p_user: id, p_request: requestId, p_reason: "Support", p_valid_until: validUntil,
  });
  mocks.rpc.mockResolvedValueOnce({ data: { error: "request_conflict" }, error: null });
  expect((await post({ ...grant, reason: "Different" })).status).toBe(409);
  mocks.rpc.mockResolvedValueOnce({ data: { manualUntil: null, replayed: true }, error: null });
  expect(await (await post(grant)).json()).toEqual({ manualUntil: null, replayed: true });
});
