import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireAdmin: vi.fn(), rpc: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/admin/adminAccess", () => ({
  requireAdmin: mocks.requireAdmin,
  adminErrorResponse: (error: { status?: number }) => Response.json({}, { status: error.status ?? 503 }),
}));
vi.mock("@/lib/admin/adminServerClient", () => ({ createAdminServiceClient: () => ({ rpc: mocks.rpc }) }));

import { GET } from "@/app/api/admin/users/[id]/activity/route";

const id = "11111111-1111-4111-8111-111111111111";
const activity = {
  periodStart: "2026-11-16T00:00:00Z",
  asOf: "2026-11-22T12:00:00Z",
  activeDays: 0,
  sessionsStarted: 0,
  sessionsCompleted: 0,
  acceptedActions: 0,
  lastObservedAt: null,
};
function request(query = "", targetId = id) {
  return GET(new Request(`https://example.test/api/admin/users/${targetId}/activity${query}`), {
    params: Promise.resolve({ id: targetId }),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireAdmin.mockResolvedValue({ userId: "operator", requestId: "request" });
  mocks.rpc.mockResolvedValue({ data: { ...activity, rawContent: "private fixture" }, error: null });
});

it("requires users.read and returns only aggregate fields without caching", async () => {
  const response = await request("?days=7");
  expect(mocks.requireAdmin).toHaveBeenCalledWith(expect.any(Request), "users.read");
  expect(mocks.rpc).toHaveBeenCalledWith("admin_user_activity", {
    p_operator: "operator", p_user: id, p_request: "request", p_days: 7,
  });
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(await response.json()).toEqual(activity);
});

it("blocks unauthorized and invalid requests before accessing the database", async () => {
  expect((await request("?days=365")).status).toBe(400);
  expect((await request("", "not-uuid")).status).toBe(404);
  mocks.requireAdmin.mockRejectedValue({ status: 403 });
  expect((await request()).status).toBe(403);
  expect(mocks.rpc).not.toHaveBeenCalled();
});

it.each([
  [{ error: "forbidden" }, null, 403],
  [{ error: "not_found" }, null, 404],
  [{ ...activity, acceptedActions: null }, null, 503],
  [null, { message: "audit insert failed" }, 503],
])("handles database response %# without exposing internal errors", async (data, error, status) => {
  mocks.rpc.mockResolvedValue({ data, error });
  const response = await request();
  expect(response.status).toBe(status);
  expect(JSON.stringify(await response.json())).not.toContain("audit insert failed");
});
