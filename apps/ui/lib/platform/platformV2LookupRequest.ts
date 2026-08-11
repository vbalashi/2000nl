import type { LookupIntent } from "../../../../packages/shared/types/platform";
import type { PlatformLookupV2Request } from "../../../../packages/shared/types/platformV2";
import { isPlatformCardTypeId } from "./cardTypeRegistry";

export function parsePlatformV2LookupRequest(
  value: unknown,
  options: { allowTrainingEntryId?: boolean } = {},
):
  | { ok: true; request: PlatformLookupV2Request }
  | { ok: false; error: string } {
  const body = asRecord(value);
  const query = typeof body.query === "string" ? body.query.trim() : "";
  const cardTypeId =
    typeof body.cardTypeId === "string" ? body.cardTypeId.trim() : "";
  if (!cardTypeId) return { ok: false, error: "missing_card_type_id" };
  if (!isPlatformCardTypeId(cardTypeId)) {
    return { ok: false, error: "unsupported_card_type_id" };
  }
  const intent = lookupIntent(body.intent);
  const entryId = optionalString(body.entryId);
  if (entryId && (!options.allowTrainingEntryId || intent !== "training-review")) {
    return { ok: false, error: "entry_id_not_allowed" };
  }
  if (entryId && !isUuid(entryId)) {
    return { ok: false, error: "invalid_entry_id" };
  }
  if (entryId && query) {
    return { ok: false, error: "query_not_allowed_with_entry_id" };
  }
  const cursor = optionalString(body.cursor);
  if (entryId && cursor) {
    return { ok: false, error: "cursor_not_allowed_with_entry_id" };
  }
  if (!entryId && !query) return { ok: false, error: "missing_query" };

  return {
    ok: true,
    request: entryId
      ? {
          entryId,
          cardTypeId,
          contentLanguageCode: optionalString(body.contentLanguageCode),
          translationTargetLanguageCode: optionalString(
            body.translationTargetLanguageCode,
          ),
          intent: "training-review",
        }
      : {
          query,
          cardTypeId,
          contentLanguageCode: optionalString(body.contentLanguageCode),
          translationTargetLanguageCode: optionalString(
            body.translationTargetLanguageCode,
          ),
          intent,
          cursor,
        },
  };
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function lookupIntent(value: unknown): LookupIntent {
  return value === "training-review" ||
    value === "external-click" ||
    value === "dictionary-lookup"
    ? value
    : "dictionary-lookup";
}
