import type { AvailableLearningLanguage } from "@/lib/types";
import type { MaterialPreferences } from "./model";
/** The implicit catalog is resolved only for editing; reads never persist it. */
export function materialLearningLanguages(
  document: MaterialPreferences,
  catalog: AvailableLearningLanguage[],
) {
  return document.learningLanguages.length
    ? document.learningLanguages.map((item) => ({ ...item }))
    : catalog.map((item) => ({ code: item.code, paused: false }));
}
export function addMaterialLanguage(
  document: MaterialPreferences,
  catalog: AvailableLearningLanguage[],
  code: string,
): MaterialPreferences {
  const languages = materialLearningLanguages(document, catalog);
  return {
    ...document,
    learningLanguages: languages.some((item) => item.code === code)
      ? languages.map((item) =>
          item.code === code ? { ...item, paused: false } : item,
        )
      : [...languages, { code, paused: false }],
  };
}
export function toggleMaterialLanguage(
  document: MaterialPreferences,
  catalog: AvailableLearningLanguage[],
  code: string,
): MaterialPreferences | null {
  const languages = materialLearningLanguages(document, catalog);
  const item = languages.find((item) => item.code === code);
  if (
    !item ||
    (!item.paused && languages.filter((item) => !item.paused).length <= 1)
  )
    return null;
  return {
    ...document,
    learningLanguages: languages.map((item) =>
      item.code === code ? { ...item, paused: !item.paused } : item,
    ),
  };
}
export function moveMaterialLanguageUp(
  document: MaterialPreferences,
  catalog: AvailableLearningLanguage[],
  code: string,
): MaterialPreferences | null {
  const languages = materialLearningLanguages(document, catalog);
  const index = languages.findIndex((item) => item.code === code);
  if (index <= 0) return null;
  [languages[index - 1], languages[index]] = [
    languages[index],
    languages[index - 1],
  ];
  return { ...document, learningLanguages: languages };
}
export function toggleMaterialDictionary(
  document: MaterialPreferences,
  id: string,
): MaterialPreferences {
  return {
    ...document,
    disabledDictionaryIds: document.disabledDictionaryIds.includes(id)
      ? document.disabledDictionaryIds.filter((item) => item !== id)
      : [...document.disabledDictionaryIds, id],
  };
}
