export const defaultTrainingInteractions = {
  animation: true,
  gradeSwipe: false,
  translationSwipe: false,
  syllableDoubleTap: false,
};
export type TrainingInteractions = typeof defaultTrainingInteractions;
export function parseTrainingInteractions(value: unknown): TrainingInteractions {
  const record = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return Object.fromEntries(Object.entries(defaultTrainingInteractions).map(([key, fallback]) =>
    [key, typeof record[key] === "boolean" ? record[key] : fallback])) as TrainingInteractions;
}
