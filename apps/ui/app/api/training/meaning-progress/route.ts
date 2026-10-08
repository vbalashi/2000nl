import { NextRequest } from "next/server";
import {
  getAuthenticatedSupabase,
  getPlatformServiceSupabase,
  jsonNoStore,
} from "@/lib/platform/serverSupabase";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
const uuid = (v: unknown): v is string =>
  typeof v === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedSupabase(request);
  if (auth instanceof Response) return auth;
  if (auth.principal.authKind !== "first_party")
    return jsonNoStore({ error: "first_party_required" }, 403);
  const entryId = request.nextUrl.searchParams.get("entryId");
  if (
    !uuid(entryId) ||
    [...request.nextUrl.searchParams.keys()].some((k) => k !== "entryId")
  )
    return jsonNoStore({ error: "invalid_meaning_progress" }, 400);
  const { data, error } = await auth.supabase.rpc(
    "get_meaning_learning_progress_v1",
    { p_entry_id: entryId },
  );
  return error
    ? jsonNoStore({ error: "meaning_progress_unavailable" }, 503)
    : jsonNoStore(data);
}
export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedSupabase(request);
  if (auth instanceof Response) return auth;
  if (auth.principal.authKind !== "first_party")
    return jsonNoStore({ error: "first_party_required" }, 403);
  const body = await request.json().catch(() => null);
  if (
    !body ||
    !uuid(body.entryId) ||
    !uuid(body.clientEventId) ||
    typeof body.revision !== "string" ||
    !/^[a-f0-9]{64}$/.test(body.revision) ||
    Object.keys(body).some(
      (k) => !["entryId", "clientEventId", "revision"].includes(k),
    )
  )
    return jsonNoStore({ error: "invalid_meaning_resume" }, 400);
  const service = getPlatformServiceSupabase();
  if (service instanceof Response) return service;
  const { data, error } = await service.supabase.rpc(
    "resume_meaning_learning_as_principal_v1",
    {
      p_user_id: auth.principal.userId,
      p_entry_id: body.entryId,
      p_expected_revision: body.revision,
      p_client_event_id: body.clientEventId,
    },
  );
  return error
    ? jsonNoStore(
        {
          error: error.message.includes("meaning_progress_conflict")
            ? "meaning_progress_conflict"
            : "meaning_resume_failed",
        },
        error.message.includes("meaning_progress_conflict") ? 409 : 503,
      )
    : jsonNoStore(data);
}
