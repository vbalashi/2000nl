import { describe, expect, it, vi } from "vitest";

const { requireAdmin, listAdminDictionaries, readAdminAuditEvents, AdminAccessError } = vi.hoisted(() => {
  class MockAdminAccessError extends Error {
    constructor(readonly status: number, readonly code: string) { super(code); }
  }
  return {
    requireAdmin: vi.fn(),
    listAdminDictionaries: vi.fn(),
    readAdminAuditEvents: vi.fn(),
    AdminAccessError: MockAdminAccessError,
  };
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/admin/adminAccess", () => ({
  AdminAccessError,
  adminErrorResponse: (error: { status: number; code: string }) => Response.json({ error: error.code }, {
    status: error.status,
    headers: { "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie" },
  }),
  requireAdmin,
}));
vi.mock("@/lib/admin/dictionaryRepository", () => ({ listAdminDictionaries }));
vi.mock("@/lib/admin/adminAuditRepository", () => ({ readAdminAuditEvents, writeAdminAuditEvent: vi.fn() }));

import { GET as dictionaryList } from "@/app/api/admin/dictionaries/route";
import { GET as auditList } from "@/app/api/admin/audit/route";

describe("direct admin API authorization", () => {
  it("does not run dictionary reads for unauthenticated direct requests", async () => {
    requireAdmin.mockRejectedValueOnce(new AdminAccessError(401, "unauthorized"));
    const response = await dictionaryList(new Request("https://2000.dilum.io/api/admin/dictionaries"));
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(listAdminDictionaries).not.toHaveBeenCalled();
  });

  it("does not run journal reads for direct requests lacking audit.read", async () => {
    requireAdmin.mockRejectedValueOnce(new AdminAccessError(403, "forbidden"));
    const response = await auditList(new Request("https://2000.dilum.io/api/admin/audit"));
    expect(response.status).toBe(403);
    expect(readAdminAuditEvents).not.toHaveBeenCalled();
  });
});
