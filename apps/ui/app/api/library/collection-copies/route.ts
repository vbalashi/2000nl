import { NextRequest } from "next/server";
import { jsonNoStore } from "@/lib/platform/serverSupabase";
import {
  authorizeCopyRequest,
  independentCopyFailure,
  readCopyJson,
} from "@/lib/platform/independentCopyRouteSupport";
import { copyUuid } from "@/lib/platform/independentEntryCopyContract";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
function preview(value: unknown, id: string) {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  return item.listId === id &&
    typeof item.revision === "string" &&
    /^[a-f0-9]{64}$/.test(item.revision) &&
    typeof item.canCopy === "boolean" &&
    Number.isSafeInteger(item.borrowedCount) &&
    Number(item.borrowedCount) >= 0 &&
    Number(item.borrowedCount) <= 50
    ? {
        listId: id,
        revision: item.revision,
        canCopy: item.canCopy,
        borrowedCount: Number(item.borrowedCount),
      }
    : null;
}
function receipt(value: unknown, id: string) {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  if (item.operationId !== id) return null;
  if (item.status === "unknown") return { operationId: id, status: "unknown" };
  return item.status === "completed" &&
    copyUuid(item.listId) &&
    Number.isSafeInteger(item.copiedCount) &&
    Number(item.copiedCount) >= 0 &&
    Number(item.copiedCount) <= 50
    ? {
        operationId: id,
        status: "completed",
        listId: item.listId,
        copiedCount: Number(item.copiedCount),
      }
    : null;
}
export async function GET(request: NextRequest) {
  const auth = await authorizeCopyRequest(request, false);
  if (auth instanceof Response) return auth;
  const pairs = [...request.nextUrl.searchParams.entries()];
  if (
    pairs.length !== 1 ||
    !["listId", "operationId"].includes(pairs[0][0]) ||
    !copyUuid(pairs[0][1])
  )
    return jsonNoStore({ error: "invalid_copy_request" }, 400);
  const [key, id] = pairs[0],
    isPreview = key === "listId";
  const { data, error } = await auth.supabase.rpc(
    isPreview
      ? "preview_collection_independent_copy_v1"
      : "read_collection_copy_receipt_v1",
    isPreview ? { p_list_id: id } : { p_operation_id: id },
  );
  if (error) return independentCopyFailure(error);
  const parsed = isPreview ? preview(data, id) : receipt(data, id);
  return parsed
    ? jsonNoStore(parsed)
    : jsonNoStore({ error: "independent_copy_contract_invalid" }, 502);
}
export async function POST(request: NextRequest) {
  const auth = await authorizeCopyRequest(request, true);
  if (auth instanceof Response) return auth;
  if (request.nextUrl.searchParams.size)
    return jsonNoStore({ error: "invalid_copy_request" }, 400);
  const value = await readCopyJson(request);
  if (!value || typeof value !== "object" || Array.isArray(value))
    return jsonNoStore({ error: "invalid_copy_request" }, 400);
  const command = value as Record<string, unknown>;
  if (
    Object.keys(command).sort().join(",") !==
      "expectedRevision,listId,operationId" ||
    !copyUuid(command.operationId) ||
    !copyUuid(command.listId) ||
    typeof command.expectedRevision !== "string" ||
    !/^[a-f0-9]{64}$/.test(command.expectedRevision)
  )
    return jsonNoStore({ error: "invalid_copy_request" }, 400);
  const { data, error } = await auth.supabase.rpc(
    "copy_collection_independent_entries_v1",
    {
      p_operation_id: command.operationId,
      p_list_id: command.listId,
      p_expected_revision: command.expectedRevision,
    },
  );
  if (error) return independentCopyFailure(error);
  const parsed = receipt(data, command.operationId);
  return parsed?.status === "completed" && parsed.listId === command.listId
    ? jsonNoStore(parsed)
    : jsonNoStore({ error: "independent_copy_contract_invalid" }, 502);
}
