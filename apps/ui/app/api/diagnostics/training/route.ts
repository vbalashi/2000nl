import { ingestTrainingDiagnostics } from "@/lib/diagnostics/ingestion";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const POST = ingestTrainingDiagnostics;

import { getAuthenticatedSupabase, jsonNoStore } from "@/lib/platform/serverSupabase";
import { diagnosticPolicyFor } from "@/lib/diagnostics/serverPolicy";
export async function GET(request: Request) {
  const auth=await getAuthenticatedSupabase(request);
  if(auth instanceof Response)return auth;
  if(auth.principal.authKind!=="first_party")return jsonNoStore({error:"first_party_required"},403);
  return jsonNoStore(diagnosticPolicyFor(auth.user.id));
}
