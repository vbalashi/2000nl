import { localizedField } from "@/lib/i18n/catalog";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import type { CardFilter, TrainingMode } from "@/lib/types";

const scenarioLabels = localizedField("sessionLabels", "scenario") satisfies Record<
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

const modeLabels = localizedField("sessionLabels", "mode") satisfies Record<OnboardingLanguage, Record<TrainingMode, string | null>>;

const filterLabels = localizedField("sessionLabels", "filter") satisfies Record<OnboardingLanguage, Record<CardFilter, string>>;

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
