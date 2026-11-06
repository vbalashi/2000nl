import { interfaceLanguages } from "@/lib/i18n/registry";
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
const localized = interfaceLanguages.map(({code}) => code);
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
const runtimeNames = new Map<string, string[]>();
export function searchCatalogLanguages(query: string, locale?: OnboardingLanguage) {
  const term = normalizeLanguageSearch(query.trim());
  let translated:string[]|undefined;
  if(locale&&!localized.includes(locale)) {
    translated=runtimeNames.get(locale);
    if(!translated){translated=catalogLanguages.map(item=>normalizeLanguageSearch(languageDisplayName(locale,item.code,"")));runtimeNames.set(locale,translated);}
  }
  return catalogLanguages
    .filter((item,index) => item.search.includes(term)||translated?.[index].includes(term))
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
