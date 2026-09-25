import type { TrainingExclusionRequest } from "../../../../packages/shared/types/trainingExclusion";
const uuid = (v: unknown): v is string =>
  typeof v === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const object = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
const keys = (v: Record<string, unknown>, allowed: string[]) =>
  Object.keys(v).every((key) => allowed.includes(key));
export function parseTrainingExclusionRequest(
  value: unknown,
): TrainingExclusionRequest | null {
  const v = object(value),
    target = object(v.target);
  if (!uuid(v.clientEventId)) return null;
  if (target.kind === "meaning") {
    if (
      !keys(target, ["kind", "entryId", "cardTypeId"]) ||
      !uuid(target.entryId) ||
      typeof target.cardTypeId !== "string" ||
      ![
        "word-to-definition",
        "definition-to-word",
        "listen-recognize",
        "listen-type",
      ].includes(target.cardTypeId)
    )
      return null;
  } else if (target.kind === "exercise") {
    if (!keys(target, ["kind", "targetId"]) || !uuid(target.targetId))
      return null;
  } else return null;
  if (v.actionId === "exclude-pair") {
    if (
      !keys(v, ["actionId", "clientEventId", "target", "trainingSessionId"]) ||
      !uuid(v.trainingSessionId)
    )
      return null;
  } else if (v.actionId === "restore-pair") {
    if (
      !keys(v, ["actionId", "clientEventId", "target", "exclusionId"]) ||
      !uuid(v.exclusionId)
    )
      return null;
  } else return null;
  return v as TrainingExclusionRequest;
}
