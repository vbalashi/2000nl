import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireAdmin: vi.fn(), writeAdminAuditEvent: vi.fn(), listAdminUsers: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/admin/adminAccess", () => ({
  adminErrorResponse: (error: { status?: number; code?: string }) => Response.json({ error: error.code ?? "unavailable" }, { status: error.status ?? 503 }),
  requireAdmin: mocks.requireAdmin,
}));
vi.mock("@/lib/admin/adminAuditRepository", () => ({ writeAdminAuditEvent: mocks.writeAdminAuditEvent }));
vi.mock("@/lib/admin/userRepository", () => ({ listAdminUsers: mocks.listAdminUsers }));

import { GET } from "@/app/api/admin/users/route";

afterEach(() => { vi.clearAllMocks(); });

describe("admin user registry route", () => {
  it("requires users.read and returns a private paginated projection", async () => {
    mocks.requireAdmin.mockResolvedValue({ userId: "operator-1", requestId: "request-1", clientContext: {} });
    mocks.listAdminUsers.mockResolvedValue({ items: [], hasNext: false, page: 2, pageSize: 50, returned: 0 });

    const response = await GET(new Request("https://2000.dilum.io/api/admin/users?q=person%40example.test&page=2&pageSize=50"));

    expect(mocks.requireAdmin).toHaveBeenCalledWith(expect.any(Request), "users.read");
    expect(mocks.listAdminUsers).toHaveBeenCalledWith({ query: "person@example.test", page: 2, pageSize: 50 });
    expect(mocks.writeAdminAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      action: "user.registry.read",
      outcome: "success",
      targetType: "user_registry",
      targetId: "page:2",
      requestId: "request-1",
    }));
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.json()).toMatchObject({ page: 2, pageSize: 50, items: [] });
  });

  it("does not query user records without users.read", async () => {
    mocks.requireAdmin.mockRejectedValue({ status: 403, code: "forbidden" });
    const response = await GET(new Request("https://2000.dilum.io/api/admin/users"));
    expect(response.status).toBe(403);
    expect(mocks.listAdminUsers).not.toHaveBeenCalled();
    expect(mocks.writeAdminAuditEvent).not.toHaveBeenCalled();
  });

  it("does not include a search string in the audit target", async () => {
    mocks.requireAdmin.mockResolvedValue({ userId: "operator-1", requestId: "request-1", clientContext: {} });
    mocks.listAdminUsers.mockResolvedValue({ items: [], hasNext: false, page: 1, pageSize: 25, returned: 0 });
    await GET(new Request("https://2000.dilum.io/api/admin/users?q=private.person%40example.test"));
    expect(mocks.writeAdminAuditEvent).toHaveBeenCalledWith(expect.not.objectContaining({ targetId: expect.stringContaining("private.person") }));
  });
});
