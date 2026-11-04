import { interfaceCatalogs, type MessageCatalog } from "./catalogs.generated";
import { interfaceLanguages, type InterfaceLanguage } from "./registry";

export { interfaceCatalogs };
export type { MessageCatalog };
export function getInterfaceCatalog(language: InterfaceLanguage): MessageCatalog {
  return interfaceCatalogs[language];
}

type LocalizedFeatures = { [K in keyof MessageCatalog["features"]]: Record<InterfaceLanguage, MessageCatalog["features"][K]> };
const features = Object.fromEntries(Object.keys(interfaceCatalogs.en.features).map(section => [section,
  Object.fromEntries(interfaceLanguages.map(({code}) => [code, interfaceCatalogs[code].features[section as keyof MessageCatalog["features"]]])),
])) as LocalizedFeatures;

/** Compatibility adapters keep their shape; all text lives in locales/. */
export function localizedSection<K extends keyof MessageCatalog["features"]>(section: K): LocalizedFeatures[K] {
  return features[section];
}

export function formatMessage(template: string, variables: Record<string, string | number>): string {
  return template.replace(/\{([a-zA-Z][a-zA-Z0-9]*)\}/g, (_, key: string) => String(variables[key] ?? `{${key}}`));
}

export function mapInterfaceCatalogs<T>(select: (catalog: MessageCatalog) => T): Record<InterfaceLanguage, T> {
  return Object.fromEntries(interfaceLanguages.map(({code}) => [code, select(getInterfaceCatalog(code))])) as Record<InterfaceLanguage, T>;
}

export function localizedField<K extends keyof MessageCatalog["features"], P extends keyof MessageCatalog["features"][K]>(section: K, field: P): Record<InterfaceLanguage, MessageCatalog["features"][K][P]> {
  return mapInterfaceCatalogs(catalog => catalog.features[section][field]);
}

/** Every CLDR category is explicit, including Arabic zero and two. */
export function formatPluralMessage(locale: string, count: number, forms: Record<Intl.LDMLPluralRule, string>): string {
  const category = new Intl.PluralRules(locale).select(count);
  return formatMessage(forms[category], {count: new Intl.NumberFormat(locale).format(count)});
}
