import { NextRequest } from "next/server";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
const { authenticate, rpc, scope } = vi.hoisted(() => ({
  authenticate: vi.fn(),
  rpc: vi.fn(),
  scope: vi.fn(),
}));
vi.mock("@/lib/platform/serverSupabase", () => ({
  getAuthenticatedSupabase: authenticate,
  requirePlatformScope: scope,
  jsonNoStore: (body: unknown, status = 200) =>
    Response.json(body, { status, headers: { "cache-control": "no-store" } }),
}));
import { GET } from "@/app/api/library/author-entries/[entryId]/archive/route";
const entryId = "75400000-0000-4000-8000-000000000002";
const owner = {
  user: { id: "actual-owner" },
  principal: { authKind: "first_party" },
  supabase: { rpc },
};
const request = new NextRequest(
  "http://localhost/api/library/author-entries/id/archive",
);
const params = () => ({ params: Promise.resolve({ entryId }) });
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_AUTHOR_ENTRY_ARCHIVE_ENABLED", "true");
  authenticate.mockResolvedValue(owner);
  scope.mockReturnValue(null);
  rpc.mockResolvedValue({
    data: {
      entryId,
      archived: true,
      archivedAt: "2026-10-25T16:00:00Z",
      sourceVersion: 1,
      raw: { definition: "must not escape" },
    },
    error: null,
  });
});
afterEach(() => {
  vi.unstubAllEnvs();
});
test("owner-only outcome read returns no content and is never cached", async () => {
  const response = await GET(request, params());
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await response.json()).toEqual({
    entryId,
    archived: true,
    archivedAt: "2026-10-25T16:00:00Z",
    sourceVersion: 1,
  });
  expect(rpc).toHaveBeenCalledWith("read_author_entry_archive_status_v1", {
    p_user_id: "actual-owner",
    p_entry_id: entryId,
  });
});
test("missing and foreign entries are indistinguishable", async () => {
  for (const code of ["42501", "P0002"]) {
    rpc.mockResolvedValueOnce({
      data: null,
      error: { code, message: "private dictionary" },
    });
    const response = await GET(request, params());
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: "author_entry_not_available",
    });
  }
});
test("connected and feature-disabled clients cannot probe archives", async () => {
  authenticate.mockResolvedValueOnce({
    ...owner,
    principal: { authKind: "connected_client" },
  });
  expect((await GET(request, params())).status).toBe(403);
  vi.stubEnv("NEXT_PUBLIC_AUTHOR_ENTRY_ARCHIVE_ENABLED", "false");
  expect((await GET(request, params())).status).toBe(503);
  expect(rpc).not.toHaveBeenCalled();
});
test("invalid IDs and inconsistent state fail closed", async () => {
  expect(
    (await GET(request, { params: Promise.resolve({ entryId: "not-an-id" }) }))
      .status,
  ).toBe(400);
  rpc.mockResolvedValueOnce({
    data: { entryId, archived: false, archivedAt: "present", sourceVersion: 1 },
    error: null,
  });
  expect((await GET(request, params())).status).toBe(409);
});
