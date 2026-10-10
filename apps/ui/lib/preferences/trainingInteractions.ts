export type ProgressAnimation = "off" | "dots" | "wave";
export const defaultTrainingInteractions = {
  animation: true,
  gradeSwipe: false,
  translationSwipe: false,
  audioSwipe: false,
  syllableDoubleTap: false,
  showSyllables: false,
  progressAnimation: "dots" as ProgressAnimation,
};
export type TrainingInteractions = typeof defaultTrainingInteractions;
export function parseTrainingInteractions(value: unknown): TrainingInteractions {
  const record = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return Object.fromEntries(Object.entries(defaultTrainingInteractions).map(([key, fallback]) =>
    [key, key === "progressAnimation"
      ? (["off", "dots", "wave"].includes(String(record[key])) ? record[key] : fallback)
      : typeof record[key] === "boolean" ? record[key] : fallback])) as TrainingInteractions;
}
