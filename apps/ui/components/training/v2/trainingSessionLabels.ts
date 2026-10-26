import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import type { CardFilter, TrainingMode } from "@/lib/types";

const scenarioLabels = {
  nl: {
    understanding: "Begrip",
    listening: "Luisteren",
    conjugation: "Vervoegingen",
  },
  en: {
    understanding: "Understanding",
    listening: "Listening",
    conjugation: "Conjugation",
  },
  ru: {
    understanding: "Понимание",
    listening: "Аудирование",
    conjugation: "Спряжение",
  },
} satisfies Record<
  OnboardingLanguage,
  Record<"understanding" | "listening" | "conjugation", string>
>;

export function trainingScenarioLabel(
  interfaceLanguage: OnboardingLanguage,
  scenario: string,
) {
  const labels = scenarioLabels[interfaceLanguage];
  return labels[scenario as keyof typeof labels] ?? scenario;
}

const modeLabels = {
  nl: {
    "word-to-definition": null,
    "definition-to-word": "Definitie → woord",
    "listen-recognize": "Luisteren → herkennen",
    "listen-type": "Luisteren → typen",
  },
  en: {
    "word-to-definition": null,
    "definition-to-word": "Definition → word",
    "listen-recognize": "Listen → recognize",
    "listen-type": "Listen → type",
  },
  ru: {
    "word-to-definition": null,
    "definition-to-word": "Определение → слово",
    "listen-recognize": "Слушать → узнать",
    "listen-type": "Слушать → написать",
  },
} satisfies Record<OnboardingLanguage, Record<TrainingMode, string | null>>;

const filterLabels = {
  nl: { new: "Nieuw", review: "Herhaling", both: "Nieuw + herhaling" },
  en: { new: "New", review: "Review", both: "New + review" },
  ru: { new: "Новые", review: "Повторение", both: "Новые + повторение" },
} satisfies Record<OnboardingLanguage, Record<CardFilter, string>>;

export function trainingSessionLabel(
  interfaceLanguage: OnboardingLanguage,
  scenario: string,
  mode: TrainingMode,
  cardFilter: CardFilter,
) {
  const scenarioLabel =
    scenario === "understanding" && mode === "word-to-definition"
      ? null
      : trainingScenarioLabel(interfaceLanguage, scenario);
  return [
    scenarioLabel,
    modeLabels[interfaceLanguage][mode],
    filterLabels[interfaceLanguage][cardFilter],
  ].filter(Boolean).join(" · ");
}
