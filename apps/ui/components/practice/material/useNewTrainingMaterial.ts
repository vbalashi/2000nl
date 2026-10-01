"use client";
import { useAccountMaterial } from "./AccountMaterialProvider";
import { materialLearningLanguages } from "@/lib/training/material/selection";
import { languageDisplayName } from "@/lib/languages/languageDisplayName";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import type { TrainingSetupOption } from "@/lib/training/setups/availability";

/** New-run selection only. Readable catalogs and existing-run resume stay intact. */
export function useNewTrainingMaterial(input: {
  languageCode: string | undefined;
  interfaceLanguage: OnboardingLanguage;
  languages: TrainingSetupOption[];
  dictionaries: TrainingSetupOption[];
  lists: TrainingSetupOption[];
}) {
  const account = useAccountMaterial();
  if (!account)
    return {
      languages: input.languages,
      dictionaries: input.dictionaries,
      lists: input.lists,
      status: "ready" as const,
      currentLanguageAllowed: true,
      reload: undefined,
    };
  const document = account.snapshot?.document;
  const languages = document
    ? materialLearningLanguages(document, account.catalog)
    : [];
  const active = languages.filter((item) => !item.paused);
  const currentLanguageAllowed = active.some(
    (item) => item.code === input.languageCode,
  );
  return {
    languages: active.map((item) => ({
      value: item.code,
      label: languageDisplayName(input.interfaceLanguage, item.code),
    })),
    dictionaries:
      currentLanguageAllowed && document
        ? input.dictionaries.filter(
            (item) => !document.disabledDictionaryIds.includes(item.value),
          )
        : [],
    lists: currentLanguageAllowed ? input.lists : [],
    status: account.status,
    currentLanguageAllowed,
    reload: account.reload,
  };
}
