import { NextRequest } from "next/server";
import { beforeEach, expect, test, vi } from "vitest";
const { auth, rpc } = vi.hoisted(() => ({ auth: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/platform/serverSupabase", () => ({
  getAuthenticatedSupabase: auth,
  jsonNoStore: (body: unknown, status = 200) =>
    Response.json(body, { status, headers: { "cache-control": "no-store" } }),
}));
import { GET, POST } from "@/app/api/library/collection-labels/route";
const userId = "00000000-0000-4000-8000-000000000001";
const snapshot = { revision: 0, labels: [], assignments: [] };
const request = (
  body: unknown = {
    expectedRevision: 0,
    operation: { type: "create", name: "Course" },
  },
) =>
  new NextRequest("http://localhost/api/library/collection-labels", {
    method: "POST",
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.clearAllMocks();
  auth.mockResolvedValue({
    user: { id: userId },
    principal: { authKind: "first_party" },
    supabase: { rpc },
  });
  rpc.mockImplementation(() => ({
    abortSignal: () => Promise.resolve({ data: snapshot, error: null }),
  }));
});
test("authentication and first-party boundary precede reads and mutations", async () => {
  auth.mockResolvedValue(
    Response.json({ error: "unauthorized" }, { status: 401 }),
  );
  expect((await GET(request())).status).toBe(401);
  expect((await POST(request())).status).toBe(401);
  auth.mockResolvedValue({ principal: { authKind: "connected_client" } });
  expect((await GET(request())).status).toBe(403);
  expect((await POST(request())).status).toBe(403);
  expect(rpc).not.toHaveBeenCalled();
});
test("reads and writes bind the authenticated owner and prohibit cached personal responses", async () => {
  const read = await GET(request());
  expect(await read.json()).toEqual(snapshot);
  expect(read.headers.get("cache-control")).toBe("no-store");
  expect(rpc).toHaveBeenCalledWith("read_collection_labels_v1", {
    p_user_id: userId,
  });
  const write = await POST(request());
  expect(write.status).toBe(200);
  expect(rpc).toHaveBeenCalledWith("mutate_collection_labels_v1", {
    p_user_id: userId,
    p_expected_revision: 0,
    p_operation: { type: "create", name: "Course" },
  });
  expect(write.headers.get("cache-control")).toBe("no-store");
});
test("invalid/oversized/retargeted bodies never reach a database mutation", async () => {
  expect(
    (
      await POST(
        request({
          expectedRevision: 0,
          userId: "victim",
          operation: { type: "create", name: "Course" },
        }),
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await POST(
        request({
          expectedRevision: -1,
          operation: { type: "delete", id: userId },
        }),
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await POST(
        request({
          expectedRevision: 0,
          operation: { type: "create", name: "x".repeat(70000) },
        }),
      )
    ).status,
  ).toBe(413);
  const broken = new NextRequest(
    "http://localhost/api/library/collection-labels",
    { method: "POST", body: "{" },
  );
  expect((await POST(broken)).status).toBe(400);
  expect(rpc).not.toHaveBeenCalled();
});
test.each([
  ["label_catalog_conflict", 409],
  ["label_not_found", 404],
  ["collection_not_found", 404],
  ["label_cycle", 400],
  ["label_depth_limit", 400],
  ["label_catalog_limit", 400],
  ["unauthorized", 403],
  ["private SQL debug payload", 503],
])("maps %s safely", async (message, status) => {
  rpc.mockImplementation(() => ({
    abortSignal: () => Promise.resolve({ data: null, error: { message } }),
  }));
  const result = await POST(request());
  expect(result.status).toBe(status);
  expect(await result.json()).toEqual({
    error: status === 503 ? "collection_labels_unavailable" : message,
  });
});
test("malformed database snapshots and unavailable transport fail closed without private details", async () => {
  rpc.mockImplementation(() => ({
    abortSignal: () =>
      Promise.resolve({ data: { ...snapshot, revision: "bad" }, error: null }),
  }));
  expect((await GET(request())).status).toBe(503);
  rpc.mockImplementation(() => {
    throw new Error("private server URL");
  });
  const result = await GET(request());
  expect(result.status).toBe(503);
  expect(await result.json()).toEqual({
    error: "collection_labels_unavailable",
  });
});
