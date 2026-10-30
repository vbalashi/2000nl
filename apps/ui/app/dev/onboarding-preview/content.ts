import en from "./locales/en.json";
import nl from "./locales/nl.json";
import ru from "./locales/ru.json";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";

export const previewLocales = { en, nl, ru } satisfies Record<OnboardingLanguage, typeof en>;
const nativeLanguageNames = { en: "English", nl: "Nederlands", ru: "Русский" } satisfies Record<OnboardingLanguage, string>;
export const previewLanguageOptions = (Object.keys(previewLocales) as OnboardingLanguage[])
  .map(code => ({ code, name: nativeLanguageNames[code] }));
export type PreviewCopy = typeof en;
// Stable IDs and translation keys stay independent of translated labels.
export const previewSteps = [
  { id: "interface", target: "#preview-interface", title: "interfaceTitle", body: "interfaceBody", placement: "bottom" },
  { id: "translation", target: "#preview-translation", title: "translationTitle", body: "translationBody", placement: "bottom" },
  { id: "overview", target: "#preview-overview section:first-of-type button:not([aria-label])", title: "startTitle", body: "startBody", placement: "bottom" },
  // Card target is refined from the current locale's actual accessible label.
  { id: "card", target: "#preview-card button[aria-label]", title: "revealTitle", body: "revealBody", placement: "top-end" },
] as const;
export type PreviewStage = typeof previewSteps[number]["id"];

export function progressLabel(language: OnboardingLanguage, stage: PreviewStage) {
  return previewLocales[language].progress
    .replace("{step}", String(previewSteps.findIndex(step => step.id === stage) + 1))
    .replace("{total}", String(previewSteps.length));
}
