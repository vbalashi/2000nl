import { authenticatedJsonHeaders } from "@/lib/platform/platformV2Http";

type Plan = "month" | "year";

async function requestTransaction(body: { plan: Plan } | { receipt: string }) {
  const headers = await authenticatedJsonHeaders();
  const response = await fetch("/api/billing/sandbox/transaction", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new Error("sandbox_transaction_unavailable");
  return response.json();
}

export async function startSandboxCheckout(plan: Plan): Promise<{ transactionId: string; receipt: string }> {
  const response = await requestTransaction({ plan });
  if (typeof response.transactionId !== "string" || typeof response.receipt !== "string") {
    throw new Error("sandbox_transaction_unavailable");
  }
  return response;
}

export async function getSandboxCheckoutStatus(receipt: string): Promise<"completed" | "canceled" | "pending"> {
  const response = await requestTransaction({ receipt });
  if (response.status !== "completed" && response.status !== "canceled" && response.status !== "pending") {
    throw new Error("sandbox_transaction_unavailable");
  }
  return response.status;
}
