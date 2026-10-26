import { NextRequest } from "next/server";
import {
  getAuthenticatedSupabase,
  jsonNoStore,
  requirePlatformScope,
} from "./serverSupabase";
export async function authorizeCopyRequest(
  request: NextRequest,
  write: boolean,
) {
  const auth = await getAuthenticatedSupabase(request);
  if (auth instanceof Response) return auth;
  if (auth.principal.authKind !== "first_party")
    return jsonNoStore({ error: "first_party_required" }, 403);
  const denied = requirePlatformScope(
    auth,
    write ? "platform:write" : "platform:read",
  );
  if (denied) return denied;
  if (process.env.NEXT_PUBLIC_INDEPENDENT_ENTRY_COPY_ENABLED !== "true")
    return jsonNoStore({ error: "independent_copy_not_enabled" }, 503);
  return auth;
}
export function independentCopyFailure(error: {
  code?: string;
  message?: string;
}) {
  const known = [
    "copy_source_changed",
    "copy_collection_changed",
    "copy_collection_too_large",
    "copy_operation_conflict",
    "copy_content_too_large",
    "copy_content_invalid",
    "copy_content_unsupported",
    "copy_asset_snapshot_unsupported",
    "rich_entry_edit_requires_content",
  ];
  const key = known.find((key) => error.message === key);
  if (key)
    return jsonNoStore(
      { error: key },
      key === "copy_source_changed" ||
        key === "copy_collection_changed" ||
        key === "copy_operation_conflict"
        ? 409
        : 422,
    );
  if (error.code === "42501")
    return jsonNoStore({ error: "copy_source_unavailable" }, 404);
  return jsonNoStore({ error: "independent_copy_failed" }, 500);
}
export async function readCopyJson(request: NextRequest): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) return null;
  let value = "";
  let bytes = 0;
  const decoder = new TextDecoder();
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > 1024) {
        await reader.cancel();
        return null;
      }
      value += decoder.decode(chunk.value, { stream: true });
    }
    value += decoder.decode();
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
