import { isPlatformCardTypeId } from "./cardTypeRegistry";
const uuid = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
const exerciseCards = new Set([
  "idiom:direct",
  "idiom:reverse",
  "translation:recall",
]);
export type CurrentTrainingCardRead = { sessionId: string; permitId: string };
export type CurrentTrainingCardRequest =
  | {
      operation: "acknowledge";
      sessionId: string;
      entryId: string;
      cardTypeId: string;
      sourceVersion: number;
      stateRevision: string;
      targetId?: string;
      direction?: string;
    }
  | {
      operation: "read";
      sessionId: string;
      permitId: string;
      entryId: string;
      cardTypeId: Parameters<typeof isPlatformCardTypeId>[0];
      contentLanguageCode: string;
      translationTargetLanguageCode: string | null;
    };
export function parseCurrentTrainingCardRequest(
  value: unknown,
): CurrentTrainingCardRequest | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const r = value as Record<string, unknown>;
  if (
    !uuid(r.sessionId) ||
    !uuid(r.entryId) ||
    typeof r.cardTypeId !== "string"
  )
    return null;
  if (r.operation === "acknowledge") {
    if (
      Object.keys(r).some(
        (k) =>
          ![
            "operation",
            "sessionId",
            "entryId",
            "cardTypeId",
            "sourceVersion",
            "stateRevision",
            "targetId",
            "direction",
          ].includes(k),
      ) ||
      !Number.isSafeInteger(r.sourceVersion) ||
      Number(r.sourceVersion) < 1 ||
      typeof r.stateRevision !== "string" ||
      !r.stateRevision.length ||
      r.stateRevision.length > 160
    )
      return null;
    if (exerciseCards.has(r.cardTypeId)) {
      if (!uuid(r.targetId) || r.direction !== r.cardTypeId.split(":")[1])
        return null;
    } else if (
      !isPlatformCardTypeId(r.cardTypeId) ||
      r.targetId !== undefined ||
      r.direction !== undefined
    )
      return null;
    return r as CurrentTrainingCardRequest;
  }
  if (r.operation === "read") {
    if (
      Object.keys(r).some(
        (k) =>
          ![
            "operation",
            "sessionId",
            "entryId",
            "cardTypeId",
            "permitId",
            "contentLanguageCode",
            "translationTargetLanguageCode",
          ].includes(k),
      ) ||
      !uuid(r.permitId) ||
      !isPlatformCardTypeId(r.cardTypeId) ||
      typeof r.contentLanguageCode !== "string" ||
      !/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$/.test(r.contentLanguageCode) ||
      !(
        r.translationTargetLanguageCode === null ||
        (typeof r.translationTargetLanguageCode === "string" &&
          /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$/.test(
            r.translationTargetLanguageCode,
          ))
      )
    )
      return null;
    return r as CurrentTrainingCardRequest;
  }
  return null;
}

export function parseCurrentTrainingCardRead(
  value: unknown,
): CurrentTrainingCardRead | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const r = value as Record<string, unknown>;
  return Object.keys(r).every(
    (key) => key === "sessionId" || key === "permitId",
  ) &&
    uuid(r.sessionId) &&
    uuid(r.permitId)
    ? { sessionId: r.sessionId, permitId: r.permitId }
    : null;
}
