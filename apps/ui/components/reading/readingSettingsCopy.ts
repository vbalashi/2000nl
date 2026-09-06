import type { OnboardingLanguage } from "@/lib/onboardingI18n";

export const readingSettingsCopy = {
  en: {
    title: "Reading text", description: "Separate sizes for phone and computer. Buttons and navigation stay the same size.",
    phone: "Phone text size", desktop: "Computer / tablet text size", normal: "Normal", large: "Large", largest: "Largest",
    device: "Profile for this browser", phoneDevice: "Phone", desktopDevice: "Computer / tablet",
    deviceHint: "Resizing the window does not switch profiles. This choice stays in this browser; the two text sizes are saved to your account.",
    temporary: "This browser cannot store the device choice. It applies until you leave this page.",
    loading: "Loading reading settings…", loadError: "Reading settings could not be loaded.",
    saving: "Saving…", saved: "Saved", saveError: "Not saved. The preview is temporary; retry to keep this size.", retry: "Retry", preview: "Preview for this device",
  },
  nl: {
    title: "Leestekst", description: "Aparte groottes voor telefoon en computer. Knoppen en navigatie blijven even groot.",
    phone: "Tekstgrootte op telefoon", desktop: "Tekstgrootte op computer / tablet", normal: "Normaal", large: "Groot", largest: "Extra groot",
    device: "Profiel voor deze browser", phoneDevice: "Telefoon", desktopDevice: "Computer / tablet",
    deviceHint: "Een smaller venster verandert het profiel niet. Deze keuze blijft in deze browser; beide tekstgroottes worden in je account opgeslagen.",
    temporary: "Deze browser kan de apparaatkeuze niet bewaren. De keuze geldt totdat je deze pagina verlaat.",
    loading: "Leesinstellingen laden…", loadError: "Leesinstellingen konden niet worden geladen.",
    saving: "Opslaan…", saved: "Opgeslagen", saveError: "Niet opgeslagen. Het voorbeeld is tijdelijk; probeer opnieuw om deze grootte te bewaren.", retry: "Opnieuw proberen", preview: "Voorbeeld voor dit apparaat",
  },
  ru: {
    title: "Размер текста для чтения", description: "Отдельные размеры для телефона и компьютера. Кнопки и навигация не увеличиваются.",
    phone: "Размер текста на телефоне", desktop: "Размер текста на компьютере / планшете", normal: "Обычный", large: "Крупный", largest: "Очень крупный",
    device: "Профиль для этого браузера", phoneDevice: "Телефон", desktopDevice: "Компьютер / планшет",
    deviceHint: "Сужение окна не переключает профиль. Этот выбор хранится в браузере, а оба размера текста — в аккаунте.",
    temporary: "Браузер не может сохранить выбор устройства. Он действует до ухода с этой страницы.",
    loading: "Загружаем настройки текста…", loadError: "Не удалось загрузить настройки текста.",
    saving: "Сохраняем…", saved: "Сохранено", saveError: "Не сохранено. Предпросмотр временный — повторите сохранение, чтобы оставить этот размер.", retry: "Повторить", preview: "Пример для этого устройства",
  },
} satisfies Record<OnboardingLanguage, Record<string, string>>;
