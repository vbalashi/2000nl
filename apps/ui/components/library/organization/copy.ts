import { localizedSection } from "@/lib/i18n/catalog";
import type { InterfaceLanguage } from "@/lib/i18n/registry";
export const organizationCopy = (locale: InterfaceLanguage) => localizedSection("libraryOrganization")[locale];
