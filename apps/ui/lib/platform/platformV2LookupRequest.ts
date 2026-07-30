import type { LookupIntent } from "../../../../packages/shared/types/platform";
import type { PlatformLookupV2Request } from "../../../../packages/shared/types/platformV2";

export function parsePlatformV2LookupRequest(
  value: unknown,
):
  | { ok: true; request: PlatformLookupV2Request }
  | { ok: false; error: string } {
  const body = asRecord(value);
  const query =
    typeof body.query === "string" ? body.query.trim() : "";
  const cardTypeId =
    typeof body.cardTypeId === "string" ? body.cardTypeId.trim() : "";
  if (!query) return { ok: false, error: "missing_query" };
  if (!cardTypeId) return { ok: false, error: "missing_card_type_id" };

  return {
    ok: true,
    request: {
      query,
      cardTypeId,
      contentLanguageCode: optionalString(body.contentLanguageCode),
      translationTargetLanguageCode: optionalString(
        body.translationTargetLanguageCode,
      ),
      intent: lookupIntent(body.intent),
      cursor: optionalString(body.cursor),
    },
  };
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
