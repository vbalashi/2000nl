import { type MessageCatalog } from "./catalogs.generated";
import { getInterfaceSnapshot, interfaceLocaleMap } from "./runtime";
import type { InterfaceLanguage } from "./registry";
export type { MessageCatalog };
export const interfaceCatalogs = interfaceLocaleMap(catalog=>catalog);
export function getInterfaceCatalog(language:InterfaceLanguage):MessageCatalog {
  const catalogs=getInterfaceSnapshot().catalogs;
  return Object.hasOwn(catalogs,language)?catalogs[language]:catalogs.en;
}
export function localizedSection<K extends keyof MessageCatalog["features"]>(section:K):Record<InterfaceLanguage,MessageCatalog["features"][K]> {
  return interfaceLocaleMap(catalog=>catalog.features[section]);
}

export function formatMessage(template: string, variables: Record<string, string | number>): string {
  return template.replace(/\{([a-zA-Z][a-zA-Z0-9]*)\}/g, (_, key: string) => String(variables[key] ?? `{${key}}`));
}

export function mapInterfaceCatalogs<T>(select: (catalog: MessageCatalog) => T): Record<InterfaceLanguage, T> {
  return interfaceLocaleMap(select);
}

export function localizedField<K extends keyof MessageCatalog["features"], P extends keyof MessageCatalog["features"][K]>(section: K, field: P): Record<InterfaceLanguage, MessageCatalog["features"][K][P]> {
  return mapInterfaceCatalogs(catalog => catalog.features[section][field]);
}

/** Every CLDR category is explicit, including Arabic zero and two. */
export function formatPluralMessage(locale: string, count: number, forms: Record<Intl.LDMLPluralRule, string>): string {
  const category = new Intl.PluralRules(locale).select(count);
  return formatMessage(forms[category], {count: new Intl.NumberFormat(locale).format(count)});
}
