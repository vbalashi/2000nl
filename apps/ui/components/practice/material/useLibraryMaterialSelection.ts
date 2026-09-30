"use client";
import { useAccountMaterial } from "./AccountMaterialProvider";
import { useMaterialDictionaryCatalog } from "./useMaterialDictionaryCatalog";
import { materialLearningLanguages } from "@/lib/training/material/selection";
import { languageDisplayName } from "@/lib/languages/languageDisplayName";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
/** Search controls use enabled material; exact articles/owned collections remain readable. */
export function useLibraryMaterialSelection(
  open: boolean,
  languageCode: string,
  language: OnboardingLanguage,
) {
  const account = useAccountMaterial();
  const inventory = useMaterialDictionaryCatalog(
    account?.userId ?? "",
    open && account ? [languageCode] : [],
  );
  if (!account) return null;
  const configured = account.snapshot
    ? materialLearningLanguages(account.snapshot.document, account.catalog)
    : [];
  const languages = configured
    .filter((item) => !item.paused)
    .map((item) => ({
      code: item.code,
      label: languageDisplayName(language, item.code),
    }));
  const currentLanguageAllowed = languages.some(
    (item) => item.code === languageCode,
  );
  return {
    languages,
    currentLanguageAllowed,
    dictionaries: currentLanguageAllowed
      ? inventory.sources.filter(
          (item) =>
            item.kind === "user" ||
            !account.snapshot?.document.disabledDictionaryIds.includes(item.id),
        )
      : [],
    status: account.status !== "ready" ? account.status : inventory.status,
    reload: () => {
      account.reload();
      inventory.reload();
    },
  };
}
