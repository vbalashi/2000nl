import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { rpc, authenticate } = vi.hoisted(() => ({ rpc: vi.fn(), authenticate: vi.fn() }));
vi.mock("@/lib/platform/serverSupabase", () => ({
  getAuthenticatedUserSupabase: authenticate,
  jsonNoStore: (payload: unknown, status = 200) => Response.json(payload, {
    status, headers: { "Cache-Control": "private, no-store" },
  }),
}));

import { POST } from "@/app/api/billing/sandbox/portal/route";
import { GET } from "@/app/api/billing/sandbox/access/route";

const sub = "sub_" + "a".repeat(26);
const foreign = "sub_" + "b".repeat(26);
const customer = "ctm_" + "c".repeat(26);
const portal = "https://sandbox-customer-portal.paddle.com/cpl_" + "d".repeat(26);
const provider = vi.fn();
const date = "2027-11-27T12:00:00Z";

function request(action: string) {
  return new Request("https://example.test/api/billing/sandbox/portal", {
    method: "POST", body: JSON.stringify({ action, subscriptionId: foreign, customerId: "untrusted" }),
  });
}

function subscription(overrides: Record<string, unknown> = {}) {
  return Response.json({ data: { id: sub, customer_id: customer, status: "active", next_billed_at: date, ...overrides } });
}

beforeEach(() => {
  vi.stubEnv("DEPLOYMENT_ENV", "staging");
  vi.stubEnv("PADDLE_SANDBOX_FULFILLMENT_ENABLED", "true");
  vi.stubEnv("PADDLE_SANDBOX_PORTAL_API_KEY", "pdl_sdbx_apikey_synthetic");
  vi.stubGlobal("fetch", provider);
  provider.mockReset();
  authenticate.mockReset().mockResolvedValue({ supabase: { rpc } });
  rpc.mockReset().mockResolvedValue({ data: { active: true, plan: "year", validUntil: date, endsAfterCancel: false, subscriptionId: sub } });
});

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("Paddle Sandbox customer portal", () => {
  it.each([
    ["details", "view_subscription"], ["payment", "update_subscription_payment_method"], ["cancel", "cancel_subscription"],
  ])("issues a fresh %s link for the signed-in account's subscription only", async (action, field) => {
    const url = portal + "?action=" + field + "&token=one-time";
    provider.mockResolvedValueOnce(subscription()).mockResolvedValueOnce(Response.json({ data: {
      customer_id: customer, urls: { subscriptions: [{ id: foreign, [field]: "foreign" }, { id: sub, [field]: url }] },
    } }));
    const response = await POST(request(action));
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(await response.json()).toEqual({ url });
    expect(provider).toHaveBeenNthCalledWith(1, "https://sandbox-api.paddle.com/subscriptions/" + sub, expect.anything());
    expect(provider).toHaveBeenNthCalledWith(2, "https://sandbox-api.paddle.com/customers/" + customer + "/portal-sessions",
      expect.objectContaining({ body: JSON.stringify({ subscription_ids: [sub] }) }));
  });

  it("never calls the provider for visitors, free accounts without purchases, or production", async () => {
    authenticate.mockResolvedValueOnce(new Response(null, { status: 401 }));
    expect((await POST(request("details"))).status).toBe(401);
    rpc.mockResolvedValueOnce({ data: { active: false } });
    expect((await POST(request("details"))).status).toBe(404);
    vi.stubEnv("DEPLOYMENT_ENV", "production");
    expect((await POST(request("details"))).status).toBe(404);
    expect(provider).not.toHaveBeenCalled();
  });

  it("suppresses the next charge and cancellation action when cancel is scheduled", async () => {
    const data = { scheduled_change: { action: "cancel", effective_at: date } };
    provider.mockResolvedValueOnce(subscription(data)).mockResolvedValueOnce(subscription(data));
    const response = await GET(new Request("https://example.test/api/billing/sandbox/access"));
    expect(await response.json()).toMatchObject({
      access: { active: true }, cancelAt: date, nextPaymentAt: null,
      actions: { details: true, payment: true, cancel: false },
    });
    expect((await POST(request("cancel"))).status).toBe(409);
    expect(provider).toHaveBeenCalledTimes(2);
  });

  it("rejects off-provider links", async () => {
    provider.mockResolvedValueOnce(subscription()).mockResolvedValueOnce(Response.json({ data: {
      customer_id: customer, urls: { general: { overview: "https://example.test/?token=one-time" } },
    } }));
    expect((await POST(request("details"))).status).toBe(503);
  });
});
