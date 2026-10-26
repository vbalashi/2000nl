import { beforeEach, describe, expect, it, vi } from "vitest";
const { requireAdmin, read, write } = vi.hoisted(() => ({ requireAdmin: vi.fn(), read: vi.fn(), write: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/admin/adminAccess", () => ({ requireAdmin, adminErrorResponse: () => Response.json({ error: "unavailable" }, { status: 503 }) }));
vi.mock("@/lib/admin/adminAuditRepository", () => ({ readAdminAuditEvents: read, writeAdminAuditEvent: write }));
import { GET as journal } from "@/app/api/admin/audit/route";
import { GET as session } from "@/app/api/admin/session/route";
beforeEach(() => {
  vi.clearAllMocks();
  requireAdmin.mockResolvedValue({ userId: "operator", email: "operator@example.test", permissions: ["audit.read"], requestId: "request", clientContext: {} });
  write.mockResolvedValue(undefined);
});
describe("journal authorization and stable pagination", () => {
  it("allows audit-only operators to bootstrap their UI session", async () => {
    const req = new Request("https://example.test/api/admin/session");
    const response = await session(req);
    expect(response.status).toBe(200);
    expect(requireAdmin).toHaveBeenCalledWith(req);
    expect(await response.json()).toMatchObject({ permissions: ["audit.read"] });
  });
  it("keeps the same upper and lower bounds across pages despite recording reads", async () => {
    const rows = Array.from({ length: 30 }, (_, id) => ({ id, createdAt: new Date(Date.now() - (id + 1) * 1000).toISOString() }));
    read.mockImplementation(async ({ page, pageSize, before }: { page: number; pageSize: number; before: string }) => {
      const filtered = rows.filter(row => row.createdAt < before);
      return { items: filtered.slice((page - 1) * pageSize, page * pageSize), hasNext: filtered.length > page * pageSize };
    });
    write.mockImplementation(async () => { rows.unshift({ id: rows.length, createdAt: new Date(Date.now() + 1000).toISOString() }); });
    const first = await (await journal(new Request("https://example.test/api/admin/audit?page=1"))).json();
    const second = await (await journal(new Request(`https://example.test/api/admin/audit?page=2&before=${encodeURIComponent(first.before)}`))).json();
    expect(first.items).toHaveLength(25); expect(second.items).toHaveLength(5);
    expect(new Set([...first.items, ...second.items].map((row: { id: number }) => row.id)).size).toBe(30);
    expect(read.mock.calls[0][0].before).toBe(read.mock.calls[1][0].before);
    expect(read.mock.calls[0][0].since).toBe(read.mock.calls[1][0].since);
  });
  it("does not record successful reads when the data read fails", async () => {
    read.mockRejectedValueOnce(new Error("DB unavailable"));
    expect((await journal(new Request("https://example.test/api/admin/audit"))).status).toBe(503);
    expect(write).not.toHaveBeenCalled();
  });
  it("does not return journal data when required auditing fails", async () => {
    read.mockResolvedValueOnce({ items: [], hasNext: false });
    write.mockRejectedValueOnce(new Error("Audit unavailable"));
    expect((await journal(new Request("https://example.test/api/admin/audit"))).status).toBe(503);
  });
});
