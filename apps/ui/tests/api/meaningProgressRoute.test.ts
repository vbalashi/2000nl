import { beforeEach, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";
const rpc = vi.fn(),
  auth = vi.fn();
vi.mock("@/lib/platform/serverSupabase", () => ({
  getAuthenticatedSupabase: auth,
  getPlatformServiceSupabase: () => ({ supabase: { rpc } }),
  jsonNoStore: (body: unknown, status = 200) => Response.json(body, { status }),
}));
const { GET, POST } = await import("@/app/api/training/meaning-progress/route");
const id = "00000000-0000-4000-8000-000000000001";
const body = { entryId: id, clientEventId: id, revision: "a".repeat(64) };
const post = (value: unknown) =>
  POST(
    new NextRequest("http://localhost/api/training/meaning-progress", {
      method: "POST",
      body: JSON.stringify(value),
    }),
  );
beforeEach(() => {
  vi.clearAllMocks();
  auth.mockResolvedValue({
    principal: { userId: "authenticated-owner", authKind: "first_party" },
    supabase: { rpc },
  });
  rpc.mockResolvedValue({ data: { status: "accepted" }, error: null });
});
test("derives the mutation principal from authenticated server state", async () => {
  expect((await post(body)).status).toBe(200);
  expect(rpc).toHaveBeenCalledWith("resume_meaning_learning_as_principal_v1", {
    p_user_id: "authenticated-owner",
    p_entry_id: id,
    p_expected_revision: body.revision,
    p_client_event_id: id,
  });
  expect((await post({ ...body, userId: "someone-else" })).status).toBe(400);
  expect(rpc).toHaveBeenCalledTimes(1);
});
test("keeps progress private and refuses connected-client first-party actions", async () => {
  auth.mockResolvedValueOnce(new Response(null, { status: 401 }));
  expect(
    (
      await GET(
        new NextRequest(
          `http://localhost/api/training/meaning-progress?entryId=${id}`,
        ),
      )
    ).status,
  ).toBe(401);
  auth.mockResolvedValueOnce({
    principal: { userId: "owner", authKind: "connected_client" },
  });
  expect((await post(body)).status).toBe(403);
  expect(rpc).not.toHaveBeenCalled();
});
test("returns a conflict without exposing database details or mutating a different revision", async () => {
  rpc.mockResolvedValue({
    data: null,
    error: { message: "meaning_progress_conflict private internal details" },
  });
  const response = await post(body);
  expect(response.status).toBe(409);
  expect(await response.json()).toEqual({ error: "meaning_progress_conflict" });
});
test("rejects malformed query and mutation shapes before any database call", async () => {
  expect(
    (
      await GET(
        new NextRequest(
          "http://localhost/api/training/meaning-progress?entryId=bad",
        ),
      )
    ).status,
  ).toBe(400);
  expect((await post({ ...body, revision: "untracked" })).status).toBe(400);
  expect((await post(null)).status).toBe(400);
  expect(rpc).not.toHaveBeenCalled();
});
