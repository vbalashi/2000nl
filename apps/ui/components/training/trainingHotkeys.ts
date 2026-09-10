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

const labels: Record<OnboardingLanguage, Record<TrainingHotkeyId, string>> = {
  nl: {
    answer: "Antwoord tonen of verbergen",
    hint: "Hint met context en voorbeeld",
    details: "Woorddetails openen",
    translation: "Vertaling tonen of verbergen",
    search: "Zoeken",
    again: "Opnieuw",
    hard: "Moeilijk",
    good: "Goed",
    easy: "Makkelijk",
    overview: "Sneltoetsenoverzicht tonen",
  },
  en: {
    answer: "Show or hide the answer",
    hint: "Show a context and example hint",
    details: "Open word details",
    translation: "Show or hide the translation",
    search: "Search",
    again: "Again",
    hard: "Hard",
    good: "Good",
    easy: "Easy",
    overview: "Show the shortcut overview",
  },
  ru: {
    answer: "Показать или скрыть ответ",
    hint: "Показать подсказку с контекстом и примером",
    details: "Открыть подробности слова",
    translation: "Показать или скрыть перевод",
    search: "Поиск",
    again: "Снова",
    hard: "Трудно",
    good: "Хорошо",
    easy: "Легко",
    overview: "Показать список горячих клавиш",
  },
};

export const getTrainingHotkeys = (language: OnboardingLanguage) =>
  hotkeys.map(({ key, id }) => ({ key, description: labels[language][id] }));

export function areTrainingHotkeysSuspended() {
  return (
    typeof document !== "undefined" &&
    document.querySelector('[data-training-hotkeys-suspended="true"]') !== null
  );
}
