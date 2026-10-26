import catalog from "./languageCatalog.json";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import { languageDisplayName } from "./languageDisplayName";
export type CatalogLanguage = {
  code: string;
  name: string;
  codes: string[];
  native: string;
  search: string;
};
const nativeAliases: Record<string, string> = {
  krc: "къарачай тил малкъар тил карачаевский балкарский",
  zh: "中文 汉语 漢語 普通话",
  cmn: "中文 汉语 普通话",
  ar: "العربية",
  arb: "العربية",
  fa: "فارسی پارسی",
  pes: "فارسی",
};
export const normalizeLanguageSearch = (text: string) =>
  text.normalize("NFKD").replace(/\p{M}/gu, "").toLocaleLowerCase();
const localized = ["en", "nl", "ru"] as const;
function nativeName(code: string) {
  try {
    return (
      new Intl.DisplayNames([code], { type: "language", fallback: "none" }).of(
        code,
      ) ?? ""
    );
  } catch {
    return "";
  }
}
export const catalogLanguages: CatalogLanguage[] = catalog.map((item) => {
  const native = nativeName(item.code);
  return {
    ...item,
    native,
    search: normalizeLanguageSearch(
      `${item.name} ${item.codes.join(" ")} ${localized.map((locale) => languageDisplayName(locale, item.code, "")).join(" ")} ${native} ${nativeAliases[item.code] ?? ""}`,
    ),
  };
});
export function searchCatalogLanguages(query: string) {
  const term = normalizeLanguageSearch(query.trim());
  return catalogLanguages
    .filter((item) => item.search.includes(term))
    .sort(
      (a, b) => Number(b.codes.includes(term)) - Number(a.codes.includes(term)),
    );
}
export function catalogLanguageLabel(
  locale: OnboardingLanguage,
  item: CatalogLanguage,
) {
  return languageDisplayName(locale, item.code, item.name);
}
const byName = new Map(catalogLanguages.map((item) => [item.name, item.code]));
byName.set("Русский", "ru");
export const catalogCodeFromName = (name: string) => byName.get(name);
