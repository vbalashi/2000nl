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
  { id: "audio", section: 4, target: "#preview-card", title: "audioTitle", body: "audioBody", placement: "bottom-end" },
  { id: "details-open", section: 4, target: "#preview-card", title: "detailsTitle", body: "detailsBody", placement: "bottom-end" },
  { id: "details-return", section: 4, target: "#preview-details dialog", title: "returnTitle", body: "returnBody", placement: "bottom-end" },
  { id: "answer", section: 4, target: "#preview-card button", title: "learnTitle", body: "learnBody", placement: "top-end" },
  { id: "exit", section: 4, target: "#preview-session-close", title: "exitTitle", body: "exitBody", placement: "bottom-end" },
  { id: "basic-complete", section: 4, target: "#preview-overview", title: "basicDoneTitle", body: "basicDoneBody", placement: "bottom" },
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
  { id: "go-settings", section: 13, target: "header button", title: "settingsOpenTitle", body: "settingsOpenBody", placement: "bottom-end" },
  { id: "go-settings-languages", section: 13, target: "header button", title: "settingsOpenTitle", body: "settingsOpenBody", placement: "bottom-end" },
  { id: "appearance-section", section: 13, target: "#preview-settings", title: "appearanceSectionTitle", body: "appearanceSectionBody", placement: "bottom" },
  { id: "appearance-choice", section: 13, target: "#preview-settings", title: "appearanceChoiceTitle", body: "appearanceChoiceBody", placement: "bottom" },
  { id: "appearance-done", section: 13, target: "#preview-settings", title: "appearanceDoneTitle", body: "appearanceDoneBody", placement: "bottom" },
  { id: "languages-section", section: 13, target: "#preview-settings", title: "languagesSectionTitle", body: "languagesSectionBody", placement: "bottom" },
  { id: "languages-choice", section: 13, target: "#preview-settings", title: "languagesChoiceTitle", body: "languagesChoiceBody", placement: "bottom" },
  { id: "theme-shortcut", section: 13, target: "[data-tour=theme-switch]", title: "themeShortcutTitle", body: "themeShortcutBody", placement: "bottom-end" },
  { id: "theme-shortcut-done", section: 13, target: "[data-tour=theme-switch]", title: "themeShortcutDoneTitle", body: "themeShortcutDoneBody", placement: "bottom-end" },
  { id: "go-incoming-library", section: 13, target: "nav button", title: "libraryTitle", body: "incomingLibraryBody", placement: "top" },
  { id: "extra-incoming", section: 13, target: "#preview-library-tabs", title: "incomingSharedTitle", body: "incomingSharedBody", placement: "bottom" },
  { id: "incoming-received", section: 13, target: "#preview-incoming", title: "incomingReceivedTitle", body: "incomingReceivedBody", placement: "bottom" },
  { id: "incoming-add", section: 13, target: "#preview-incoming", title: "incomingAddTitle", body: "incomingAddBody", placement: "bottom" },
  { id: "incoming-input", section: 13, target: "#preview-incoming", title: "incomingInputTitle", body: "incomingInputBody", placement: "bottom" },
  { id: "incoming-preview", section: 13, target: "#preview-incoming", title: "incomingPreviewTitle", body: "incomingPreviewBody", placement: "bottom" },
  { id: "incoming-accepted", section: 13, target: "#preview-incoming", title: "incomingAcceptedTitle", body: "incomingAcceptedBody", placement: "bottom" },
  { id: "incoming-list", section: 13, target: "#preview-incoming", title: "incomingListTitle", body: "incomingListBody", placement: "bottom" },
  { id: "incoming-words", section: 13, target: "#preview-meaning", title: "incomingWordsTitle", body: "incomingWordsBody", placement: "top" },
  { id: "sharing-copy-link", section: 13, target: "#preview-sharing-dialog", title: "sharingCopyLinkTitle", body: "sharingCopyLinkBody", placement: "top" },
  { id: "sharing-copy-code", section: 13, target: "#preview-sharing-dialog", title: "sharingCopyCodeTitle", body: "sharingCopyCodeBody", placement: "top" },
  { id: "sharing-sent", section: 13, target: "#preview-sharing-dialog", title: "sharingSentTitle", body: "sharingSentBody", placement: "top" },
  { id: "go-sharing-library", section: 13, target: "nav button", title: "libraryTitle", body: "libraryBody", placement: "top" },
  { id: "sharing-more", section: 13, target: "#preview-collection-catalog button[aria-label]", title: "sharingMoreTitle", body: "sharingMoreBody", placement: "bottom" },
  { id: "sharing-menu", section: 13, target: "[role=menu]", title: "sharingMenuTitle", body: "sharingMenuBody", placement: "bottom" },
  { id: "sharing-create", section: 13, target: "#preview-sharing-dialog dialog", title: "sharingCreateTitle", body: "sharingCreateBody", placement: "top" },
  { id: "sharing-confirm", section: 13, target: "#preview-sharing-dialog dialog", title: "sharingConfirmTitle", body: "sharingConfirmBody", placement: "top" },
  { id: "sharing-link", section: 13, target: "#preview-sharing-dialog dialog", title: "sharingLinkTitle", body: "sharingLinkBody", placement: "top" },
  { id: "sharing-close-confirm", section: 13, target: "#preview-sharing-dialog dialog", title: "sharingCloseTitle", body: "sharingCloseBody", placement: "top" },
  { id: "sharing-done", section: 13, target: "#preview-sharing-dialog dialog", title: "sharingDoneTitle", body: "sharingDoneBody", placement: "top" },
  { id: "extra-stats-view", section: 13, target: "#preview-progress dialog", title: "statsViewTitle", body: "statsViewBody", placement: "bottom" },
  { id: "extra-stats", section: 13, target: "#preview-meaning", title: "statsTitle", body: "statsBody", placement: "bottom-end" },
  { id: "extra-sharing", section: 13, target: "#preview-library-tabs", title: "sharingTabTitle", body: "sharingTabBody", placement: "bottom" },
  { id: "extra-known", section: 13, target: "#preview-card", title: "knownTitle", body: "knownBody", placement: "top-end" },
  { id: "extra-report", section: 13, target: "#preview-report-action", title: "reportTitle", body: "reportBody", placement: "top-start" },
  { id: "extras-complete", section: 13, target: "#preview-session-close", title: "extrasDoneTitle", body: "extrasDoneBody", placement: "bottom-end" },
] as const;
export type PreviewStage = typeof previewSteps[number]["id"];

export function progressLabel(language: OnboardingLanguage, stage: PreviewStage) {
  if (stage.startsWith("extra") || !["interface", "translation", "overview", "card", "answer", "exit", "basic-complete"].includes(stage)) return previewLocales[language].extrasProgress;
  return previewLocales[language].progress
    .replace("{step}", String(previewSteps.find(step => step.id === stage)?.section ?? 1))
    .replace("{total}", "4");
}
