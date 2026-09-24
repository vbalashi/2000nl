export type PlatformV2TranslationExerciseRequest = {
  limit: number;
  offset: number;
};

export function parsePlatformV2TranslationExerciseRequest(
  value: unknown,
):
  | { ok: true; request: PlatformV2TranslationExerciseRequest }
  | { ok: false; error: string } {
  const body = asRecord(value);
  const limit = body.limit === undefined ? 20 : body.limit;
  const offset = body.offset === undefined ? 0 : body.offset;
  if (
    typeof limit !== "number" ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 100
  ) {
    return { ok: false, error: "invalid_translation_exercise_limit" };
  }
  if (
    typeof offset !== "number" ||
    !Number.isInteger(offset) ||
    offset < 0 ||
    offset > 100_000
  ) {
    return { ok: false, error: "invalid_translation_exercise_offset" };
  }
  return { ok: true, request: { limit, offset } };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
