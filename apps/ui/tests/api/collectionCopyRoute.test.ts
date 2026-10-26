import { NextRequest } from "next/server";
import { beforeEach, afterEach, expect, test, vi } from "vitest";
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
import { GET, POST } from "@/app/api/library/collection-copies/route";
const listId = "75500000-0000-4000-8000-000000000001",
  operationId = "75500000-0000-4000-8000-000000000002",
  expectedRevision = "a".repeat(64);
const command = { listId, operationId, expectedRevision };
const get = (query: string) =>
  new NextRequest(`http://localhost/api/library/collection-copies${query}`);
const post = (body: unknown) =>
  new NextRequest("http://localhost/api/library/collection-copies", {
    method: "POST",
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_INDEPENDENT_ENTRY_COPY_ENABLED", "true");
  authenticate.mockResolvedValue({
    principal: { authKind: "first_party" },
    supabase: { rpc },
  });
  scope.mockReturnValue(null);
});
afterEach(() => {
  vi.unstubAllEnvs();
});
test("preflight exposes count and opaque revision without private candidates", async () => {
  rpc.mockResolvedValue({
    data: {
      listId,
      revision: expectedRevision,
      borrowedCount: 2,
      canCopy: false,
      candidates: [{ entryId: "private", raw: "secret" }],
    },
    error: null,
  });
  const response = await GET(get(`?listId=${listId}`));
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await response.json()).toEqual({
    listId,
    revision: expectedRevision,
    borrowedCount: 2,
    canCopy: false,
  });
});
test("command cannot accept injected entries, principals or target collections", async () => {
  rpc.mockResolvedValue({
    data: { operationId, listId, status: "completed", copiedCount: 2 },
    error: null,
  });
  expect((await POST(post(command))).status).toBe(200);
  expect(rpc).toHaveBeenCalledWith("copy_collection_independent_entries_v1", {
    p_operation_id: operationId,
    p_list_id: listId,
    p_expected_revision: expectedRevision,
  });
  for (const extra of [
    { entries: [listId] },
    { userId: listId },
    { targetDictionaryId: listId },
  ])
    expect((await POST(post({ ...command, ...extra }))).status).toBe(400);
  expect(rpc).toHaveBeenCalledOnce();
});
test("a lost result can be read through an owner-scoped receipt without another command", async () => {
  rpc.mockResolvedValue({
    data: { operationId, listId, status: "completed", copiedCount: 2 },
    error: null,
  });
  expect(await (await GET(get(`?operationId=${operationId}`))).json()).toEqual({
    operationId,
    listId,
    status: "completed",
    copiedCount: 2,
  });
  expect(rpc).toHaveBeenCalledWith("read_collection_copy_receipt_v1", {
    p_operation_id: operationId,
  });
});
test("changed collections, bounds and source denial stay explicit without leaking DB details", async () => {
  for (const [error, status] of [
    [{ message: "copy_collection_changed" }, 409],
    [{ message: "copy_collection_too_large" }, 422],
    [{ code: "42501", message: "private title" }, 404],
  ] as const) {
    rpc.mockResolvedValue({ data: null, error });
    const response = await POST(post(command));
    expect(response.status).toBe(status);
    expect(JSON.stringify(await response.json())).not.toContain(
      "private title",
    );
  }
});
test("mismatched receipts and oversized bodies fail closed", async () => {
  rpc.mockResolvedValue({
    data: {
      operationId,
      listId: operationId,
      status: "completed",
      copiedCount: 2,
    },
    error: null,
  });
  expect((await POST(post(command))).status).toBe(502);
  expect(
    (await POST(post({ ...command, extra: "x".repeat(2000) }))).status,
  ).toBe(400);
});
