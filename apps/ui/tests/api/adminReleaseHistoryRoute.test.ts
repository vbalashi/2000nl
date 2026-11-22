import { beforeEach, expect, test, vi } from "vitest";
import { GET } from "@/app/api/admin/release-history/route";

const { requireAdmin, readReleaseCatalog } = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  readReleaseCatalog: vi.fn(),
}));
vi.mock("@/lib/admin/adminAccess", () => ({
  requireAdmin,
  adminErrorResponse: () => new Response(null, { status: 403 }),
}));
vi.mock("@/lib/releases/releaseCatalogServer", () => ({
  readReleaseCatalog,
  releaseLanguage: (value: string | null) => value ?? "en",
}));
beforeEach(() => { vi.resetAllMocks(); });

test("Admin history checks permission before requesting internal notes", async () => {
  requireAdmin.mockRejectedValue(new Error("denied"));
  const response = await GET(new Request("https://example.test/api/admin/release-history"));
  expect(response.status).toBe(403);
  expect(readReleaseCatalog).not.toHaveBeenCalled();
});

test("only an authorized operator can read all audiences with a validated cursor", async () => {
  readReleaseCatalog.mockResolvedValue({ items: [], nextVersion: null });
  const request = new Request("https://example.test/api/admin/release-history?before=0.19.75&language=ru");
  const response = await GET(request);
  expect(requireAdmin).toHaveBeenCalledWith(request, "audit.read");
  expect(readReleaseCatalog).toHaveBeenCalledWith("99999999.99999999.99999999", "ru", 25, "0.19.75", "admin");
  expect(response.headers.get("cache-control")).toContain("private");
  expect((await GET(new Request("https://example.test/api/admin/release-history?before=bad"))).status).toBe(400);
  expect(readReleaseCatalog).toHaveBeenCalledTimes(1);
});
