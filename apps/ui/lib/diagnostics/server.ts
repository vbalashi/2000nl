import { diagnosticPolicyFor } from "./serverPolicy";
import { sampleDiagnostic } from "./policy";
import { AsyncLocalStorage } from "node:async_hooks";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { diagnosticId } from "./contract";

type Context = {
  requestId: string;
  transitionId?: string;
  displayId?: string;
  actor?: string;
  userId?: string;
  route: string;
  rpcCount: number;
};
const contexts = new AsyncLocalStorage<Context>();
const fallbackKey = randomBytes(32).toString("hex");
export function diagnosticActor(userId: string) {
  const key =
    process.env.DIAGNOSTICS_HMAC_KEY ??
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SECRET_KEY ??
    process.env.SUPABASE_SERVICE_KEY ??
    fallbackKey;
  return createHmac("sha256", key)
    .update(`training-diagnostics:v1:${userId}`)
    .digest("hex")
    .slice(0, 24);
}
export function identifyDiagnosticActor(userId: string) {
  const ctx = contexts.getStore();
  if (ctx) { ctx.actor = diagnosticActor(userId); ctx.userId = userId; }
}
export function currentDiagnosticRequestId() {
  return contexts.getStore()?.requestId;
}
export function writeDiagnostic(event: Record<string, unknown>, userId?: string) {
  const policy=diagnosticPolicyFor(userId ?? contexts.getStore()?.userId);
  if(!policy.enabled)return;
  if(event.kind!=="client_event"&&!policy.detailed&&!(typeof event.status==="number"&&(event.status>=500||event.status===0))&&!sampleDiagnostic(String(event.displayId??event.transitionId??event.requestId??""),policy.successSampleRate))return;
  // Callers supply only constructed allowlisted fields; never serialize request/error objects.
  try {
    console.info(
      JSON.stringify({
        channel: "training_diagnostics",
        schema: 1,
        receivedAt: new Date().toISOString(),
        version: process.env.NEXT_PUBLIC_APP_COMMIT ?? "unknown",
        ...event,
      }),
    );
  } catch {
    /* Monitoring must never break training. */
  }
}
export function withTrainingDiagnostics<T extends Request>(
  route: string,
  handler: (request: T) => Promise<Response>,
) {
  return async (request: T): Promise<Response> => {
    const incoming = request.headers.get("x-request-id");
    const transition = request.headers.get("x-training-transition-id");
    const display = request.headers.get("x-training-display-id");
    const ctx: Context = {
      requestId: diagnosticId(incoming) ? incoming : randomUUID(),
      ...(diagnosticId(transition) ? { transitionId: transition } : {}),
      ...(diagnosticId(display) ? { displayId: display } : {}),
      route,
      rpcCount: 0,
    };
    return contexts.run(ctx, async () => {
      const started = performance.now();
      writeDiagnostic({
        kind: "server_request_started",
        route,
        requestId: ctx.requestId,
        transitionId: ctx.transitionId,
        displayId: ctx.displayId,
        durationMs: 0,
      });
      let status = 500;
      try {
        const response = await handler(request);
        status = response.status;
        response.headers.set("X-Request-Id", ctx.requestId);
        return response;
      } finally {
        writeDiagnostic({
          kind: "server_request",
          route,
          requestId: ctx.requestId,
          transitionId: ctx.transitionId,
          displayId: ctx.displayId,
          actor: ctx.actor,
          status,
          durationMs: Math.round(performance.now() - started),
          aborted: request.signal.aborted,
        });
      }
    });
  };
}
/** Measures the HTTP RPC boundary, not PostgreSQL execution time. */
export const diagnosticSupabaseFetch: typeof fetch = async (input, init) => {
  const ctx = contexts.getStore();
  if (!ctx || ctx.rpcCount >= 32) return fetch(input, init);
  const url = new URL(
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url,
  );
  const rpc = url.pathname.match(
    /^\/rest\/v1\/rpc\/([a-z][a-z0-9_]{0,95})$/,
  )?.[1];
  if (!rpc) return fetch(input, init);
  ctx.rpcCount += 1;
  const started = performance.now();
  let status = 0;
  try {
    const response = await fetch(input, init);
    status = response.status;
    return response;
  } finally {
    writeDiagnostic({
      kind: "server_rpc",
      route: ctx.route,
      rpc,
      requestId: ctx.requestId,
      transitionId: ctx.transitionId,
      displayId: ctx.displayId,
      actor: ctx.actor,
      status,
      durationMs: Math.round(performance.now() - started),
    });
  }
};
