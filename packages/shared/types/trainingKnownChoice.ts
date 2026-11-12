export const meaningDirections = ["word-to-definition", "definition-to-word"] as const;
export type MeaningDirection = typeof meaningDirections[number];
export type TrainingKnownChoiceRequest = {
  entryId: string;
  trainingSessionId: string;
  currentDirection: MeaningDirection;
  knownDirections: MeaningDirection[];
  revision: string;
  clientEventId: string;
};
const uuid = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export function parseTrainingKnownChoiceRequest(value: unknown): TrainingKnownChoiceRequest | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (Object.keys(v).some(key => !["entryId", "trainingSessionId", "currentDirection", "knownDirections", "revision", "clientEventId"].includes(key)) ||
    !uuid(v.entryId) || !uuid(v.trainingSessionId) || !uuid(v.clientEventId) ||
    !meaningDirections.includes(v.currentDirection as MeaningDirection) ||
    typeof v.revision !== "string" || !/^[a-f0-9]{64}$/.test(v.revision) ||
    !Array.isArray(v.knownDirections) || v.knownDirections.length > 2 || new Set(v.knownDirections).size !== v.knownDirections.length ||
    v.knownDirections.some(direction => !meaningDirections.includes(direction))) return null;
  return v as TrainingKnownChoiceRequest;
}
