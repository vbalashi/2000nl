import { NextRequest } from "next/server";
import { jsonNoStore } from "@/lib/platform/serverSupabase";
import {
  authorizeCopyRequest as authenticate,
  independentCopyFailure as failure,
  readCopyJson,
} from "@/lib/platform/independentCopyRouteSupport";
import {
  copyUuid,
  parseEntryCopyCommand,
  parseEntryCopyPreview,
  parseEntryCopyReceipt,
} from "@/lib/platform/independentEntryCopyContract";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export async function GET(request: NextRequest) {
  const auth = await authenticate(request, false);
  if (auth instanceof Response) return auth;
  const pairs = [...request.nextUrl.searchParams.entries()];
  if (
    pairs.length !== 1 ||
    !["sourceEntryId", "operationId"].includes(pairs[0][0]) ||
    !copyUuid(pairs[0][1])
  )
    return jsonNoStore({ error: "invalid_copy_request" }, 400);
  const [key, id] = pairs[0];
  const preview = key === "sourceEntryId";
  const { data, error } = await auth.supabase.rpc(
    preview
      ? "preview_independent_entry_copy_v1"
      : "read_independent_entry_copy_receipt_v1",
    preview ? { p_source_entry_id: id } : { p_operation_id: id },
  );
  if (error) return failure(error);
  const parsed = preview
    ? parseEntryCopyPreview(data, id)
    : parseEntryCopyReceipt(data, id);
  return parsed
    ? jsonNoStore(parsed)
    : jsonNoStore({ error: "independent_copy_contract_invalid" }, 502);
}
export async function POST(request: NextRequest) {
  const auth = await authenticate(request, true);
  if (auth instanceof Response) return auth;
  // Commands accept identities and revisions only, never trusted snapshot content.
  if (request.nextUrl.searchParams.size)
    return jsonNoStore({ error: "invalid_copy_request" }, 400);
  const body = await readCopyJson(request);
  const command = parseEntryCopyCommand(body);
  if (!command) return jsonNoStore({ error: "invalid_copy_request" }, 400);
  const { data, error } = await auth.supabase.rpc("copy_independent_entry_v1", {
    p_operation_id: command.operationId,
    p_source_entry_id: command.sourceEntryId,
    p_expected_revision: command.expectedRevision,
  });
  if (error) return failure(error);
  const receipt = parseEntryCopyReceipt(data, command.operationId);
  return receipt?.status === "completed"
    ? jsonNoStore(receipt)
    : jsonNoStore({ error: "independent_copy_contract_invalid" }, 502);
}
