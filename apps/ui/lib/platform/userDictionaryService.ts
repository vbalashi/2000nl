import type { AuthenticatedSupabase } from "./serverSupabase";
import type { PlatformAction, PlatformOperationResult } from "./platformApi";

export async function createUserDictionaryEntry(
  auth: AuthenticatedSupabase,
  params: {
    action: PlatformAction;
    dictionaryId: string | null;
    entry: Record<string, unknown>;
  },
): Promise<PlatformOperationResult> {
  const { data, error } = await auth.supabase.rpc("create_user_dictionary_entry", {
    p_user_id: auth.user.id,
    p_dictionary_id: params.dictionaryId,
    p_entry: params.entry,
  });

  if (error) {
    return mapUserEntryRpcError("create_user_entry_failed", error);
  }

  return {
    payload: {
      ok: true,
      action: params.action,
      entryId: data,
      dictionaryId: params.dictionaryId ?? null,
    },
    status: 200,
  };
}

export async function updateUserDictionaryEntry(
  auth: AuthenticatedSupabase,
  params: {
    action: PlatformAction;
    entryId: string;
    entry: Record<string, unknown>;
  },
): Promise<PlatformOperationResult> {
  const { data, error } = await auth.supabase.rpc("update_user_dictionary_entry", {
    p_user_id: auth.user.id,
    p_entry_id: params.entryId,
    p_entry: params.entry,
  });

  if (error) {
    return mapUserEntryRpcError("update_user_entry_failed", error);
  }

  return { payload: { ok: true, action: params.action, entryId: data }, status: 200 };
}

export async function deleteUserDictionaryEntry(
  auth: AuthenticatedSupabase,
  params: {
    action: PlatformAction;
    entryId: string;
  },
): Promise<PlatformOperationResult> {
  const { error } = await auth.supabase.rpc("delete_user_dictionary_entry", {
    p_user_id: auth.user.id,
    p_entry_id: params.entryId,
  });

  if (error) {
    return mapUserEntryRpcError("delete_user_entry_failed", error);
  }

  return { payload: { ok: true, action: params.action, entryId: params.entryId }, status: 200 };
}

export function mapUserEntryRpcError(
  fallbackError: string,
  error: { message?: string } | unknown,
): PlatformOperationResult {
  const detail =
    typeof error === "object" && error && "message" in error
      ? String((error as { message?: string }).message ?? error)
      : String(error);

  if (detail.includes("entry_not_found")) {
    return { payload: { error: "entry_not_found" }, status: 404 };
  }
  if (detail.includes("target_dictionary_not_editable")) {
    return { payload: { error: "target_dictionary_not_editable" }, status: 403 };
  }
  if (detail.includes("duplicate_user_entry")) {
    return { payload: { error: "duplicate_user_entry", detail }, status: 409 };
  }
  if (
    detail.includes("invalid_user_entry") ||
    detail.includes("language_not_found") ||
    detail.includes("language_mismatch")
  ) {
    return { payload: { error: "invalid_user_entry", detail }, status: 400 };
  }

  return { payload: { error: fallbackError, detail }, status: 500 };
}
