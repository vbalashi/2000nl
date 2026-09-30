import { NextRequest } from "next/server";
import { beforeEach, expect, test, vi } from "vitest";
const { auth, service, operation, readScope } = vi.hoisted(() => ({
  auth: vi.fn(),
  service: vi.fn(),
  operation: vi.fn(),
  readScope: vi.fn(),
}));
vi.mock("@/lib/platform/serverSupabase", () => ({
  getAuthenticatedSupabase: auth,
  getPlatformServiceSupabase: service,
  requirePlatformScope: readScope,
  jsonNoStore: (body: unknown, status = 200) =>
    Response.json(body, { status, headers: { "cache-control": "no-store" } }),
}));
vi.mock("@/lib/platform/platformV2LookupService", () => ({
  performPlatformV2Lookup: operation,
}));
vi.mock("@/lib/platform/platformV2Rollout", () => ({
  platformV2LookupEnabled: () => true,
}));
import { POST } from "@/app/api/library/search/route";
const id = "8746de41-779a-444d-be38-287efc416d8f";
const owner = {
  user: { id: "authenticated-owner" },
  principal: { authKind: "first_party" },
  supabase: {},
};
const client = { supabase: {} };
const base = {
  query: "goed",
  contentLanguageCode: "nl",
  cardTypeId: "word-to-definition",
};
const request = (body: unknown) =>
  new NextRequest("http://localhost/api/library/search", {
    method: "POST",
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.clearAllMocks();
  auth.mockResolvedValue(owner);
  service.mockReturnValue(client);
  readScope.mockReturnValue(null);
  operation.mockResolvedValue({ status: 200, payload: { groups: [] } });
});
test("first-party principal owns search; caller IDs are ignored and empty source sets remain empty", async () => {
  const response = await POST(
    request({ ...base, userId: "victim", dictionaryIds: [] }),
  );
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(operation).toHaveBeenCalledWith(
    { kind: "authenticated", auth: owner, service: client },
    expect.objectContaining({ query: "goed", intent: "dictionary-lookup" }),
    { dictionaryIds: [] },
  );
});
test("canonical scoped IDs and unspecified all-sources selection", async () => {
  await POST(request({ ...base, dictionaryIds: [id.toUpperCase(), id] }));
  expect(operation.mock.calls[0][2]).toEqual({ dictionaryIds: [id] });
  await POST(request(base));
  expect(operation.mock.calls[1][2]).toEqual({ dictionaryIds: null });
});
test("anonymous, connected and scope-denied callers cannot reach the service role", async () => {
  auth.mockResolvedValue(
    Response.json({ error: "unauthorized" }, { status: 401 }),
  );
  expect((await POST(request(base))).status).toBe(401);
  auth.mockResolvedValue({
    ...owner,
    principal: { authKind: "connected_client" },
  });
  expect((await POST(request(base))).status).toBe(403);
  auth.mockResolvedValue(owner);
  readScope.mockReturnValue(
    Response.json({ error: "scope_required" }, { status: 403 }),
  );
  expect((await POST(request(base))).status).toBe(403);
  expect(service).not.toHaveBeenCalled();
  expect(operation).not.toHaveBeenCalled();
});
test("invalid identities, non-query/external requests and streamed oversized bodies stop before lookup", async () => {
  for (const patch of [
    { dictionaryIds: "all" },
    { dictionaryIds: ["not-uuid"] },
    { dictionaryIds: Array(101).fill(id) },
    { entryId: id, query: undefined },
    { intent: "external-click" },
  ])
    expect((await POST(request({ ...base, ...patch }))).status).toBe(400);
  expect(
    (await POST(request({ ...base, query: "x".repeat(17000) }))).status,
  ).toBe(413);
  expect(operation).not.toHaveBeenCalled();
});
test("operation errors and unavailable server clients remain explicit", async () => {
  operation.mockResolvedValue({
    status: 400,
    payload: { error: "invalid_cursor" },
  });
  const response = await POST(request(base));
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ error: "invalid_cursor" });
  service.mockReturnValue(
    Response.json({ error: "unavailable" }, { status: 503 }),
  );
  expect((await POST(request(base))).status).toBe(503);
});
