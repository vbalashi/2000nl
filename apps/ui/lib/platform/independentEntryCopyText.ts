import type { OnboardingLanguage } from "@/lib/onboardingI18n";
const texts = {
  en: {
    action: "Copy to my dictionary",
    title: (word: string) => `Copy “${word}”?`,
    destination: "My dictionary",
    notice:
      "An independent copy will include the meanings, examples and available notes. Learning progress will not be copied.",
    confirm: "Copy",
    cancel: "Cancel",
    loading: "Loading…",
    pending: "Copying…",
    success: "Copy created",
    open: "Open copy",
    close: "Close",
    failed:
      "The copy could not be created. The source may be unavailable or contain unsupported content.",
    changed: "The source changed. Review the current version before copying.",
    refresh: "Review current version",
    uncertain:
      "The result could not be confirmed. Check again before creating another copy.",
    check: "Check result",
  },
  ru: {
    action: "Копировать в мой словарь",
    title: (word: string) => `Скопировать «${word}»?`,
    destination: "Мой словарь",
    notice:
      "Независимая копия сохранит значения, примеры и доступные заметки. Прогресс изучения не переносится.",
    confirm: "Копировать",
    cancel: "Отмена",
    loading: "Загрузка…",
    pending: "Копирование…",
    success: "Копия создана",
    open: "Открыть копию",
    close: "Закрыть",
    failed:
      "Не удалось создать копию. Возможно, источник недоступен или содержит неподдерживаемые данные.",
    changed:
      "Источник изменился. Перед копированием просмотрите актуальную версию.",
    refresh: "Обновить данные",
    uncertain:
      "Не удалось подтвердить результат. Проверьте его перед созданием другой копии.",
    check: "Проверить результат",
  },
  nl: {
    action: "Kopiëren naar mijn woordenboek",
    title: (word: string) => `‘${word}’ kopiëren?`,
    destination: "Mijn woordenboek",
    notice:
      "De onafhankelijke kopie bevat de betekenissen, voorbeelden en beschikbare notities. Leervoortgang wordt niet gekopieerd.",
    confirm: "Kopiëren",
    cancel: "Annuleren",
    loading: "Laden…",
    pending: "Kopiëren…",
    success: "Kopie gemaakt",
    open: "Kopie openen",
    close: "Sluiten",
    failed:
      "De kopie kon niet worden gemaakt. De bron is mogelijk niet beschikbaar of bevat niet-ondersteunde inhoud.",
    changed:
      "De bron is gewijzigd. Bekijk de huidige versie voordat je kopieert.",
    refresh: "Gegevens vernieuwen",
    uncertain:
      "Het resultaat kon niet worden bevestigd. Controleer het voordat je nog een kopie maakt.",
    check: "Resultaat controleren",
  },
};
export const independentEntryCopyText = (language: OnboardingLanguage) =>
  texts[language === "ru" || language === "nl" ? language : "en"];
