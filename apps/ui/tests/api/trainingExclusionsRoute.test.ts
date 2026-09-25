import { beforeEach, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";
const rpc = vi.fn(),
  auth = vi.fn(),
  scope = vi.fn();
vi.mock("@/lib/platform/serverSupabase", () => ({
  getAuthenticatedSupabase: auth,
  requirePlatformScope: scope,
  getPlatformServiceSupabase: () => ({ supabase: { rpc } }),
  jsonNoStore: (v: unknown, status = 200) => Response.json(v, { status }),
  withPlatformCors: (_: unknown, r: Response) => r,
  platformCorsPreflight: () => new Response(),
}));
vi.mock("@/lib/platform/platformV2Rollout", () => ({
  platformV2ActionsEnabled: () => true,
}));
const id = "00000000-0000-4000-8000-000000000001";
const body = {
  actionId: "exclude-pair",
  clientEventId: id,
  trainingSessionId: id,
  target: { kind: "exercise", targetId: id },
};
async function post(value: unknown) {
  const { POST } = await import(
    "@/app/api/platform/v2/training/exclusions/route"
  );
  return POST(
    new NextRequest("http://localhost/api/platform/v2/training/exclusions", {
      method: "POST",
      body: JSON.stringify(value),
    }),
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  auth.mockResolvedValue({
    principal: { userId: "server-user", authKind: "first_party" },
  });
  scope.mockReturnValue(null);
  rpc.mockResolvedValue({ data: { status: "accepted" }, error: null });
});
test("derives the principal server-side and passes the owned session to the atomic boundary", async () => {
  expect((await post(body)).status).toBe(200);
  expect(rpc).toHaveBeenCalledWith(
    "perform_training_pair_exclusion_as_principal_v1",
    expect.objectContaining({
      p_user_id: "server-user",
      p_session_id: id,
      p_exercise_target_id: id,
      p_entry_id: null,
    }),
  );
});
test.each([
  { ...body, userId: "attacker" },
  { ...body, trainingSessionId: null },
  { ...body, target: { ...body.target, entryId: id } },
  { ...body, actionId: "restore-pair", exclusionId: id },
])("rejects ambiguous or forged input before RPC", async (value) => {
  expect((await post(value)).status).toBe(400);
  expect(rpc).not.toHaveBeenCalled();
});
test("restore uses exact mark and has no training consumption", async () => {
  expect(
    (
      await post({
        actionId: "restore-pair",
        clientEventId: id,
        exclusionId: id,
        target: body.target,
      })
    ).status,
  ).toBe(200);
  expect(rpc).toHaveBeenCalledWith(
    expect.any(String),
    expect.objectContaining({ p_exclusion_id: id, p_session_id: null }),
  );
});
test("requires authentication and write scope", async () => {
  auth.mockResolvedValueOnce(new Response(null, { status: 401 }));
  expect((await post(body)).status).toBe(401);
  scope.mockReturnValueOnce(new Response(null, { status: 403 }));
  expect((await post(body)).status).toBe(403);
  expect(rpc).not.toHaveBeenCalled();
});
test("returns retry conflicts without exposing database details", async () => {
  rpc.mockResolvedValueOnce({
    error: { message: "exclusion_idempotency_conflict" },
    data: null,
  });
  const response = await post(body);
  expect(response.status).toBe(409);
  expect(await response.json()).toEqual({
    error: "exclusion_idempotency_conflict",
  });
  rpc.mockResolvedValueOnce({
    error: { message: "private diagnostic secret" },
    data: null,
  });
  expect(await (await post(body)).json()).toEqual({
    error: "training_exclusion_failed",
  });
});

test.each([["word-to-definition"], {toString:"word-to-definition"}])("rejects non-string card types without coercion",async cardTypeId=>{
  expect((await post({...body,target:{kind:"meaning",entryId:id,cardTypeId}})).status).toBe(400);
  expect(rpc).not.toHaveBeenCalled();
});
