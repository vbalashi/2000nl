import en from "@/locales/en.json";
import nl from "@/locales/nl.json";
import ru from "@/locales/ru.json";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";

type MessageCatalog = typeof en;

const catalogs: Record<OnboardingLanguage, MessageCatalog> = {
  en,
  nl: nl as MessageCatalog,
  ru: ru as MessageCatalog,
};

export function platformV2Message(
  language: OnboardingLanguage,
  messageKey: string,
  variables?: Record<string, string | number>,
): string {
  const value = messageKey
    .split(".")
    .reduce<unknown>((node, segment) => {
      if (!node || typeof node !== "object") return undefined;
      return (node as Record<string, unknown>)[segment];
    }, catalogs[language]);

  const template = typeof value === "string" ? value : messageKey;
  return Object.entries(variables ?? {}).reduce(
    (copy, [name, replacement]) =>
      copy.replaceAll(`{${name}}`, String(replacement)),
    template,
  );
}
