import type { OnboardingLanguage } from "@/lib/onboardingI18n";

const copy = {
  en: {
    action: "Archive entry", confirm: "Archive", title: (word: string) => `Archive entry “${word}”?`,
    notice: "The entry will disappear from the dictionary, collections and new training sessions.",
    history: "Your learning history will be kept. You can finish a card that is already displayed.",
    cancel: "Cancel", pending: "Archiving…", success: "Entry archived",
    failed: "The entry could not be archived. Please try again.",
    uncertain: "We could not confirm whether the entry was archived. Check your connection and try again; repeating this action is safe.",
  },
  ru: {
    action: "Архивировать статью", confirm: "Архивировать", title: (word: string) => `Архивировать статью «${word}»?`,
    notice: "Статья исчезнет из словаря, коллекций и новых тренировок.",
    history: "Учебная история сохранится. Уже показанную карточку можно закончить.",
    cancel: "Отмена", pending: "Архивирование…", success: "Статья архивирована",
    failed: "Не удалось архивировать статью. Попробуйте ещё раз.",
    uncertain: "Не удалось подтвердить, архивирована ли статья. Проверьте соединение и попробуйте ещё раз: повтор этого действия безопасен.",
  },
  nl: {
    action: "Artikel archiveren", confirm: "Archiveren", title: (word: string) => `Artikel ‘${word}’ archiveren?`,
    notice: "Het artikel verdwijnt uit het woordenboek, collecties en nieuwe oefensessies.",
    history: "Je leergeschiedenis blijft bewaard. Een kaart die al wordt getoond kun je afmaken.",
    cancel: "Annuleren", pending: "Archiveren…", success: "Artikel gearchiveerd",
    failed: "Het artikel kon niet worden gearchiveerd. Probeer het opnieuw.",
    uncertain: "We konden niet bevestigen of het artikel is gearchiveerd. Controleer je verbinding en probeer het opnieuw; deze actie herhalen is veilig.",
  },
};
export function authorEntryArchiveCopy(language: OnboardingLanguage) {
  return copy[language === "ru" || language === "nl" ? language : "en"];
}
