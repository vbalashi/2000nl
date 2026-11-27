import { createHmac, timingSafeEqual } from "node:crypto";
import { readSandboxPrices, type SandboxCatalog } from "./sandboxCatalog";

type Fields = Record<string, unknown>;
type Prices = SandboxCatalog["prices"];

function object(value: unknown): Fields {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Fields : {};
}

function id(value: unknown, prefix: "evt" | "ntfsimevt" | "txn" | "sub" | "pri" | "adj") {
  return typeof value === "string" && value.startsWith(prefix + "_") &&
    /^[a-z0-9]{26}$/.test(value.slice(prefix.length + 1)) ? value : null;
}

function date(value: unknown) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?Z$/.test(value) &&
    Number.isFinite(Date.parse(value)) ? value : null;
}

function period(value: unknown) {
  const { starts_at, ends_at } = object(value);
  const validFrom = date(starts_at);
  const validUntil = date(ends_at);
  return validFrom && validUntil && Date.parse(validFrom) < Date.parse(validUntil) ? { validFrom, validUntil } : null;
}

function money(value: unknown, currency: unknown) {
  return typeof value === "string" && /^[1-9][0-9]{0,14}$/.test(value) &&
    typeof currency === "string" && /^[A-Z]{3}$/.test(currency)
    ? { amount: value, currency } : null;
}

function selectedPrice(data: Fields, prices: Prices) {
  const item = Array.isArray(data.items) && data.items.length === 1 ? object(data.items[0]) : {};
  const price = id(object(item.price).id, "pri");
  return item.quantity === 1 && price && (price === prices.month || price === prices.year) ? price : null;
}

export function sandboxFulfillmentEnabled(env: Readonly<Record<string, string | undefined>>) {
  return env.DEPLOYMENT_ENV === "staging" && env.PADDLE_SANDBOX_FULFILLMENT_ENABLED === "true";
}

export function readSandboxWebhookConfig(env: Readonly<Record<string, string | undefined>>) {
  if (!sandboxFulfillmentEnabled(env)) return null;
  const secret = env.PADDLE_SANDBOX_WEBHOOK_SECRET;
  const prices = readSandboxPrices(env);
  return secret && /^pdl_ntfset_[A-Za-z0-9_+=\/-]{20,200}$/.test(secret) && prices
    ? { secret, prices, allowSimulations: env.PADDLE_SANDBOX_SIMULATIONS_ENABLED === "true" }
    : null;
}

export function validPaddleSignature(secret: string, signature: string | null, raw: Uint8Array, now = Date.now()) {
  if (!signature || signature.length > 512) return false;
  const fields = signature.split(";");
  const timestamps = fields.filter(field => /^ts=\d{1,12}$/.test(field));
  const signatures = fields.filter(field => /^h1=[a-f0-9]{64}$/i.test(field));
  if (timestamps.length !== 1 || !signatures.length || timestamps.length + signatures.length !== fields.length) return false;
  const timestamp = timestamps[0].slice(3);
  if (Math.abs(now / 1000 - Number(timestamp)) > 30) return false;
  const expected = createHmac("sha256", secret).update(timestamp + ":").update(raw).digest();
  return signatures.some(field => timingSafeEqual(expected, Buffer.from(field.slice(3), "hex")));
}

export function normalizePaddleSandboxEvent(value: unknown, prices: Prices, allowSimulations = false) {
  const event = object(value);
  const eventId = id(event.event_id, "evt") ?? (allowSimulations ? id(event.event_id, "ntfsimevt") : null);
  const occurredAt = date(event.occurred_at);
  if (!eventId || !occurredAt) return null;
  const base = { eventId, occurredAt };
  const data = object(event.data);

  if (event.event_type === "transaction.completed") {
    const transactionId = id(data.id, "txn");
    const subscriptionId = id(data.subscription_id, "sub");
    const priceId = selectedPrice(data, prices);
    const dates = period(data.billing_period);
    const totals = object(object(data.details).totals);
    const paid = money(totals.grand_total, data.currency_code);
    if (!paid || !transactionId || !subscriptionId || !priceId || data.status !== "completed" ||
      data.collection_mode !== "automatic" || (data.billing_period != null && !dates)) return null;
    return { ...base, kind: "payment", transactionId, subscriptionId, priceId, ...dates, ...paid,
      renewal: data.origin === "subscription_recurring" };
  }

  if (event.event_type === "subscription.created") {
    const transactionId = id(data.transaction_id, "txn");
    const subscriptionId = id(data.id, "sub");
    const priceId = selectedPrice(data, prices);
    const dates = period(data.current_billing_period);
    if (!transactionId || !subscriptionId || !priceId || !dates || data.collection_mode !== "automatic") return null;
    return { ...base, kind: "created", transactionId, subscriptionId, priceId, ...dates };
  }

  if (event.event_type === "subscription.updated" || event.event_type === "subscription.canceled") {
    const subscriptionId = id(data.id, "sub");
    if (!subscriptionId) return null;
    const terminal = data.status === "canceled";
    if (event.event_type === "subscription.canceled" && !terminal) return null;
    const scheduled = object(data.scheduled_change);
    const cancelAt = terminal ? date(data.canceled_at) ?? occurredAt :
      scheduled.action === "cancel" ? date(scheduled.effective_at) : null;
    if (!terminal && scheduled.action === "cancel" && !cancelAt) return null;
    return { ...base, kind: "subscription", subscriptionId, terminal, cancelAt };
  }

  if (event.event_type === "adjustment.created" || event.event_type === "adjustment.updated") {
    const transactionId = id(data.transaction_id, "txn");
    const adjustmentId = id(data.id, "adj");
    const totals = object(data.totals);
    const refund = money(totals.total, totals.currency_code ?? data.currency_code);
    if (!transactionId || !adjustmentId || !refund || data.action !== "refund" || data.status !== "approved") return null;
    return { ...base, kind: "refund", transactionId, adjustmentId, ...refund };
  }

  return null;
}
