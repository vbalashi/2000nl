import type { TrainingExerciseFamily } from "@/lib/types";

export type SourceWordStatus = "learning" | "all";
export const usesSourceWordSelection = (family?: TrainingExerciseFamily) =>
  family === "idiom" || family === "word-in-context";

/** New setup requests are explicit; absent fields in owned legacy runs stay absent. */
export function sourceWordSelection(draft: { family?: TrainingExerciseFamily; sourceWordStatus?: SourceWordStatus }) {
  return usesSourceWordSelection(draft.family)
    ? { sourceWordStatus: draft.sourceWordStatus ?? "learning" as const }
    : {};
}
