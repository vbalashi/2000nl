import { diagnosticPolicyFor } from "./serverPolicy";
import { acceptsDiagnostic } from "./policy";
import { readBoundedJson } from "../http/readBoundedJson";
import {
  getAuthenticatedSupabase,
  jsonNoStore,
} from "../platform/serverSupabase";
import { parseTrainingDiagnostics } from "./contract";
import { diagnosticActor, writeDiagnostic } from "./server";

const buckets = new Map<string, { at: number; count: number }>();
export async function ingestTrainingDiagnostics(request: Request) {
  // Only the first-party same-origin browser is allowed to submit observations.
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return jsonNoStore({ error: "origin_denied" }, 403);
  const body = await readBoundedJson(request, 12_000);
  if ("error" in body)
    return jsonNoStore(
      { error: "invalid_diagnostics" },
      body.error === "too_large" ? 413 : 400,
    );
  const events = parseTrainingDiagnostics(body.body);
  if (!events) return jsonNoStore({ error: "invalid_diagnostics" }, 400);
  const auth = await getAuthenticatedSupabase(request);
  if (auth instanceof Response) return auth;
  if (auth.principal.authKind !== "first_party")
    return jsonNoStore({ error: "first_party_required" }, 403);
  const policy = diagnosticPolicyFor(auth.user.id);
  if (!policy.enabled) return jsonNoStore({accepted:0},202);
  const actor = diagnosticActor(auth.user.id);
  const now = Date.now();
  for (const [key, bucket] of buckets)
    if (now - bucket.at >= 60_000) buckets.delete(key);
  const bucket = buckets.get(actor) ?? { at: now, count: 0 };
  // Bounded per-process/per-account budget, shared by tabs. No database writes.
  if (
    bucket.count + events.length > 240 ||
    (!buckets.has(actor) && buckets.size >= 2048)
  )
    return jsonNoStore({ error: "rate_limited" }, 429);
  bucket.count += events.length;
  buckets.set(actor, bucket);
  for (const event of events.filter(event => acceptsDiagnostic(policy,event)))
    writeDiagnostic({
      ...event,
      kind: "client_event",
      event: event.kind,
      actor,
    }, auth.user.id);
  return jsonNoStore({ accepted: events.length }, 202);
}
