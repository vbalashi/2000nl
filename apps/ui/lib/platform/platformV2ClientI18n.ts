import { dictionarySourceProfile } from "@/lib/dictionary/sourceProfile";
import { getInterfaceCatalog, formatMessage } from "@/lib/i18n/catalog";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";

export function platformV2Message(
  language: OnboardingLanguage,
  messageKey: string,
  variables?: Record<string, string | number>,
): string {
  const profile = dictionarySourceProfile();
  const value = messageKey === `dictionary.${profile.catalogKey}`
    ? profile.localizedName
    : messageKey.split(".").reduce<unknown>((node, segment) => {
    if (!node || typeof node !== "object") return undefined;
    return (node as Record<string, unknown>)[segment];
  }, getInterfaceCatalog(language));
  const template = typeof value === "string" ? value : messageKey;
  return formatMessage(template, variables ?? {});
}
