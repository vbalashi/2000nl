import { isOnboardingLanguage, type OnboardingLanguage } from "@/lib/onboardingI18n";

export const PREVIEW_PREFERENCES_KEY = "2000nl:onboarding-preview:preferences:v1";
export const previewTranslationLanguages = ["en", "nl", "ru", "de", "fr", "es"] as const;
export type PreviewTranslationLanguage = typeof previewTranslationLanguages[number] | "off";
export type PreviewPreferences = { version: 1; interfaceLanguage: OnboardingLanguage; translationLanguage: PreviewTranslationLanguage };
type Storage = Pick<globalThis.Storage, "getItem" | "setItem">;

export function resolvePreviewPreferences(value: unknown, savedInterfaceLanguage?: unknown): PreviewPreferences {
  const item = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const valid = item.version === 1;
  const interfaceLanguage = valid && isOnboardingLanguage(item.interfaceLanguage) ? item.interfaceLanguage
    : isOnboardingLanguage(savedInterfaceLanguage) ? savedInterfaceLanguage : "en";
  const translationLanguage = valid && (item.translationLanguage === "off" || previewTranslationLanguages.some(code => code === item.translationLanguage))
    ? item.translationLanguage as PreviewTranslationLanguage : "en";
  return { version: 1, interfaceLanguage, translationLanguage };
}

export function readPreviewPreferences(storage: Storage, savedInterfaceLanguage?: unknown): PreviewPreferences {
  try { return resolvePreviewPreferences(JSON.parse(storage.getItem(PREVIEW_PREFERENCES_KEY) ?? "null"), savedInterfaceLanguage); }
  catch { return resolvePreviewPreferences(null, savedInterfaceLanguage); }
}

export function savePreviewPreferences(storage: Storage, preferences: PreviewPreferences): boolean {
  try { storage.setItem(PREVIEW_PREFERENCES_KEY, JSON.stringify(preferences)); return true; }
  catch { return false; }
}
