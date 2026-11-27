import { randomUUID } from "node:crypto";
import { getAuthenticatedSupabase, getPlatformServiceSupabase, jsonNoStore } from "./serverSupabase";
import { sandboxFulfillmentEnabled } from "@/lib/billing/paddleSandboxWebhook";
import { consumeAudioRateLimit } from "../audio/audioRateLimit";
import {
  allowanceOperationHeader,
  readAssistantAllowances,
  type AssistantAllowanceKind,
} from "./assistantAllowanceContract";

async function authenticateAssistant(request: Request) {
  const auth = await getAuthenticatedSupabase(request);
  if (auth instanceof Response) return auth;
  if (auth.principal.authKind !== "first_party") return jsonNoStore({ error: "first_party_required" }, 403);
  const service = getPlatformServiceSupabase();
  if (service instanceof Response) return service;
  return {
    auth,
    service: service.supabase,
    account: { p_user: auth.user.id, p_allow_sandbox: sandboxFulfillmentEnabled(process.env) },
  };
}

function accessUnavailable() {
  return jsonNoStore({ error: "assistant_access_unavailable" }, 503);
}

export async function readAssistantAccess(request: Request) {
  const caller = await authenticateAssistant(request);
  if (caller instanceof Response) return caller;
  const { data, error } = await caller.service.rpc("read_assistant_allowances_v1", caller.account);
  const allowances = error ? null : readAssistantAllowances(data);
  return allowances ? { auth: caller.auth, allowances } : accessUnavailable();
}

const operationIdPattern = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;

export async function withAssistantAllowance(
  request: Request,
  kind: AssistantAllowanceKind,
  work: (auth: Exclude<Awaited<ReturnType<typeof getAuthenticatedSupabase>>, Response>) => Promise<Response>,
) {
  const caller = await authenticateAssistant(request);
  if (caller instanceof Response) return caller;
  const operationId = request.headers.get(allowanceOperationHeader) ?? randomUUID();
  if (!operationIdPattern.test(operationId)) return jsonNoStore({ error: "invalid_operation_id" }, 400);

  const rate = consumeAudioRateLimit("personal-assistant:" + caller.auth.user.id);
  if (!rate.allowed) return jsonNoStore({ error: "rate_limited", retryAfterMs: rate.retryAfterMs }, 429);

  const operation = { p_user: caller.auth.user.id, p_feature: kind, p_operation: operationId };
  const { data, error } = await caller.service.rpc("reserve_assistant_allowance_v1", {
    ...operation, p_allow_sandbox: caller.account.p_allow_sandbox,
  });
  if (error) return accessUnavailable();
  if (data?.decision === "duplicate") return jsonNoStore({ error: "assistant_operation_already_used" }, 409);
  const allowances = readAssistantAllowances(data);
  if (!allowances) return accessUnavailable();
  if (data.decision === "exhausted") return jsonNoStore({ error: "assistant_allowance_exhausted", allowances }, 403);
  if (data.decision !== "reserved") return accessUnavailable();

  let response: Response | undefined;
  let success = false;
  try {
    if (!request.signal.aborted) response = await work(caller.auth);
    success = Boolean(response?.ok && !request.signal.aborted);
    if (success && response && kind === "ai_reply") {
      const reply = await response.clone().json().catch(() => null);
      success = typeof reply?.message === "string" && Boolean(reply.message.trim())
        && reply.outOfScope !== true && !request.signal.aborted;
    }
  } finally {
    const confirmed = await Promise.resolve(caller.service.rpc("settle_assistant_allowance_v1", {
      ...operation, p_success: success,
    })).then(result => !result.error && result.data === true, () => false);
    if (success && !confirmed) {
      response = jsonNoStore({ error: "assistant_operation_unconfirmed" }, 503);
    }
  }
  return response ?? jsonNoStore({ error: "assistant_operation_cancelled" }, 499);
}
