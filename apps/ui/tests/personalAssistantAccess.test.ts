import { NextRequest } from "next/server";
import { beforeEach, expect, it, vi } from "vitest";
import { GET, POST as ask } from "../app/api/library/card-assistant/route";
import { POST as dictate } from "../app/api/audio/dictation/route";
import { withAssistantAllowance } from "@/lib/platform/assistantAccess";

const { authenticate, rpc } = vi.hoisted(() => ({ authenticate: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/platform/serverSupabase", () => ({
  getAuthenticatedSupabase: authenticate,
  getPlatformServiceSupabase: () => ({ supabase: { rpc } }),
  jsonNoStore: (body: unknown, status = 200) => Response.json(body, { status }),
}));
const operationId = "106e44a5-c2c0-49bd-99d4-60c39d92910e";
const request = (method = "POST") => new NextRequest("http://localhost/api", { method, headers: { "X-Dilum-Operation-Id": operationId } });
const user = { id: "fd040de6-d97a-4b4c-ab20-600534e00072", user_metadata: { subscription_tier: "premium" } };
const identity = (authKind: string) => ({ principal: { authKind }, user, supabase: { rpc } });
const allowances = { premium: false, manualUntil: null, aiRepliesRemaining: 2, dictationsRemaining: 10, personalMeaningsRemaining: 100 };

beforeEach(() => {
  vi.resetAllMocks();
  authenticate.mockResolvedValue(identity("first_party"));
  rpc.mockImplementation(async (name: string) => ({
    data: name === "settle_assistant_allowance_v1" ? true : { ...allowances, decision: "reserved" },
    error: null,
  }));
});

it("reads server-owned plan and all three balances for the authenticated account", async () => {
  expect(await (await GET(request("GET"))).json()).toEqual({ allowed: true, userId: user.id, allowances });
  expect(rpc).toHaveBeenCalledWith("read_assistant_allowances_v1", expect.objectContaining({ p_user: user.id }));
});

it.each([[ask, "ai_reply"], [dictate, "dictation"]] as const)("denies exhausted or disconnected work before reading the body", async (route, feature) => {
  rpc.mockResolvedValue({ data: { ...allowances, decision: "exhausted" }, error: null });
  expect((await route(request())).status).toBe(403);
  expect(rpc).toHaveBeenCalledWith("reserve_assistant_allowance_v1",
    expect.objectContaining({ p_user: user.id, p_feature: feature, p_operation: operationId }));
  expect(rpc).not.toHaveBeenCalledWith("settle_assistant_allowance_v1", expect.anything());
  authenticate.mockResolvedValue(identity("connected_client"));
  expect((await route(request())).status).toBe(403);
  authenticate.mockResolvedValue(new Response(null, { status: 401 }));
  expect((await route(request())).status).toBe(401);
});

it("does not re-run work for a duplicate operation", async () => {
  rpc.mockResolvedValue({ data: { decision: "duplicate" }, error: null });
  const work = vi.fn();
  expect((await withAssistantAllowance(request(), "ai_reply", work)).status).toBe(409);
  expect(work).not.toHaveBeenCalled();
});

it.each([
  { response: Response.json({ message: "Een woord." }), success: true },
  { response: Response.json({ message: "Try another topic", outOfScope: true }), success: false },
  { response: Response.json({ error: "provider_failed" }, { status: 502 }), success: false },
])("settles an AI reply according to usability, once", async ({ response, success }) => {
  const work = vi.fn().mockResolvedValue(response);
  await withAssistantAllowance(request(), "ai_reply", work);
  expect(work).toHaveBeenCalledTimes(1);
  expect(rpc).toHaveBeenCalledWith("settle_assistant_allowance_v1", {
    p_user: user.id, p_feature: "ai_reply", p_operation: operationId, p_success: success,
  });
});

it("marks a delivered provider result as uncertain if its settlement is unavailable", async () => {
  rpc.mockResolvedValueOnce({ data: { ...allowances, decision: "reserved" }, error: null })
    .mockResolvedValueOnce({ data: null, error: { message: "database transport unavailable" } });
  const response = await withAssistantAllowance(request(), "ai_reply", async () => Response.json({ message: "Een woord." }));
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ error: "assistant_operation_unconfirmed" });
});
