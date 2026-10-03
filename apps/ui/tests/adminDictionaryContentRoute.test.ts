import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  writeAdminAuditEvent: vi.fn(),
  listAdminDictionaryContent: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/admin/adminAccess", () => ({
  adminErrorResponse: (error: { status?: number; code?: string }) => Response.json({ error: error.code ?? "error" }, { status: error.status ?? 503 }),
  requireAdmin: mocks.requireAdmin,
}));
vi.mock("@/lib/admin/adminAuditRepository", () => ({ writeAdminAuditEvent: mocks.writeAdminAuditEvent }));
vi.mock("@/lib/admin/dictionaryRepository", () => ({ listAdminDictionaryContent: mocks.listAdminDictionaryContent }));

import { GET } from "@/app/api/admin/dictionaries/[id]/content/route";

afterEach(() => { vi.clearAllMocks(); });

describe("admin dictionary content route", () => {
  const id = "11111111-1111-4111-8111-111111111111";

  it("requires the separate content permission and audits before returning a page", async () => {
    mocks.requireAdmin.mockResolvedValue({ userId: "operator-1", requestId: "request-1", clientContext: {} });
    mocks.listAdminDictionaryContent.mockResolvedValue({
      items: [{ id: "entry-1", headword: "woord", languageCode: "nl", partOfSpeech: "noun", meaningId: 1, definition: "meaning" }],
      page: 2,
      pageSize: 50,
      total: 75,
      hasNext: false,
    });

    const response = await GET(new Request(`https://2000.dilum.io/api/admin/dictionaries/${id}/content?page=2&pageSize=50`), {
      params: Promise.resolve({ id }),
    });

    expect(mocks.requireAdmin).toHaveBeenCalledWith(expect.any(Request), "dictionary.content.read");
    expect(mocks.listAdminDictionaryContent).toHaveBeenCalledWith({ dictionaryId: id, page: 2, pageSize: 50 });
    expect(mocks.writeAdminAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      operatorUserId: "operator-1",
      action: "dictionary.content.read",
      outcome: "success",
      targetType: "dictionary_content",
      targetId: `${id}:page:2`,
      requestId: "request-1",
    }));
    expect(await response.json()).toMatchObject({ page: 2, total: 75, items: [{ headword: "woord" }] });
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("does not read content when the operator lacks the scoped permission", async () => {
    mocks.requireAdmin.mockRejectedValue({ status: 403, code: "forbidden" });
    const response = await GET(new Request(`https://2000.dilum.io/api/admin/dictionaries/${id}/content`), {
      params: Promise.resolve({ id }),
    });

    expect(response.status).toBe(403);
    expect(mocks.listAdminDictionaryContent).not.toHaveBeenCalled();
    expect(mocks.writeAdminAuditEvent).not.toHaveBeenCalled();
  });

  it("audits a failed content read and returns no partial data", async () => {
    mocks.requireAdmin.mockResolvedValue({ userId: "operator-1", requestId: "request-1", clientContext: {} });
    mocks.listAdminDictionaryContent.mockRejectedValue(new Error("database unavailable"));

    const response = await GET(new Request(`https://2000.dilum.io/api/admin/dictionaries/${id}/content`), {
      params: Promise.resolve({ id }),
    });

    expect(response.status).toBe(503);
    expect(mocks.writeAdminAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      action: "dictionary.content.read",
      outcome: "failure",
      targetId: `${id}:page:1`,
    }));
  });
});
