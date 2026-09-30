import { getUiMessages } from "@/lib/uiMessages";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";

type TrainingHotkeyId =
  | "answer"
  | "hint"
  | "details"
  | "translation"
  | "search"
  | "again"
  | "hard"
  | "good"
  | "easy"
  | "overview";

const hotkeys: Array<{ key: string; id: TrainingHotkeyId }> = [
  { key: "Space", id: "answer" },
  { key: "I", id: "hint" },
  { key: "Shift+I", id: "details" },
  { key: "T", id: "translation" },
  { key: "S", id: "search" },
  { key: "H", id: "again" },
  { key: "J", id: "hard" },
  { key: "K", id: "good" },
  { key: "L", id: "easy" },
  { key: "?", id: "overview" },
];


export const getTrainingHotkeys = (language: OnboardingLanguage) =>
  hotkeys.map(({ key, id }) => ({ key, description: getUiMessages(language).trainingHotkeys[id] }));

export function areTrainingHotkeysSuspended() {
  return (
    typeof document !== "undefined" &&
    document.querySelector('[data-training-hotkeys-suspended="true"]') !== null
  );
}

/** Reuse the actual interface copy in rating previews and controls. */
export function getTrainingRatingLabels(language: OnboardingLanguage) {
  const labels = getUiMessages(language).trainingHotkeys;
  return {Again:labels.again,Hard:labels.hard,Good:labels.good,Easy:labels.easy};
}
