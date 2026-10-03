import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  getAdminDictionaryMetadata: vi.fn(),
  replaceDictionaryAudience: vi.fn(),
  updateDictionaryPublication: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/admin/adminAccess", () => ({
  adminErrorResponse: (error: { status?: number; code?: string }) => Response.json({ error: error.code ?? "error" }, { status: error.status ?? 500 }),
  requireAdmin: mocks.requireAdmin,
}));
vi.mock("@/lib/admin/dictionaryRepository", () => ({ getAdminDictionaryMetadata: mocks.getAdminDictionaryMetadata }));
vi.mock("@/lib/admin/publicationRepository", () => ({
  PUBLICATION_STATES: ["unpublished", "restricted", "general"],
  replaceDictionaryAudience: mocks.replaceDictionaryAudience,
  updateDictionaryPublication: mocks.updateDictionaryPublication,
}));

import { PATCH } from "@/app/api/admin/dictionaries/[id]/route";

afterEach(() => { vi.clearAllMocks(); });

describe("admin dictionary publication route", () => {
  it("sends publication, audience, and audit context to one atomic database operation", async () => {
    mocks.requireAdmin.mockResolvedValue({ userId: "operator-1", requestId: "request-1", clientContext: { clientIp: "198.51.100.7", userAgent: "Admin test" } });
    mocks.updateDictionaryPublication.mockResolvedValue({ publicationState: "restricted" });
    const response = await PATCH(new Request("https://2000.dilum.io/api/admin/dictionaries/11111111-1111-4111-8111-111111111111", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ publicationState: "restricted", groupKeys: ["trusted"], userIds: ["22222222-2222-4222-8222-222222222222"] }),
    }), { params: Promise.resolve({ id: "11111111-1111-4111-8111-111111111111" }) });

    expect(response.status).toBe(200);
    expect(mocks.updateDictionaryPublication).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111", "restricted", ["trusted"], ["22222222-2222-4222-8222-222222222222"],
      { operatorUserId: "operator-1", requestId: "request-1", clientIp: "198.51.100.7", userAgent: "Admin test" },
    );
  });

  it("rejects an incomplete audience before mutating publication", async () => {
    mocks.requireAdmin.mockResolvedValue({ userId: "operator-1", requestId: "request-1", clientContext: {} });
    const response = await PATCH(new Request("https://2000.dilum.io/api/admin/dictionaries/11111111-1111-4111-8111-111111111111", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ publicationState: "restricted", groupKeys: ["trusted"] }),
    }), { params: Promise.resolve({ id: "11111111-1111-4111-8111-111111111111" }) });

    expect(response.status).toBe(400);
    expect(mocks.updateDictionaryPublication).not.toHaveBeenCalled();
  });
});
