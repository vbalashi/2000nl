import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/lib/platform/serverSupabase", () => ({
  getPlatformServiceSupabase: () => ({ supabase: { rpc } }),
  jsonNoStore: (payload: unknown, status: number) => Response.json(payload, { status }),
}));
import { POST } from "@/app/api/billing/sandbox/webhook/route";

const secret = "pdl_ntfset_" + "s".repeat(30) + "/a+1=";
const month = "pri_" + "m".repeat(26);
const year = "pri_" + "y".repeat(26);
const eventId = "evt_" + "a".repeat(26);
const txn = "txn_" + "b".repeat(26);
const sub = "sub_" + "c".repeat(26);
const occurredAt = "2026-11-27T10:00:00.123456Z";

function request(body: unknown, { tamper = false, age = 0 } = {}) {
  const raw = JSON.stringify(body);
  const ts = Math.floor(Date.now() / 1000) - age;
  const mac = createHmac("sha256", secret).update(ts + ":" + raw).digest("hex");
  return new Request("http://localhost/api/billing/sandbox/webhook", {
    method: "POST", body: raw + (tamper ? " " : ""), headers: { "Paddle-Signature": `ts=${ts};h1=${mac}` },
  });
}

function event(event_type: string, data: object) {
  return { event_id: eventId, event_type, occurred_at: occurredAt, data };
}

const paid = event("transaction.completed", {
  id: txn, subscription_id: sub, status: "completed", collection_mode: "automatic",
  origin: "web", currency_code: "EUR", details: { totals: { grand_total: "600" } }, items: [{ price: { id: month }, quantity: 1 }],
});

beforeEach(() => {
  rpc.mockReset().mockResolvedValue({ error: null });
  vi.stubEnv("DEPLOYMENT_ENV", "staging");
  vi.stubEnv("PADDLE_SANDBOX_CHECKOUT_ENABLED", "true");
  vi.stubEnv("PADDLE_SANDBOX_FULFILLMENT_ENABLED", "true");
  vi.stubEnv("PADDLE_SANDBOX_WEBHOOK_SECRET", secret);
  vi.stubEnv("PADDLE_SANDBOX_CLIENT_TOKEN", "test_fixture");
  vi.stubEnv("PADDLE_SANDBOX_MONTHLY_PRICE_ID", month);
  vi.stubEnv("PADDLE_SANDBOX_YEARLY_PRICE_ID", year);
});
afterEach(() => { vi.unstubAllEnvs(); });

describe("Paddle Sandbox webhook", () => {
  it("rejects tampering and expired signatures before calling the inbox", async () => {
    expect((await POST(request(paid, { tamper: true }))).status).toBe(401);
    expect((await POST(request(paid, { age: 60 }))).status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("stays disabled in production even with valid signed Sandbox data", async () => {
    vi.stubEnv("DEPLOYMENT_ENV", "production");
    expect((await POST(request(paid))).status).toBe(404);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("continues accepting signed notifications when new checkout is disabled", async () => {
    vi.stubEnv("PADDLE_SANDBOX_CHECKOUT_ENABLED", "false");
    vi.stubEnv("PADDLE_SANDBOX_CLIENT_TOKEN", "");
    expect((await POST(request(paid))).status).toBe(204);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("records only billing facts and requests delivery retry if the inbox is unavailable", async () => {
    rpc.mockResolvedValueOnce({ error: { detail: "private provider failure" } });
    expect((await POST(request(paid))).status).toBe(503);
    expect((await POST(request(paid))).status).toBe(204);
    expect(rpc).toHaveBeenLastCalledWith("record_paddle_sandbox_event", { p_event: {
      eventId, occurredAt, kind: "payment", transactionId: txn, subscriptionId: sub, priceId: month, amount: "600", currency: "EUR", renewal: false,
    } });
  });

  it("keeps official simulator events out of the normal intake unless explicitly enabled", async () => {
    const fixture = { ...paid, event_id: "ntfsimevt_" + "z".repeat(26) };
    expect((await POST(request(fixture))).status).toBe(204);
    expect(rpc).not.toHaveBeenCalled();
    vi.stubEnv("PADDLE_SANDBOX_SIMULATIONS_ENABLED", "true");
    expect((await POST(request(fixture))).status).toBe(204);
    expect(rpc.mock.calls[0][1].p_event.eventId).toBe(fixture.event_id);
  });

  it("ignores unpaid and pending items and records approved refunds even when Paddle labels them partial", async () => {
    for (const ignored of [
      event("transaction.paid", { id: txn }),
      event("adjustment.created", { transaction_id: txn, action: "refund", type: "full", status: "pending_approval" }),
    ]) expect((await POST(request(ignored))).status).toBe(204);
    expect(rpc).not.toHaveBeenCalled();
    expect((await POST(request(event("adjustment.updated", {
      id: "adj_" + "a".repeat(26), transaction_id: txn, action: "refund", type: "partial", status: "approved",
      totals: { total: "600", currency_code: "EUR" },
    })))).status).toBe(204);
    expect(rpc).toHaveBeenCalledWith("record_paddle_sandbox_event", { p_event: {
      eventId, occurredAt, kind: "refund", transactionId: txn, adjustmentId: "adj_" + "a".repeat(26), amount: "600", currency: "EUR",
    } });
  });
});
