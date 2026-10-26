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
import { GET, POST } from "@/app/api/library/entry-copies/route";
const sourceEntryId = "75500000-0000-4000-8000-000000000001",
  operationId = "75500000-0000-4000-8000-000000000002",
  entryId = "75500000-0000-4000-8000-000000000003";
const dictionaryId = "75500000-0000-4000-8000-000000000004";
const expectedRevision = "a".repeat(64),
  command = { sourceEntryId, operationId, expectedRevision };
const owner = {
  user: { id: "actual-user" },
  principal: { authKind: "first_party" },
  supabase: { rpc },
};
const request = (query = "") =>
  new NextRequest(`http://localhost/api/library/entry-copies${query}`);
const post = (body: unknown) =>
  new NextRequest("http://localhost/api/library/entry-copies", {
    method: "POST",
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_INDEPENDENT_ENTRY_COPY_ENABLED", "true");
  authenticate.mockResolvedValue(owner);
  scope.mockReturnValue(null);
});
afterEach(() => {
  vi.unstubAllEnvs();
});
test("closed command derives destination and identity from authenticated principal", async () => {
  rpc.mockResolvedValue({
    data: {
      operationId,
      entryId,
      dictionaryId,
      headword: "woord",
      languageCode: "nl",
      status: "completed",
      raw: "secret",
    },
    error: null,
  });
  const response = await POST(post(command));
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await response.json()).toEqual({
    operationId,
    entryId,
    dictionaryId,
    headword: "woord",
    languageCode: "nl",
    status: "completed",
  });
  expect(rpc).toHaveBeenCalledWith("copy_independent_entry_v1", {
    p_operation_id: operationId,
    p_source_entry_id: sourceEntryId,
    p_expected_revision: expectedRevision,
  });
  for (const body of [
    { ...command, userId: "foreign" },
    { ...command, targetDictionaryId: entryId },
    { ...command, raw: {} },
    { ...command, expectedRevision: "x" },
  ])
    expect((await POST(post(body))).status).toBe(400);
  expect(rpc).toHaveBeenCalledTimes(1);
});
test("preview returns only authorized source summary", async () => {
  rpc.mockResolvedValue({
    data: {
      sourceEntryId,
      revision: expectedRevision,
      headword: "woord",
      languageCode: "nl",
      sourceDictionaryName: "Dutch",
      meaningCount: 2,
      raw: { secret: true },
    },
    error: null,
  });
  const response = await GET(request(`?sourceEntryId=${sourceEntryId}`));
  expect(response.status).toBe(200);
  expect(await response.json()).not.toHaveProperty("raw");
  expect(
    (
      await GET(
        request(`?sourceEntryId=${sourceEntryId}&operationId=${operationId}`),
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await GET(
        request(`?operationId=${operationId}&operationId=${operationId}`),
      )
    ).status,
  ).toBe(400);
});
test("receipt is read only and contract mismatches fail closed", async () => {
  rpc.mockResolvedValue({
    data: { operationId, status: "unknown" },
    error: null,
  });
  expect(
    await (await GET(request(`?operationId=${operationId}`))).json(),
  ).toEqual({ operationId, status: "unknown" });
  rpc.mockResolvedValue({
    data: { operationId: sourceEntryId, entryId, status: "completed" },
    error: null,
  });
  expect((await POST(post(command))).status).toBe(502);
});
test("revocation, revision conflicts and unsupported snapshots return safe errors", async () => {
  for (const [error, status] of [
    [{ code: "42501", message: "secret" }, 404],
    [{ message: "copy_source_changed" }, 409],
    [{ message: "copy_asset_snapshot_unsupported" }, 422],
    [{ message: "unexpected database secret" }, 500],
  ] as const) {
    rpc.mockResolvedValue({ data: null, error });
    const response = await POST(post(command));
    expect(response.status).toBe(status);
    expect(JSON.stringify(await response.json())).not.toContain("secret");
  }
});
test("unauthenticated, connected and disabled requests cannot invoke copy RPCs", async () => {
  authenticate.mockResolvedValueOnce(
    Response.json({ error: "unauthorized" }, { status: 401 }),
  );
  expect((await POST(post(command))).status).toBe(401);
  authenticate.mockResolvedValueOnce({
    ...owner,
    principal: { authKind: "connected_client" },
  });
  expect((await GET(request(`?sourceEntryId=${sourceEntryId}`))).status).toBe(
    403,
  );
  vi.stubEnv("NEXT_PUBLIC_INDEPENDENT_ENTRY_COPY_ENABLED", "false");
  expect((await POST(post(command))).status).toBe(503);
  expect(rpc).not.toHaveBeenCalled();
});
