import { createHmac, timingSafeEqual } from "node:crypto";
import { readSandboxCatalog, type SandboxCatalog } from "./sandboxCatalog";

const transactionIdPattern = /^txn_[a-z0-9]{26}$/;
const receiptLifetimeSeconds = 3600;

export type SandboxPlan = keyof SandboxCatalog["prices"];
type ServerConfig = { apiKey: string; receiptKey: string; prices: SandboxCatalog["prices"] };
type Receipt = { transactionId: string; plan: SandboxPlan; expiresAt: number };

export function readSandboxTransactionConfig(env: Readonly<Record<string, string | undefined>>): ServerConfig | null {
  const catalog = readSandboxCatalog(env);
  const apiKey = env.PADDLE_SANDBOX_API_KEY;
  const receiptKey = env.PADDLE_SANDBOX_RECEIPT_KEY;
  if (!catalog || !apiKey || !/^pdl_sdbx_apikey_[a-zA-Z0-9_]+$/.test(apiKey) ||
    !receiptKey || !/^[a-f0-9]{64}$/.test(receiptKey)) return null;
  return { apiKey, receiptKey, prices: catalog.prices };
}

export function isSandboxPlan(value: unknown): value is SandboxPlan {
  return value === "month" || value === "year";
}

function receiptSignature(key: string, userId: string, payload: string) {
  return createHmac("sha256", Buffer.from(key, "hex"))
    .update(JSON.stringify(["paddle-sandbox-checkout-v1", userId, payload]))
    .digest();
}

function issueReceipt(key: string, userId: string, result: Receipt) {
  const payload = Buffer.from(JSON.stringify(result)).toString("base64url");
  return payload + "." + receiptSignature(key, userId, payload).toString("base64url");
}

function verifyReceipt(key: string, userId: string, receipt: string): Receipt | null {
  const match = /^([a-zA-Z0-9_-]{1,240})\.([a-zA-Z0-9_-]{43})$/.exec(receipt);
  if (!match) return null;
  const [, payload, signature] = match;
  const supplied = Buffer.from(signature, "base64url");
  if (supplied.length !== 32 || !timingSafeEqual(supplied, receiptSignature(key, userId, payload))) return null;
  try {
    const { transactionId, plan, expiresAt } = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (typeof transactionId !== "string" || !transactionIdPattern.test(transactionId) || !isSandboxPlan(plan) ||
      !Number.isSafeInteger(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000)) return null;
    return { transactionId, plan, expiresAt };
  } catch {
    return null;
  }
}

export async function paddleSandboxRequest(apiKey: string, path: string, body?: object) {
  const response = await fetch("https://sandbox-api.paddle.com" + path, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: "Bearer " + apiKey,
      "Paddle-Version": "1",
      Accept: "application/json",
      ...(body && { "Content-Type": "application/json" }),
    },
    body: body && JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
    cache: "no-store",
    redirect: "error",
  });
  if (!response.ok) throw new Error("sandbox_provider_request_failed");
  return (await response.json()).data;
}

export async function createSandboxTransaction(config: ServerConfig, userId: string, plan: SandboxPlan) {
  const result = await paddleSandboxRequest(config.apiKey, "/transactions", {
    items: [{ price_id: config.prices[plan], quantity: 1 }],
    collection_mode: "automatic",
  });
  if (typeof result?.id !== "string" || !transactionIdPattern.test(result.id) ||
    (result.status !== "draft" && result.status !== "ready")) {
    throw new Error("sandbox_transaction_unavailable");
  }
  return {
    transactionId: result.id as string,
    receipt: issueReceipt(config.receiptKey, userId, {
      transactionId: result.id,
      plan,
      expiresAt: Math.floor(Date.now() / 1000) + receiptLifetimeSeconds,
    }),
  };
}

export async function readSandboxTransaction(config: ServerConfig, userId: string, receipt: string) {
  const binding = verifyReceipt(config.receiptKey, userId, receipt);
  if (!binding) return null;
  const result = await paddleSandboxRequest(config.apiKey, "/transactions/" + binding.transactionId);
  if (result?.id !== binding.transactionId || result.collection_mode !== "automatic" ||
    !Array.isArray(result.items) || result.items.length !== 1 ||
    result.items[0]?.price?.id !== config.prices[binding.plan] || result.items[0]?.quantity !== 1) {
    throw new Error("sandbox_transaction_mismatch");
  }
  return { status: result.status === "completed" ? "completed" : result.status === "canceled" ? "canceled" : "pending" };
}
