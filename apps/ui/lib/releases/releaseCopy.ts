import type { OnboardingLanguage } from "@/lib/onboardingI18n";
const en = {
  updates: "Updates",
  available: "A new version is ready",
  summary: "Update the app to get the latest improvements.",
  update: "Update app",
  later: "Later",
  more: "Read more",
  check: "Check for updates",
  checking: "Checking for updates…",
  updating: "Updating…",
  current: "Your app is up to date",
  unknown: "Could not check for updates. Check your connection and try again.",
  failed: "The update did not complete. Please try again.",
  worker:
    "An older offline installation was detected. Close and reopen the app, then try again.",
  deferred: "Finish your training session before updating.",
  installed: "Installed version",
  latest: "Available version",
  released: "Released",
  built: "Built",
  unread: "Updates available",
  dev: "Development build — release checks are unavailable.",
  updated: "App updated successfully",
};
const ru: typeof en = {
  updates: "Обновления",
  available: "Доступна новая версия",
  summary: "Обновите приложение, чтобы получить последние улучшения.",
  update: "Обновить приложение",
  later: "Позже",
  more: "Подробнее",
  check: "Проверить обновления",
  checking: "Проверяем обновления…",
  updating: "Обновляем…",
  current: "У вас актуальная версия",
  unknown:
    "Не удалось проверить обновления. Проверьте подключение и попробуйте снова.",
  failed: "Обновление не завершилось. Попробуйте ещё раз.",
  worker:
    "Обнаружена прежняя офлайн-установка. Закройте и снова откройте приложение, затем повторите попытку.",
  deferred: "Завершите тренировку перед обновлением.",
  installed: "Установленная версия",
  latest: "Доступная версия",
  released: "Дата выпуска",
  built: "Дата сборки",
  unread: "Есть обновления",
  dev: "Тестовая сборка — проверка релизов недоступна.",
  updated: "Приложение обновлено",
};
const nl: typeof en = {
  updates: "Updates",
  available: "Er staat een nieuwe versie klaar",
  summary: "Werk de app bij voor de nieuwste verbeteringen.",
  update: "App bijwerken",
  later: "Later",
  more: "Meer lezen",
  check: "Controleren op updates",
  checking: "Updates controleren…",
  updating: "Bijwerken…",
  current: "Je app is up-to-date",
  unknown:
    "Updates controleren is niet gelukt. Controleer je verbinding en probeer opnieuw.",
  failed: "Bijwerken is niet gelukt. Probeer opnieuw.",
  worker:
    "Er is een oudere offline-installatie gevonden. Sluit de app, open deze opnieuw en probeer het nog eens.",
  deferred: "Rond je training af voordat je de app bijwerkt.",
  installed: "Geïnstalleerde versie",
  latest: "Beschikbare versie",
  released: "Uitgebracht",
  built: "Gebouwd",
  unread: "Updates beschikbaar",
  dev: "Ontwikkelversie — releasecontrole niet beschikbaar.",
  updated: "App bijgewerkt",
};
export function releaseCopy(language: OnboardingLanguage) {
  return { en, ru, nl }[language];
}
