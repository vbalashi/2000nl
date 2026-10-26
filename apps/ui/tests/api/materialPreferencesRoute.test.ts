import { NextRequest } from "next/server";
import { beforeEach, expect, test, vi } from "vitest";
const { auth, load, save, repository } = vi.hoisted(() => ({
  auth: vi.fn(),
  load: vi.fn(),
  save: vi.fn(),
  repository: vi.fn(),
}));
vi.mock("@/lib/platform/serverSupabase", () => ({
  getAuthenticatedSupabase: auth,
  jsonNoStore: (body: unknown, status = 200) =>
    Response.json(body, { status, headers: { "cache-control": "no-store" } }),
}));
vi.mock("@/lib/training/material/repository", () => ({
  createMaterialPreferencesRepository: repository,
}));
import { GET, PUT } from "@/app/api/settings/material/route";
const snapshot = {
  revision: 0,
  document: {
    schemaVersion: 1,
    learningLanguages: [],
    disabledDictionaryIds: [],
  },
};
const client = { marker: "request-bound-auth-client" };
const request = (
  body: unknown = { expectedRevision: 0, document: snapshot.document },
) =>
  new NextRequest("http://localhost/api/settings/material", {
    method: "PUT",
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.clearAllMocks();
  auth.mockResolvedValue({
    supabase: client,
    user: { id: "owner" },
    principal: { authKind: "first_party" },
  });
  repository.mockReturnValue({ load, save });
  load.mockResolvedValue(snapshot);
  save.mockResolvedValue({
    kind: "saved",
    snapshot: { ...snapshot, revision: 1 },
  });
});
test("unauthenticated and connected clients cannot read/write account preferences", async () => {
  auth.mockResolvedValue(
    Response.json({ error: "unauthorized" }, { status: 401 }),
  );
  expect((await GET(request())).status).toBe(401);
  expect((await PUT(request())).status).toBe(401);
  auth.mockResolvedValue({ principal: { authKind: "connected_client" } });
  expect((await GET(request())).status).toBe(403);
  expect((await PUT(request())).status).toBe(403);
  expect(repository).not.toHaveBeenCalled();
});
test("only the authenticated account is read and responses are never cached", async () => {
  const response = await GET(request());
  expect(await response.json()).toEqual(snapshot);
  expect(load).toHaveBeenCalledWith("owner");
  expect(repository).toHaveBeenCalledWith(client);
  expect(response.headers.get("cache-control")).toBe("no-store");
});
test("caller IDs cannot retarget saves or alter scheduling/access state", async () => {
  expect(
    (
      await PUT(
        request({
          expectedRevision: 0,
          document: snapshot.document,
          userId: "victim",
        }),
      )
    ).status,
  ).toBe(200);
  expect(save).toHaveBeenCalledWith(0, snapshot.document);
  expect(repository).toHaveBeenCalledWith(client);
});
test("a device conflict returns the authoritative snapshot with 409", async () => {
  save.mockResolvedValue({
    kind: "conflict",
    snapshot: { ...snapshot, revision: 5 },
  });
  const response = await PUT(request());
  expect(response.status).toBe(409);
  expect(await response.json()).toEqual({
    error: "material_preferences_conflict",
    snapshot: { ...snapshot, revision: 5 },
  });
});
test("invalid documents, revisions and oversized bodies cannot mutate settings", async () => {
  expect(
    (await PUT(request({ expectedRevision: -1, document: snapshot.document })))
      .status,
  ).toBe(400);
  expect(
    (
      await PUT(
        request({
          expectedRevision: 0,
          document: {
            ...snapshot.document,
            learningLanguages: [{ code: "nl", paused: true }],
          },
        }),
      )
    ).status,
  ).toBe(400);
  expect((await PUT(request({ padding: "x".repeat(65537) }))).status).toBe(413);
  expect(save).not.toHaveBeenCalled();
});
test("failures do not fall back to empty preferences or successful saves", async () => {
  load.mockRejectedValue(new Error("database detail"));
  expect((await GET(request())).status).toBe(503);
  save.mockRejectedValue(new Error("database detail"));
  const response = await PUT(request());
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain("database detail");
});
