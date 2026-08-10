import type { OnboardingLanguage } from "@/lib/onboardingI18n";

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
