"use client";

import React, { useEffect, useState } from "react";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import { getUiMessages, formatUiCount } from "@/lib/uiMessages";
import type { LibraryEntryFilters } from "@/lib/platform/librarySearchScope";
import { fetchPlatformV2LibraryGroupPage } from "@/lib/platform/platformV2LibraryClient";
import { useAccountMaterial } from "../material/AccountMaterialProvider";
import { useLibraryMaterialSelection } from "../material/useLibraryMaterialSelection";
import { LibraryFilters, type LibraryFilterDraft } from "./LibraryFilters";
import f from "./libraryFilters.module.css";

type Preview = {
  key: string;
  status: "loading" | "ready" | "error";
  total?: number;
};
type PreviewScope = {
  query: string;
  languageCode: string;
  dictionaryId: string | null;
  filters: LibraryEntryFilters;
  available: boolean;
  userId?: string;
  revision?: number;
};

/** Draft previews read account material; only Apply changes the main search. */
export function AccountLibraryFilters({ value, query, locale, onClose, onApply }: {
  value: LibraryFilterDraft;
  query: string;
  locale: OnboardingLanguage;
  onClose: () => void;
  onApply: (draft: LibraryFilterDraft) => void;
}) {
  const account = useAccountMaterial();
  const [draft, setDraft] = useState(value);
  const material = useLibraryMaterialSelection(true, draft.languageCode, locale);
  const copy = getUiMessages(locale).library;
  const materialCopy = getUiMessages(locale).materialPreferences;
  const ready = Boolean(
    material?.status === "ready" && material.currentLanguageAllowed &&
    (!draft.dictionaryId || material.dictionaries.some(source => source.id === draft.dictionaryId)),
  );
  // Canonical identity also invalidates previews when account material changes.
  const scope: PreviewScope = {
    query: query.trim(),
    languageCode: draft.languageCode,
    dictionaryId: draft.dictionaryId,
    filters: { parts: [...draft.parts].sort(), article: draft.article },
    available: ready,
    userId: account?.userId,
    revision: account?.snapshot?.revision,
  };
  const key = JSON.stringify(scope);
  const [attempt, setAttempt] = useState(0);
  const [preview, setPreview] = useState<Preview>({ key: "", status: "loading" });

  useEffect(() => {
    const request: PreviewScope = JSON.parse(key);
    if (!request.available) return;
    const controller = new AbortController();
    setPreview({ key, status: "loading" });
    const timer = window.setTimeout(() => {
      void fetchPlatformV2LibraryGroupPage({
        query: request.query,
        cardTypeId: "word-to-definition",
        contentLanguageCode: request.languageCode,
        translationTargetLanguageCode: null,
        signal: controller.signal,
        libraryScope: {
          dictionaryIds: request.dictionaryId ? [request.dictionaryId] : null,
          filters: request.filters,
        },
      }).then(page => {
        if (!controller.signal.aborted) {
          setPreview({ key, status: "ready", total: page.librarySearch!.totalGroups });
        }
      }).catch(() => {
        if (!controller.signal.aborted) setPreview({ key, status: "error" });
      });
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [key, attempt]);

  const status = preview.key === key ? preview.status : "loading";
  const sourceNotice = material?.status !== "ready" ? (
    <p className={f.help} role={material?.status === "error" ? "alert" : "status"}>
      {material?.status === "error" ? materialCopy.catalogError : materialCopy.loading}
      {material?.status === "error" && (
        <button type="button" className={f.reset} onClick={() => material.reload()}>
          {materialCopy.retry}
        </button>
      )}
    </p>
  ) : null;

  let countContent: React.ReactNode = materialCopy.loading;
  if (!ready) {
    if (material?.status === "error") countContent = materialCopy.catalogError;
    else if (material?.status === "ready") {
      countContent = material.currentLanguageAllowed ? copy.noSources : copy.noLanguages;
    }
  } else if (status === "ready") {
    countContent = formatUiCount(locale, preview.total!, copy, "matchingGroup");
  } else if (status === "error") {
    countContent = <>
      {copy.searchError}{" "}
      <button type="button" className={f.reset} onClick={() => setAttempt(current => current + 1)}>
        {copy.retry}
      </button>
    </>;
  }

  return <LibraryFilters
    value={value}
    locale={locale}
    onDraftChange={setDraft}
    onClose={onClose}
    onApply={onApply}
    canApply={ready}
    countContent={countContent}
    sourceNotice={sourceNotice}
    languageOptions={(material?.languages ?? []).map(language => ({ id: language.code, label: language.label }))}
    sourceOptions={(material?.dictionaries ?? []).map(source => ({ id: source.id, label: source.name }))}
  />;
}
