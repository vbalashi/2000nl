"use client";
import { useEffect, useState } from "react";
import { fetchEnabledCuratedTrainingListIds } from "@/lib/training/material/curatedTraining";
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
  const document = account?.snapshot?.document;
  const needsCuratedCheck = Boolean(account && document?.disabledDictionaryIds.length && input.languageCode && input.lists.some(item => item.value.startsWith("curated:")));
  const requestKey = needsCuratedCheck ? JSON.stringify([account?.userId, account?.snapshot?.revision, input.languageCode, document?.disabledDictionaryIds]) : "";
  const [curated, setCurated] = useState<{key: string; ids: string[]; status: "ready" | "error"}>();
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!requestKey || !input.languageCode) return;
    let current = true;
    void fetchEnabledCuratedTrainingListIds(input.languageCode).then(ids => {
      if (current) setCurated({key: requestKey, ids, status: "ready"});
    }).catch(() => { if (current) setCurated({key: requestKey, ids: [], status: "error"}); });
    return () => { current = false; };
  }, [requestKey, input.languageCode, attempt]);
  if (!account)
    return {
      languages: input.languages,
      dictionaries: input.dictionaries,
      lists: input.lists,
      status: "ready" as const,
      currentLanguageAllowed: true,
      reload: undefined,
    };
  const curatedStatus = !needsCuratedCheck ? "ready" : curated?.key === requestKey ? curated.status : "loading";
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
    lists: currentLanguageAllowed ? input.lists.filter(item =>
      !item.value.startsWith("curated:") || !needsCuratedCheck ||
      (curatedStatus === "ready" && curated?.ids.includes(item.value.slice(8)))
    ) : [],
    status: account.status !== "ready" ? account.status : curatedStatus,
    currentLanguageAllowed,
    reload: () => { setCurated(undefined); setAttempt(value => value + 1); account.reload(); },
  };
}
