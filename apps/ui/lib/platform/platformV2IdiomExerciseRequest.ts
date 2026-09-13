export type PlatformV2IdiomExerciseRequest = {
  direction: "direct" | "reverse";
  limit: number;
  offset: number;
};

export function parsePlatformV2IdiomExerciseRequest(
  value: unknown,
):
  | { ok: true; request: PlatformV2IdiomExerciseRequest }
  | { ok: false; error: string } {
  const body = asRecord(value);
  if (body.direction !== "direct" && body.direction !== "reverse") {
    return { ok: false, error: "invalid_idiom_exercise_direction" };
  }

  const limit = body.limit === undefined ? 20 : body.limit;
  const offset = body.offset === undefined ? 0 : body.offset;
  if (
    typeof limit !== "number" ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 100
  ) {
    return { ok: false, error: "invalid_idiom_exercise_limit" };
  }
  if (
    typeof offset !== "number" ||
    !Number.isInteger(offset) ||
    offset < 0 ||
    offset > 100_000
  ) {
    return { ok: false, error: "invalid_idiom_exercise_offset" };
  }

  return {
    ok: true,
    request: { direction: body.direction, limit, offset },
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
