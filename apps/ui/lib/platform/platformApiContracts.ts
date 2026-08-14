import type { ListCardPolicy, ReviewResult, TrainingMode } from "@/lib/types";

export type PlatformAction =
  | "fetch-entry"
  | "record-view"
  | "review-card"
  | "mark-known"
  | "mark-unknown"
  | "start-learning"
  | "add-to-list"
  | "remove-from-list"
  | "copy-to-user-dictionary"
  | "create-user-entry"
  | "update-user-entry"
  | "delete-user-entry"
  | "create-user-list"
  | "update-user-list"
  | "delete-user-list";

export type PlatformActionBody = {
  action?: unknown;
  entryId?: unknown;
  cardTypeId?: unknown;
  result?: unknown;
  turnId?: unknown;
  clientEventId?: unknown;
  sourceContext?: unknown;
  listId?: unknown;
  targetDictionaryId?: unknown;
  dictionaryId?: unknown;
  entry?: unknown;
  overrides?: unknown;
  name?: unknown;
  description?: unknown;
  languageCode?: unknown;
  primaryLanguageCode?: unknown;
  defaultScenarioId?: unknown;
  cardPolicy?: unknown;
  cardTypeIds?: unknown;
};

export type PlatformOperationResult = {
  payload: unknown;
  status: number;
  serverTiming?: string;
};

export function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export const PLATFORM_TRAINING_MODES = new Set<TrainingMode>([
  "word-to-definition",
  "definition-to-word",
  "listen-recognize",
  "listen-type",
]);

export const PLATFORM_REVIEW_RESULTS = new Set<ReviewResult>([
  "fail",
  "hard",
  "success",
  "easy",
  "freeze",
  "hide",
]);

export function asTrainingMode(value: unknown): TrainingMode | null {
  const mode = asString(value);
  return mode && PLATFORM_TRAINING_MODES.has(mode as TrainingMode)
    ? (mode as TrainingMode)
    : null;
}

export function asReviewResult(value: unknown): ReviewResult | null {
  const result = asString(value);
  return result && PLATFORM_REVIEW_RESULTS.has(result as ReviewResult)
    ? (result as ReviewResult)
    : null;
}

export function asUuid(value: unknown): string | null {
  const uuid = asString(value);
  return uuid &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uuid)
    ? uuid
    : null;
}

export function asListCardPolicy(value: unknown): ListCardPolicy | null {
  const policy = asString(value);
  return policy && ["inherit", "prefer", "restrict"].includes(policy)
    ? (policy as ListCardPolicy)
    : null;
}

export function asOptionalStringArray(
  value: unknown,
): { ok: true; value: string[] | null } | { ok: false } {
  if (value === undefined || value === null) return { ok: true, value: null };
  if (!Array.isArray(value)) return { ok: false };
  if (value.some((item) => !asString(item))) return { ok: false };
  const values = Array.from(
    new Set(
      value
        .map((item) => asString(item))
        .filter((item): item is string => Boolean(item)),
    ),
  );
  return { ok: true, value: values.length ? values : null };
}

export function hasOwnBodyField(
  body: PlatformActionBody,
  field: keyof PlatformActionBody,
) {
  return Object.prototype.hasOwnProperty.call(body, field);
}

