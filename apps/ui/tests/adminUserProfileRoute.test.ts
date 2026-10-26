import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireAdmin: vi.fn(), writeAdminAuditEvent: vi.fn(), getAdminUser: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/admin/adminAccess", () => ({
  adminErrorResponse: (error: { status?: number; code?: string }) => Response.json({ error: error.code ?? "unavailable" }, { status: error.status ?? 503 }),
  requireAdmin: mocks.requireAdmin,
}));
vi.mock("@/lib/admin/adminAuditRepository", () => ({ writeAdminAuditEvent: mocks.writeAdminAuditEvent }));
vi.mock("@/lib/admin/userRepository", () => ({ getAdminUser: mocks.getAdminUser }));

import { GET } from "@/app/api/admin/users/[id]/route";

afterEach(() => { vi.clearAllMocks(); });

describe("admin user profile route", () => {
  const id = "11111111-1111-4111-8111-111111111111";

  it("requires users.read, returns only the profile projection, and audits the read", async () => {
    mocks.requireAdmin.mockResolvedValue({ userId: "operator-1", requestId: "request-1", clientContext: {} });
    mocks.getAdminUser.mockResolvedValue({ userId: id, email: "person@example.test", createdAt: "2026-10-01T00:00:00Z", lastSignInAt: null, personalListCount: 0, personalEntryLinkCount: 0 });

    const response = await GET(new Request(`https://2000.dilum.io/api/admin/users/${id}`), { params: Promise.resolve({ id }) });

    expect(mocks.requireAdmin).toHaveBeenCalledWith(expect.any(Request), "users.read");
    expect(mocks.getAdminUser).toHaveBeenCalledWith(id);
    expect(mocks.writeAdminAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ action: "user.profile.read", targetType: "user_profile", targetId: id, outcome: "success" }));
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.json()).toMatchObject({ userId: id, personalListCount: 0, personalEntryLinkCount: 0 });
  });

  it("rejects malformed identifiers without querying account data", async () => {
    mocks.requireAdmin.mockResolvedValue({ userId: "operator-1", requestId: "request-1", clientContext: {} });
    const response = await GET(new Request("https://2000.dilum.io/api/admin/users/not-a-uuid"), { params: Promise.resolve({ id: "not-a-uuid" }) });
    expect(response.status).toBe(404);
    expect(mocks.getAdminUser).not.toHaveBeenCalled();
  });

  it("returns not-found and records the profile lookup", async () => {
    mocks.requireAdmin.mockResolvedValue({ userId: "operator-1", requestId: "request-1", clientContext: {} });
    mocks.getAdminUser.mockResolvedValue(null);
    const response = await GET(new Request(`https://2000.dilum.io/api/admin/users/${id}`), { params: Promise.resolve({ id }) });
    expect(response.status).toBe(404);
    expect(mocks.writeAdminAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ action: "user.profile.read", targetId: id, outcome: "failure" }));
  });

  it("does not query profile facts without users.read", async () => {
    mocks.requireAdmin.mockRejectedValue({ status: 403, code: "forbidden" });
    const response = await GET(new Request(`https://2000.dilum.io/api/admin/users/${id}`), { params: Promise.resolve({ id }) });
    expect(response.status).toBe(403);
    expect(mocks.getAdminUser).not.toHaveBeenCalled();
  });
});
