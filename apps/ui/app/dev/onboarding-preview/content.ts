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
  { id: "interface", section: 1, target: "#preview-interface", title: "interfaceTitle", body: "interfaceBody", placement: "bottom" },
  { id: "translation", section: 2, target: "#preview-translation", title: "translationTitle", body: "translationBody", placement: "bottom" },
  { id: "overview", section: 3, target: "#preview-overview section:first-of-type button:not([aria-label])", title: "startTitle", body: "startBody", placement: "bottom" },
  // Card target is refined from the current locale's actual accessible label.
  { id: "card", section: 4, target: "#preview-card button[aria-label]", title: "revealTitle", body: "revealBody", placement: "top-end" },
  { id: "answer", section: 4, target: "#preview-card button", title: "learnTitle", body: "learnBody", placement: "top-end" },
  { id: "exit", section: 4, target: "#preview-session-close", title: "exitTitle", body: "exitBody", placement: "bottom-end" },
  { id: "go-library", section: 5, target: "nav button", title: "libraryTitle", body: "libraryBody", placement: "bottom" },
  { id: "search", section: 6, target: "#preview-library-search", title: "searchTitle", body: "searchBody", placement: "bottom" },
  { id: "result", section: 6, target: "[data-testid='library-headword-group-headword-bank']", title: "openWordTitle", body: "openWordBody", placement: "bottom" },
  { id: "meaning", section: 7, target: "#preview-meaning [data-testid='library-sense-card-lead']", title: "meaningTitle", body: "meaningBody", placement: "top" },
  { id: "collections", section: 8, target: "#preview-meaning button", title: "collectionsTitle", body: "collectionsBody", placement: "top" },
  { id: "new-collection", section: 8, target: "#preview-collections dialog button", title: "newCollectionTitle", body: "newCollectionBody", placement: "top" },
  { id: "collection-name", section: 8, target: "#preview-collections form", title: "collectionNameTitle", body: "collectionNameBody", placement: "top" },
  { id: "collection-done", section: 8, target: "#preview-collections footer button", title: "membershipTitle", body: "membershipBody", placement: "bottom-end" },
  { id: "go-training", section: 9, target: "nav button", title: "goTrainingTitle", body: "goTrainingBody", placement: "bottom" },
  { id: "create-training", section: 9, target: "#preview-overview button", title: "createTrainingTitle", body: "createTrainingBody", placement: "bottom" },
  { id: "source-open", section: 10, target: "#preview-builder button", title: "sourceTitle", body: "sourceBody", placement: "bottom" },
  { id: "source-pick", section: 10, target: "#preview-builder button", title: "sourcePickTitle", body: "sourcePickBody", placement: "bottom" },
  { id: "exercise-open", section: 11, target: "#preview-builder button", title: "exercisesTitle", body: "exercisesBody", placement: "bottom" },
  { id: "direction-pick", section: 11, target: "#preview-builder button", title: "directionTitle", body: "directionBody", placement: "bottom" },
  { id: "save-training", section: 12, target: "#preview-builder button", title: "saveTrainingTitle", body: "saveTrainingBody", placement: "top" },
  { id: "training-name", section: 12, target: "#preview-builder dialog", title: "nameTrainingTitle", body: "nameTrainingBody", placement: "top" },
  { id: "complete", section: 13, target: "#preview-overview section:last-of-type", title: "completeTitle", body: "completeBody", placement: "top" },
] as const;
export type PreviewStage = typeof previewSteps[number]["id"];

export function progressLabel(language: OnboardingLanguage, stage: PreviewStage) {
  return previewLocales[language].progress
    .replace("{step}", String(previewSteps.find(step => step.id === stage)?.section ?? 1))
    .replace("{total}", String(Math.max(...previewSteps.map(step => step.section))));
}
