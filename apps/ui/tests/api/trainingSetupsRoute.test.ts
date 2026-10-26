import { NextRequest } from "next/server";
import { beforeEach, expect, test, vi } from "vitest";
const { auth, rpc, read } = vi.hoisted(() => ({ auth: vi.fn(), rpc: vi.fn(), read: vi.fn() }));
vi.mock("@/lib/platform/serverSupabase", () => ({
  getAuthenticatedSupabase: auth,
  jsonNoStore: (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } }),
}));
vi.mock("@/lib/training/setups/server", () => ({ readAccountTrainingSetups: read }));
import { GET, PUT } from "@/app/api/training/setups/route";
const snapshot = { revision: 0, document: { schemaVersion: 1, trainings: [], mainTrainingId: null } };
const request = (body: unknown = { expectedRevision: 0, document: snapshot.document }) =>
  new NextRequest("http://localhost/api/training/setups", { method: "PUT", body: JSON.stringify(body) });
beforeEach(() => {
  vi.clearAllMocks();
  auth.mockResolvedValue({ supabase: { rpc }, user: { id: "owned-user" }, principal: { authKind: "first_party" } });
  read.mockResolvedValue(snapshot);
  rpc.mockResolvedValue({ data: { ...snapshot, revision: 1, conflict: false }, error: null });
});
test("requires authenticated first-party access before reading or writing", async () => {
  auth.mockResolvedValue(Response.json({ error: "unauthorized" }, { status: 401 }));
  expect((await GET(request())).status).toBe(401);
  expect((await PUT(request())).status).toBe(401);
  auth.mockResolvedValue({ principal: { authKind: "connected_client" } });
  expect((await PUT(request())).status).toBe(403);
  expect(read).not.toHaveBeenCalled();
  expect(rpc).not.toHaveBeenCalled();
});
test("reads only the authenticated account and never caches settings", async () => {
  const response = await GET(request());
  expect(await response.json()).toEqual(snapshot);
  expect(read).toHaveBeenCalledWith({ rpc }, "owned-user");
  expect(response.headers.get("cache-control")).toBe("no-store");
});
test("save passes only typed document/revision, no client-supplied user or scheduler state", async () => {
  const response = await PUT(request({ expectedRevision: 0, document: snapshot.document, userId: "victim" }));
  expect(response.status).toBe(200);
  expect(rpc).toHaveBeenCalledWith("save_account_training_setups_v1", { p_expected_revision: 0, p_document: snapshot.document });
});
test("reports another device's revision without overwriting it", async () => {
  rpc.mockResolvedValue({ data: { ...snapshot, revision: 4, conflict: true }, error: null });
  const response = await PUT(request());
  expect(response.status).toBe(409);
  expect(await response.json()).toEqual({ error: "training_setups_conflict", snapshot: { ...snapshot, revision: 4 } });
});
test("rejects malformed and oversized requests before mutation", async () => {
  expect((await PUT(request({ expectedRevision: -1, document: snapshot.document }))).status).toBe(400);
  expect((await PUT(request({ expectedRevision: 0, document: { ...snapshot.document, mainTrainingId: "missing" } }))).status).toBe(400);
  expect((await PUT(request({ padding: "x".repeat(200001) }))).status).toBe(413);
  expect(rpc).not.toHaveBeenCalled();
});
test("does not mask read failures or invalid persisted data with an empty account", async () => {
  read.mockResolvedValue(null);
  expect((await GET(request())).status).toBe(503);
  rpc.mockResolvedValue({ data: { ...snapshot, conflict: false, revision: "bad" }, error: null });
  expect((await PUT(request())).status).toBe(503);
});
