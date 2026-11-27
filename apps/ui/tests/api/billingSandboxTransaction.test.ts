import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => vi.fn());
vi.mock("@/lib/platform/serverSupabase", () => ({
  getAuthenticatedUserSupabase: auth,
  jsonNoStore: (payload: unknown, status = 200) => Response.json(payload, { status }),
}));

import { POST } from "@/app/api/billing/sandbox/transaction/route";

const month = "pri_" + "a".repeat(26);
const year = "pri_" + "b".repeat(26);
const txn = "txn_" + "t".repeat(26);
const api = vi.fn();

function request(payload: object) {
  return new Request("http://localhost/api/billing/sandbox/transaction", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

function providerTransaction(status: string, price = month) {
  return Response.json({ data: {
    id: txn, status, collection_mode: "automatic", items: [{ price: { id: price }, quantity: 1 }],
  } });
}

beforeEach(() => {
  auth.mockReset().mockResolvedValue({ user: { id: "learner" } });
  api.mockReset();
  vi.stubGlobal("fetch", api);
  vi.stubEnv("PADDLE_SANDBOX_CHECKOUT_ENABLED", "true");
  vi.stubEnv("PADDLE_SANDBOX_CLIENT_TOKEN", "test_catalog");
  vi.stubEnv("PADDLE_SANDBOX_MONTHLY_PRICE_ID", month);
  vi.stubEnv("PADDLE_SANDBOX_YEARLY_PRICE_ID", year);
  vi.stubEnv("PADDLE_SANDBOX_API_KEY", "pdl_sdbx_apikey_fixture");
  vi.stubEnv("PADDLE_SANDBOX_RECEIPT_KEY", "ab".repeat(32));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("server-owned sandbox checkout", () => {
  it("cannot create a transaction without a first-party session or select an arbitrary price", async () => {
    auth.mockResolvedValueOnce(new Response(null, { status: 401 }));
    expect((await POST(request({ plan: "month" }))).status).toBe(401);
    expect((await POST(request({ plan: "month", priceId: "forged" }))).status).toBe(400);
    expect(api).not.toHaveBeenCalled();
  });

  it("opens the configured monthly transaction and confirms payment only from Paddle for its owner", async () => {
    api.mockResolvedValueOnce(providerTransaction("draft"));
    const created = await POST(request({ plan: "month" }));
    expect(created.status).toBe(201);
    const { transactionId, receipt } = await created.json();
    expect(transactionId).toBe(txn);
    const [url, init] = api.mock.calls[0];
    expect(url).toBe("https://sandbox-api.paddle.com/transactions");
    expect(JSON.parse(init.body)).toEqual({
      items: [{ price_id: month, quantity: 1 }], collection_mode: "automatic",
    });

    auth.mockResolvedValueOnce({ user: { id: "other-learner" } });
    expect((await POST(request({ receipt }))).status).toBe(400);
    const tampered = (receipt[0] === "a" ? "b" : "a") + receipt.slice(1);
    expect((await POST(request({ receipt: tampered }))).status).toBe(400);
    expect(api).toHaveBeenCalledTimes(1);

    api.mockResolvedValueOnce(providerTransaction("paid"));
    expect(await (await POST(request({ receipt }))).json()).toEqual({ status: "pending" });
    api.mockResolvedValueOnce(providerTransaction("completed", year));
    expect((await POST(request({ receipt }))).status).toBe(502);
    api.mockResolvedValueOnce(providerTransaction("completed"));
    expect(await (await POST(request({ receipt }))).json()).toEqual({ status: "completed" });
    expect(api.mock.calls[3][0]).toBe("https://sandbox-api.paddle.com/transactions/" + txn);
  });

  it("does not accept a live key or echo provider error data", async () => {
    vi.stubEnv("PADDLE_SANDBOX_API_KEY", "pdl_live_apikey_fixture");
    expect((await POST(request({ plan: "year" }))).status).toBe(404);
    expect(api).not.toHaveBeenCalled();
    vi.stubEnv("PADDLE_SANDBOX_API_KEY", "pdl_sdbx_apikey_fixture");
    auth.mockResolvedValueOnce({ user: { id: "another-learner" } });
    api.mockResolvedValueOnce(Response.json({ providerDetail: "upstream-private" }, { status: 400 }));
    const failed = await POST(request({ plan: "year" }));
    expect(failed.status).toBe(502);
    expect(await failed.json()).toEqual({ error: "sandbox_provider_unavailable" });
  });
});
