import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireAdmin: vi.fn(), rpc: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/admin/adminAccess", () => ({
  requireAdmin: mocks.requireAdmin,
  adminErrorResponse: (error: { status?: number }) => Response.json({}, { status: error.status ?? 503 }),
}));
vi.mock("@/lib/admin/adminServerClient", () => ({ createAdminServiceClient: () => ({ rpc: mocks.rpc }) }));

import { GET } from "@/app/api/admin/users/[id]/overview/route";

const id = "11111111-1111-4111-8111-111111111111";
function request(query = "") {
  return GET(new Request(`https://example.test/api/admin/users/${id}/overview${query}`), {
    params: Promise.resolve({ id }),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireAdmin.mockResolvedValue({ userId: "operator", requestId: "request" });
});

it("rejects malformed date and denied permission before collecting user data", async () => {
  expect((await request("?day=2026-02-30")).status).toBe(400);
  expect((await request("?language=foo/bar")).status).toBe(400);
  mocks.requireAdmin.mockRejectedValue({ status: 403 });
  expect((await request()).status).toBe(403);
  expect(mocks.rpc).not.toHaveBeenCalled();
});

it("uses an audited service RPC and removes non-contract session fields", async () => {
  const session = {
    id, startedAt: "2026-11-22T12:00:00Z", source: "personal", mode: "both",
    cards: 0, outcome: "empty", activeMilliseconds: null,
  };
  mocks.rpc.mockResolvedValue({ data: { sessions: [{ ...session, listName: "Private content" }], hasMore: false } });
  const response = await request("?day=2026-11-22&language=nl");
  expect(mocks.requireAdmin).toHaveBeenCalledWith(expect.any(Request), "users.read");
  expect(mocks.rpc).toHaveBeenCalledWith("admin_user_learning_overview_v1", {
    p_operator: "operator", p_user: id, p_request: "request", p_language: "nl", p_day: "2026-11-22",
  });
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(await response.json()).toEqual({ sessions: [session], hasMore: false });
});

it("fails closed for missing RPC, malformed calendar and forbidden SQL role", async () => {
  mocks.rpc.mockResolvedValueOnce({ error: { message: "private DB error" } });
  expect((await request()).status).toBe(503);
  mocks.rpc.mockResolvedValueOnce({ data: { timezone: "UTC", days: [], material: {} } });
  expect((await request()).status).toBe(503);
  mocks.rpc.mockResolvedValueOnce({ data: { error: "forbidden" } });
  expect((await request()).status).toBe(403);
});
