import type { AuthenticatedSupabase } from "./serverSupabase";
import { validatePlatformActionEnvelope } from "./actionService";
import {
  isPlatformUserListAction,
  performPlatformUserListAction,
} from "./platformUserListActionService";
import {
  performProvenanceAwareCardAction,
  recordReview,
} from "./provenanceService";
import {
  createUserDictionaryEntry,
  deleteUserDictionaryEntry,
  updateUserDictionaryEntry,
} from "./userDictionaryService";
import {
  asReviewResult,
  asString,
  asTrainingMode,
  asUuid,
  type PlatformActionBody,
  type PlatformOperationResult,
} from "./platformApiContracts";

async function assertEntryReadable(
  supabase: any,
  entryId: string,
): Promise<true | { error: string; detail?: string }> {
  const { data: entry, error } = await supabase.rpc(
    "fetch_dictionary_entry_by_id_gated",
    {
      p_entry_id: entryId,
    },
  );

  if (error) {
    return { error: "entry_lookup_failed", detail: error.message ?? String(error) };
  }
  if (!entry) {
    return { error: "entry_not_accessible" };
  }

  return true;
}

export async function performPlatformAction(
  auth: AuthenticatedSupabase,
  body: PlatformActionBody | null,
): Promise<PlatformOperationResult> {
  const validated = validatePlatformActionEnvelope(auth, body);
  if (!validated.ok) {
    return validated.result;
  }
  const { action, entryId, clientEventId, sourceContext } = validated.value;

  if (action === "fetch-entry") {
    if (!entryId) {
      return { payload: { error: "missing_entry_id" }, status: 400 };
    }

    const { data, error } = await auth.supabase.rpc(
      "fetch_dictionary_entry_by_id_gated",
      {
        p_entry_id: entryId,
      },
    );

    if (error) {
      return {
        payload: {
          error: "entry_lookup_failed",
          detail: error.message ?? String(error),
        },
        status: 500,
      };
    }
    if (!data) {
      return { payload: { error: "entry_not_accessible" }, status: 404 };
    }

    return {
      payload: {
        ok: true,
        action,
        entryId,
        entry: data,
      },
      status: 200,
    };
  }

  if (isPlatformUserListAction(action)) {
    return performPlatformUserListAction(auth, action, body ?? {});
  }

  if (action === "create-user-entry") {
    const dictionaryId = asString(body?.dictionaryId);
    const entry =
      body?.entry && typeof body.entry === "object" && !Array.isArray(body.entry)
        ? (body.entry as Record<string, unknown>)
        : null;
    if (!entry) {
      return { payload: { error: "missing_entry_payload" }, status: 400 };
    }

    return createUserDictionaryEntry(auth, { action, dictionaryId, entry });
  }

  if (!entryId) {
    return { payload: { error: "missing_entry_id" }, status: 400 };
  }

  if (action === "update-user-entry") {
    const entry =
      body?.entry && typeof body.entry === "object" && !Array.isArray(body.entry)
        ? (body.entry as Record<string, unknown>)
        : null;
    if (!entry) {
      return { payload: { error: "missing_entry_payload" }, status: 400 };
    }

    return updateUserDictionaryEntry(auth, { action, entryId, entry });
  }

  if (action === "delete-user-entry") {
    return deleteUserDictionaryEntry(auth, { action, entryId });
  }

  if (action === "remove-from-list") {
    const listId = asString(body?.listId);
    if (!listId) {
      return { payload: { error: "missing_list_id" }, status: 400 };
    }

    const { error } = await auth.supabase.rpc("remove_entries_from_user_list", {
      p_user_id: auth.user.id,
      p_list_id: listId,
      p_entry_ids: [entryId],
    });

    if (error) {
      const detail = error.message ?? String(error);
      if (detail.includes("list_not_found")) {
        return { payload: { error: "list_not_found" }, status: 404 };
      }
      return { payload: { error: "remove_from_list_failed", detail }, status: 500 };
    }

    return { payload: { ok: true, action, entryId, listId }, status: 200 };
  }

  const readable = await assertEntryReadable(auth.supabase, entryId);
  if (readable !== true) {
    const status =
      readable.error === "entry_not_found"
        ? 404
        : readable.error === "entry_lookup_failed"
          ? 500
          : 403;
    return { payload: readable, status };
  }

  if (action === "add-to-list") {
    const listId = asString(body?.listId);
    if (!listId) {
      return { payload: { error: "missing_list_id" }, status: 400 };
    }

    const { error } = await auth.supabase.rpc("add_entry_to_user_list", {
      p_user_id: auth.user.id,
      p_list_id: listId,
      p_entry_id: entryId,
    });

    if (error) {
      const detail = error.message ?? String(error);
      if (detail.includes("list_not_found")) {
        return { payload: { error: "list_not_found" }, status: 404 };
      }
      if (detail.includes("entry_not_found")) {
        return { payload: { error: "entry_not_found" }, status: 404 };
      }
      if (detail.includes("entry_not_accessible")) {
        return { payload: { error: "entry_not_accessible" }, status: 403 };
      }
      return { payload: { error: "add_to_list_failed", detail }, status: 500 };
    }

    return { payload: { ok: true, action, entryId, listId }, status: 200 };
  }

  if (action === "copy-to-user-dictionary") {
    const targetDictionaryId = asString(body?.targetDictionaryId);
    const overrides =
      body?.overrides && typeof body.overrides === "object" && !Array.isArray(body.overrides)
        ? body.overrides
        : {};

    const { data, error } = await auth.supabase.rpc("copy_entry_to_user_dictionary", {
      p_user_id: auth.user.id,
      p_source_entry_id: entryId,
      p_target_dictionary_id: targetDictionaryId,
      p_overrides: overrides,
    });

    if (error) {
      const detail = error.message ?? String(error);
      if (detail.includes("entry_not_found")) {
        return { payload: { error: "entry_not_found" }, status: 404 };
      }
      if (detail.includes("entry_not_accessible")) {
        return { payload: { error: "entry_not_accessible" }, status: 403 };
      }
      if (detail.includes("target_dictionary_not_editable")) {
        return { payload: { error: "target_dictionary_not_editable" }, status: 403 };
      }
      if (
        detail.includes("invalid_user_entry") ||
        detail.includes("language_not_found") ||
        detail.includes("language_mismatch")
      ) {
        return { payload: { error: "invalid_user_entry", detail }, status: 400 };
      }
      return {
        payload: { error: "copy_to_user_dictionary_failed", detail },
        status: 500,
      };
    }

    return {
      payload: {
        ok: true,
        action,
        entryId,
        copiedEntryId: data,
        targetDictionaryId: targetDictionaryId ?? null,
      },
      status: 200,
    };
  }

  const mode = asTrainingMode(body?.cardTypeId);
  if (!mode) {
    return { payload: { error: "missing_or_invalid_card_type_id" }, status: 400 };
  }

  if (action === "record-view" || action === "start-learning") {
    if (clientEventId) {
      const { data, error } = await performProvenanceAwareCardAction(auth, {
        entryId,
        mode,
        action,
        clientEventId,
        sourceContext,
      });

      if (error) {
        const detail = error.message ?? String(error);
        if (detail.includes("platform_action_idempotency_conflict")) {
          return { payload: { error: "idempotency_conflict", detail }, status: 409 };
        }
        return {
          payload: { error: `${action}_failed`, detail },
          status: 500,
        };
      }
      return {
        payload: {
          ok: true,
          action,
          entryId,
          cardTypeId: mode,
          clientEventId,
          provenance: data ?? null,
        },
        status: 200,
      };
    }

    const { error } =
      action === "start-learning"
        ? await auth.supabase.rpc("start_learning_entry_card", {
            p_user_id: auth.user.id,
            p_entry_id: entryId,
            p_card_type_id: mode,
          })
        : await auth.supabase.rpc("record_card_view", {
            p_user_id: auth.user.id,
            p_entry_id: entryId,
            p_card_type_id: mode,
          });

    if (error) {
      return {
        payload: { error: `${action}_failed`, detail: error.message ?? String(error) },
        status: 500,
      };
    }
    return { payload: { ok: true, action, entryId, cardTypeId: mode }, status: 200 };
  }

  const result =
    action === "mark-unknown"
      ? "fail"
      : action === "mark-known"
        ? "easy"
        : asReviewResult(body?.result);
  if (!result) {
    return { payload: { error: "missing_or_invalid_result" }, status: 400 };
  }

  const turnId = asString(body?.turnId);
  const provenanceTurnId = clientEventId ? asUuid(body?.turnId) ?? asUuid(clientEventId) : null;
  if (clientEventId && body?.turnId !== undefined && !asUuid(body.turnId)) {
    return { payload: { error: "invalid_turn_id" }, status: 400 };
  }

  if (clientEventId) {
    const { data, error } = await performProvenanceAwareCardAction(auth, {
      entryId,
      mode,
      action,
      result,
      turnId: provenanceTurnId,
      clientEventId,
      sourceContext,
    });

    if (error) {
      const detail = error.message ?? String(error);
      if (detail.includes("platform_action_idempotency_conflict")) {
        return { payload: { error: "idempotency_conflict", detail }, status: 409 };
      }
      if (detail.includes("platform_review_turn_already_consumed")) {
        return {
          payload: { error: "review_turn_already_consumed", detail },
          status: 409,
        };
      }
      return {
        payload: { error: `${action}_failed`, detail },
        status: 500,
      };
    }

    return {
      payload: {
        ok: true,
        action,
        entryId,
        cardTypeId: mode,
        result,
        turnId: provenanceTurnId,
        clientEventId,
        provenance: data ?? null,
      },
      status: 200,
    };
  }

  const { error } = await recordReview(auth, {
    entryId,
    mode,
    result,
    turnId,
  });

  if (error) {
    return {
      payload: { error: `${action}_failed`, detail: error.message ?? String(error) },
      status: 500,
    };
  }

  return {
    payload: {
      ok: true,
      action,
      entryId,
      cardTypeId: mode,
      result,
      turnId: turnId ?? null,
    },
    status: 200,
  };
}
