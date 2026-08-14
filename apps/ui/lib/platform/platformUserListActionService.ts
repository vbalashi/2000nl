import type { AuthenticatedSupabase } from "./serverSupabase";
import { mapUserListRpcPayload } from "./listService";
import {
  asListCardPolicy,
  asOptionalStringArray,
  asString,
  hasOwnBodyField,
  type PlatformActionBody,
  type PlatformOperationResult,
} from "./platformApiContracts";

export type PlatformUserListAction =
  | "create-user-list"
  | "update-user-list"
  | "delete-user-list";

export function isPlatformUserListAction(
  action: string,
): action is PlatformUserListAction {
  return (
    action === "create-user-list" ||
    action === "update-user-list" ||
    action === "delete-user-list"
  );
}

export async function performPlatformUserListAction(
  auth: AuthenticatedSupabase,
  action: PlatformUserListAction,
  body: PlatformActionBody,
): Promise<PlatformOperationResult> {
  if (action === "create-user-list") {
    const name = asString(body?.name);
    if (!name) {
      return { payload: { error: "missing_list_name" }, status: 400 };
    }

    const languageCode = asString(body?.languageCode) ?? "nl";
    if (body?.cardPolicy !== undefined && !asListCardPolicy(body.cardPolicy)) {
      return { payload: { error: "invalid_user_list" }, status: 400 };
    }
    const cardTypeIds = asOptionalStringArray(body?.cardTypeIds);
    if (!cardTypeIds.ok) {
      return { payload: { error: "invalid_user_list" }, status: 400 };
    }
    const cardPolicy = asListCardPolicy(body?.cardPolicy) ?? "inherit";
    const { data, error } = await auth.supabase.rpc("create_user_word_list", {
      p_user_id: auth.user.id,
      p_name: name,
      p_description: asString(body?.description),
      p_language_code: languageCode,
      p_primary_language_code: asString(body?.primaryLanguageCode) ?? languageCode,
      p_default_scenario_id: asString(body?.defaultScenarioId),
      p_card_policy: cardPolicy,
      p_card_type_ids: cardTypeIds.value,
    });

    if (error) {
      const detail = error.message ?? String(error);
      if (detail.includes("duplicate_user_list")) {
        return { payload: { error: "duplicate_user_list", detail }, status: 409 };
      }
      if (
        detail.includes("invalid_list_name") ||
        detail.includes("language_not_found") ||
        detail.includes("invalid_card_policy") ||
        detail.includes("scenario_not_found") ||
        detail.includes("invalid_card_type_ids")
      ) {
        return { payload: { error: "invalid_user_list", detail }, status: 400 };
      }
      return { payload: { error: "create_user_list_failed", detail }, status: 500 };
    }

    return {
      payload: {
        ok: true,
        action,
        listId: data?.id ?? null,
        list: mapUserListRpcPayload(data),
      },
      status: 200,
    };
  }

  if (action === "delete-user-list") {
    const listId = asString(body?.listId);
    if (!listId) {
      return { payload: { error: "missing_list_id" }, status: 400 };
    }

    const { error } = await auth.supabase.rpc("delete_user_word_list", {
      p_user_id: auth.user.id,
      p_list_id: listId,
    });

    if (error) {
      const detail = error.message ?? String(error);
      if (detail.includes("list_not_found")) {
        return { payload: { error: "list_not_found" }, status: 404 };
      }
      return { payload: { error: "delete_user_list_failed", detail }, status: 500 };
    }

    return { payload: { ok: true, action, listId }, status: 200 };
  }

  if (action === "update-user-list") {
    const listId = asString(body?.listId);
    if (!listId) {
      return { payload: { error: "missing_list_id" }, status: 400 };
    }

    const languageCode = asString(body?.languageCode);
    if (body?.cardPolicy !== undefined && !asListCardPolicy(body.cardPolicy)) {
      return { payload: { error: "invalid_user_list" }, status: 400 };
    }
    const cardTypeIds = asOptionalStringArray(body?.cardTypeIds);
    if (!cardTypeIds.ok) {
      return { payload: { error: "invalid_user_list" }, status: 400 };
    }
    const cardPolicy = asListCardPolicy(body?.cardPolicy);
    const { data, error } = await auth.supabase.rpc("update_user_word_list", {
      p_user_id: auth.user.id,
      p_list_id: listId,
      p_name: asString(body?.name),
      p_description:
        typeof body?.description === "string" ? body.description : null,
      p_language_code: languageCode,
      p_primary_language_code:
        asString(body?.primaryLanguageCode) ?? languageCode,
      p_default_scenario_id: asString(body?.defaultScenarioId),
      p_card_policy: cardPolicy,
      p_card_type_ids: cardTypeIds.value,
      p_clear_default_scenario:
        hasOwnBodyField(body ?? {}, "defaultScenarioId") &&
        body?.defaultScenarioId === null,
    });

    if (error) {
      const detail = error.message ?? String(error);
      if (detail.includes("list_not_found")) {
        return { payload: { error: "list_not_found" }, status: 404 };
      }
      if (detail.includes("duplicate_user_list")) {
        return { payload: { error: "duplicate_user_list", detail }, status: 409 };
      }
      if (
        detail.includes("invalid_list_name") ||
        detail.includes("language_not_found") ||
        detail.includes("invalid_card_policy") ||
        detail.includes("scenario_not_found") ||
        detail.includes("invalid_card_type_ids")
      ) {
        return { payload: { error: "invalid_user_list", detail }, status: 400 };
      }
      return { payload: { error: "update_user_list_failed", detail }, status: 500 };
    }

    return {
      payload: {
        ok: true,
        action,
        listId,
        list: mapUserListRpcPayload(data),
      },
      status: 200,
    };
  }


  return { payload: { error: "unsupported_action" }, status: 400 };
}

