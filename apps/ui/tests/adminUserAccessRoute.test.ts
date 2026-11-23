import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireAdmin: vi.fn(), rpc: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/admin/adminAccess", () => ({
  requireAdmin: mocks.requireAdmin,
  adminErrorResponse: (error: { status?: number }) => Response.json({}, { status: error.status ?? 503 }),
}));
vi.mock("@/lib/admin/adminServerClient", () => ({ createAdminServiceClient: () => ({ rpc: mocks.rpc }) }));
vi.mock("@/lib/runtime/publicConfig", () => ({ runtimeEnv: () => undefined }));

import { GET, POST } from "@/app/api/admin/users/[id]/access/route";

const id = "11111111-1111-4111-8111-111111111111";
const origin = "https://example.test";
const url = `${origin}/api/admin/users/${id}/access`;
const context = { params: Promise.resolve({ id }) };
const access = {
  groups: [{ id: "testers", name: "Testers", description: null, member: true }],
  operatorActive: false,
};
function post(groupId: string, requestOrigin = origin) {
  return POST(new Request(url, { method: "POST", headers: { origin: requestOrigin }, body: JSON.stringify({ groupId, member: true }) }), context);
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireAdmin.mockResolvedValue({ userId: "operator", requestId: "request", permissions: ["users.read", "testers.manage"] });
  mocks.rpc.mockResolvedValue({ data: access, error: null });
});

it("returns stored group metadata and nullable descriptions to a profile reader", async () => {
  const response = await GET(new Request(url), context);
  expect(mocks.requireAdmin).toHaveBeenCalledWith(expect.any(Request), "users.read");
  expect(mocks.rpc).toHaveBeenCalledWith("admin_user_tester_access", expect.objectContaining({ p_user: id, p_member: null }));
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(await response.json()).toEqual(access);
});

it("writes membership with the authenticated operator and request IDs", async () => {
  expect((await post("testers")).status).toBe(200);
  expect(mocks.requireAdmin).toHaveBeenCalledWith(expect.any(Request), "testers.manage");
  expect(mocks.rpc).toHaveBeenCalledWith("admin_user_tester_access", {
    p_operator: "operator", p_user: id, p_request: "request", p_member: true,
  });
});

it("rejects a different origin, an unsupported group and a missing permission before RPC", async () => {
  expect((await post("testers", "https://other.test")).status).toBe(403);
  expect((await post("operators")).status).toBe(400);
  mocks.requireAdmin.mockRejectedValue({ status: 403 });
  expect((await post("testers")).status).toBe(403);
  expect(mocks.rpc).not.toHaveBeenCalled();
});

it("lets only owners select a non-tester group and binds the write to the verified principal", async () => {
  const groupId = "22222222-2222-4222-8222-222222222222";
  expect((await post(groupId)).status).toBe(400);
  expect(mocks.rpc).not.toHaveBeenCalled();

  const ownerAccess = { ...access, groups: [...access.groups, { id: groupId, name: "Reviewers", description: null, member: false }] };
  mocks.requireAdmin.mockResolvedValue({
    userId: "owner-account", requestId: "request", permissions: ["owner", "users.read", "testers.manage"],
  });
  mocks.rpc.mockResolvedValue({ data: ownerAccess, error: null });
  expect(await (await GET(new Request(url), context)).json()).toEqual(ownerAccess);
  expect((await post(groupId)).status).toBe(200);
  expect(mocks.rpc).toHaveBeenLastCalledWith("admin_owner_user_access_v1", {
    p_operator: "owner-account", p_user: id, p_request: "request", p_member: true, p_group_id: groupId,
  });
});
