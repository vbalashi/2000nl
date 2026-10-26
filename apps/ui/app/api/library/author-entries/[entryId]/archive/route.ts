import { NextRequest } from "next/server";
import {
  getAuthenticatedSupabase,
  jsonNoStore,
  requirePlatformScope,
} from "@/lib/platform/serverSupabase";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ entryId: string }> },
) {
  const auth = await getAuthenticatedSupabase(request);
  if (auth instanceof Response) return auth;
  if (auth.principal.authKind !== "first_party")
    return jsonNoStore({ error: "first_party_required" }, 403);
  const denied = requirePlatformScope(auth, "platform:read");
  if (denied) return denied;
  if (process.env.NEXT_PUBLIC_AUTHOR_ENTRY_ARCHIVE_ENABLED !== "true")
    return jsonNoStore({ error: "author_archive_not_enabled" }, 503);
  const { entryId } = await params;
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      entryId,
    )
  )
    return jsonNoStore({ error: "invalid_entry_id" }, 400);
  const { data, error } = await auth.supabase.rpc(
    "read_author_entry_archive_status_v1",
    { p_user_id: auth.user.id, p_entry_id: entryId },
  );
  if (error)
    return jsonNoStore(
      {
        error:
          error.code === "42501" || error.code === "P0002"
            ? "author_entry_not_available"
            : "author_archive_status_failed",
      },
      error.code === "42501" || error.code === "P0002" ? 404 : 500,
    );
  if (
    data?.entryId !== entryId ||
    typeof data?.archived !== "boolean" ||
    !Number.isSafeInteger(data?.sourceVersion) ||
    data.sourceVersion < 1 ||
    !(data.archivedAt === null || typeof data.archivedAt === "string") ||
    data.archived !== (data.archivedAt !== null)
  )
    return jsonNoStore(
      { error: "author_archive_status_contract_invalid" },
      409,
    );
  return jsonNoStore({
    entryId: data.entryId,
    archived: data.archived,
    archivedAt: data.archivedAt,
    sourceVersion: data.sourceVersion,
  });
}
