import type { OnboardingLanguage } from "@/lib/onboardingI18n";

type TrainingHotkeyId =
  | "answer"
  | "hint"
  | "details"
  | "translation"
  | "search"
  | "recent"
  | "again"
  | "hard"
  | "good"
  | "easy"
  | "freeze"
  | "hide"
  | "overview";

const hotkeys: Array<{ key: string; id: TrainingHotkeyId }> = [
  { key: "Space", id: "answer" },
  { key: "I", id: "hint" },
  { key: "Shift+I", id: "details" },
  { key: "T", id: "translation" },
  { key: "S", id: "search" },
  { key: "R", id: "recent" },
  { key: "H", id: "again" },
  { key: "J", id: "hard" },
  { key: "K", id: "good" },
  { key: "L", id: "easy" },
  { key: "F", id: "freeze" },
  { key: "X", id: "hide" },
  { key: "?", id: "overview" },
];

const labels: Record<
  OnboardingLanguage,
  Record<TrainingHotkeyId, string>
> = {
  nl: {
    answer: "Antwoord tonen of verbergen",
    hint: "Hint met context en voorbeeld",
    details: "Woorddetails openen",
    translation: "Vertaling tonen of verbergen",
    search: "Zoeken",
    recent: "Recente woorden openen of sluiten",
    again: "Opnieuw",
    hard: "Moeilijk",
    good: "Goed",
    easy: "Makkelijk",
    freeze: "Bevriezen tot morgen",
    hide: "Niet meer tonen",
    overview: "Sneltoetsenoverzicht tonen",
  },
  en: {
    answer: "Show or hide the answer",
    hint: "Show a context and example hint",
    details: "Open word details",
    translation: "Show or hide the translation",
    search: "Search",
    recent: "Open or close recent words",
    again: "Again",
    hard: "Hard",
    good: "Good",
    easy: "Easy",
    freeze: "Freeze until tomorrow",
    hide: "Do not show again",
    overview: "Show the shortcut overview",
  },
  ru: {
    answer: "Показать или скрыть ответ",
    hint: "Показать подсказку с контекстом и примером",
    details: "Открыть подробности слова",
    translation: "Показать или скрыть перевод",
    search: "Поиск",
    recent: "Открыть или закрыть недавние слова",
    again: "Снова",
    hard: "Трудно",
    good: "Хорошо",
    easy: "Легко",
    freeze: "Отложить до завтра",
    hide: "Больше не показывать",
    overview: "Показать список горячих клавиш",
  },
};

export const getTrainingHotkeys = (language: OnboardingLanguage) =>
  hotkeys.map(({ key, id }) => ({ key, description: labels[language][id] }));
