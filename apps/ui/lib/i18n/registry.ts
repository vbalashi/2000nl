import registry from "@/locales/registry.json";

/** Interface locales are independent of dictionary and translation languages. */
export type InterfaceLanguage = keyof typeof registry;
export const defaultInterfaceLanguage: InterfaceLanguage = "en";
export const interfaceLanguages = Object.entries(registry).map(([code, value]) => ({
  code: code as InterfaceLanguage,
  name: value.name,
  direction: value.direction as "ltr" | "rtl",
}));

export function isInterfaceLanguage(value: unknown): value is InterfaceLanguage {
  return typeof value === "string" && Object.hasOwn(registry, value);
}

export function matchInterfaceLanguage(value: string | null | undefined): InterfaceLanguage | null {
  const code = value?.toLowerCase().replaceAll("_", "-").split("-")[0];
  return isInterfaceLanguage(code) ? code : null;
}

export function interfaceDirection(language: InterfaceLanguage): "ltr" | "rtl" {
  return registry[language].direction as "ltr" | "rtl";
}

export function interfaceFormattingLocale(language: InterfaceLanguage): string {
  const definition = registry[language];
  return "formatLocale" in definition && typeof definition.formatLocale === "string" ? definition.formatLocale : language;
}
