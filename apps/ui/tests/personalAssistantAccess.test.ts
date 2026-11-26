import { NextRequest } from "next/server";
import { beforeEach, expect, it, vi } from "vitest";
import { GET, POST as ask } from "../app/api/library/card-assistant/route";
import { POST as dictate } from "../app/api/audio/dictation/route";

const { authenticate, rpc } = vi.hoisted(() => ({ authenticate: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/platform/serverSupabase", () => ({
  getAuthenticatedSupabase: authenticate,
  getPlatformServiceSupabase: vi.fn(),
  jsonNoStore: (body: unknown, status = 200) => Response.json(body, { status }),
}));
const request = (method = "POST") => new NextRequest("http://localhost/api", { method });
const user = { id: "learner", user_metadata: { subscription_tier: "premium" } };
const identity = (authKind: string) => ({ principal: { authKind }, user, supabase: { rpc } });

beforeEach(() => {
  vi.resetAllMocks();
  authenticate.mockResolvedValue(identity("first_party"));
  rpc.mockResolvedValue({ data: "free", error: null });
});

it("uses the authenticated account's server-owned tier for UI discovery", async () => {
  expect(await (await GET(request("GET"))).json()).toEqual({ allowed: false, userId: user.id });
  rpc.mockResolvedValue({ data: "premium", error: null });
  expect(await (await GET(request("GET"))).json()).toEqual({ allowed: true, userId: user.id });
  expect(rpc).toHaveBeenCalledWith("get_user_tier", { p_user_id: user.id });
});

it.each([ask, dictate])("denies protected work before processing the body for a free, revoked, or disconnected account", async route => {
  expect((await route(request())).status).toBe(403);
  rpc.mockResolvedValue({ data: "premium", error: null });
  expect((await GET(request("GET"))).status).toBe(200);
  rpc.mockResolvedValue({ data: "free", error: null });
  expect((await route(request())).status).toBe(403);
  rpc.mockResolvedValue({ data: null, error: { message: "offline" } });
  expect((await route(request())).status).toBe(503);
  authenticate.mockResolvedValue(identity("connected_client"));
  expect((await route(request())).status).toBe(403);
  authenticate.mockResolvedValue(new Response(null, { status: 401 }));
  expect((await route(request())).status).toBe(401);
});
