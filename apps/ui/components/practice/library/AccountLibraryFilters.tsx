"use client";
import {BrowseCollectionSources} from '@/components/library/sharing/BrowseCollectionSources';
import {useCollectionSelectionScope} from '@/components/library/sharing/CollectionSelectionContext';
import type {PersonalCollection} from '@/lib/collections/sharing/personalCatalogContract';

import React, { useEffect, useState } from "react";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import { getUiMessages, formatUiCount } from "@/lib/uiMessages";
import type { LibraryEntryFilters } from "@/lib/platform/librarySearchScope";
import { fetchPlatformV2LibraryGroupPage } from "@/lib/platform/platformV2LibraryClient";
import { useAccountMaterial } from "../material/AccountMaterialProvider";
import { useLibraryMaterialSelection } from "../material/useLibraryMaterialSelection";
import { LibraryFilters, type LibraryFilterDraft } from "./LibraryFilters";
import type { WordListSummary } from "@/lib/types";
import f from "./libraryFilters.module.css";
import { usePersonalLabels } from "@/components/library/organization/usePersonalLabels";
import { labelRows } from "@/lib/collections/labels/catalog";
import { organizationCopy } from "@/components/library/organization/copy";

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
  labelId?: string;
  labelsRevision?: number;
  collectionId?: string;
  collectionType?: "user" | "curated";
};

/** Draft previews read account material; only Apply changes the main search. */
export function AccountLibraryFilters({ value, query, locale, collection, collections = [], onClose, onApply }: {
  collection?: WordListSummary | null;
  collections?: WordListSummary[];
  value: LibraryFilterDraft;
  query: string;
  locale: OnboardingLanguage;
  onClose: () => void;
  onApply: (draft: LibraryFilterDraft) => void;
}) {
  const account = useAccountMaterial();
  const selectionScope=useCollectionSelectionScope();
  const [catalogChoice,setCatalogChoice]=useState<{userId:string;language:string;row:PersonalCollection}|null>(null);
  const [draft, setDraft] = useState(value);
  const labelsEnabled = process.env.NEXT_PUBLIC_COLLECTION_ORGANIZATION_ENABLED === "true";
  const labels = usePersonalLabels(labelsEnabled && Boolean(account?.userId), account?.userId ?? "");
  const labelOptions = labelRows(labels.snapshot, locale).map(({label,path}) => ({id:label.id,label:path}));
  const selectedLabel = labels.snapshot?.labels.find(label => label.id === draft.labelId);
  const labelCopy = organizationCopy(locale);
  const material = useLibraryMaterialSelection(true, draft.languageCode, locale);
  const copy = getUiMessages(locale).library;
  const materialCopy = getUiMessages(locale).materialPreferences;
  const freshChoice=catalogChoice&&catalogChoice.userId===account?.userId&&catalogChoice.language===draft.languageCode&&catalogChoice.row.id===draft.collectionId?catalogChoice.row:null;
  const selectedCollection = freshChoice?{id:freshChoice.id,name:freshChoice.name,type:'user' as const}:draft.collectionId ? collections.find(item=>item.id===draft.collectionId) : collection;
  const ready = draft.labelId ? Boolean(selectedLabel && !labels.error && !labels.loading) : draft.applyListFilter ? Boolean(selectedCollection) : Boolean(
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
    ...(draft.labelId ? {labelId:draft.labelId, labelsRevision:labels.snapshot?.revision} : {}),
    ...(draft.applyListFilter && selectedCollection ? {collectionId:selectedCollection.id,collectionType:selectedCollection.type} : {}),
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
          dictionaryIds: request.labelId || request.collectionId ? null : request.dictionaryId ? [request.dictionaryId] : null,
          ...(request.labelId ? {material:{kind:"label" as const,id:request.labelId}} : request.collectionId && request.collectionType ? { material: {
            kind: "collection" as const, id: request.collectionId, collectionType: request.collectionType,
          }} : {}),
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
    collectionLabel={collection ? collection.name : undefined}
    renderSources={process.env.NEXT_PUBLIC_COLLECTION_SHARING_ENABLED==='true'&&account?.userId?props=><BrowseCollectionSources {...props} userId={account.userId!} language={draft.languageCode} curatedIds={collections.filter(row=>row.type==='curated').map(row=>row.id)} onSelect={row=>setCatalogChoice({userId:account.userId!,language:draft.languageCode,row})}/>:undefined}
    collectionOptions={[...collections.filter(item=>item.id!==freshChoice?.id).map(item=>({id:item.id,label:item.name})),...(freshChoice?[{id:freshChoice.id,label:freshChoice.name}]:[])]}
    locale={locale}
    onDraftChange={setDraft}
    onClose={onClose}
    onApply={next=>{if(freshChoice&&next.collectionId===freshChoice.id)selectionScope?.onBrowseSelected?.(freshChoice);onApply(next);}}
    canApply={ready}
    countContent={countContent}
    sourceNotice={<>{sourceNotice}{labelsEnabled && labels.error ? <p className={f.help} role="alert">{labelCopy.error} <button type="button" className={f.reset} onClick={() => void labels.refresh()}>{labelCopy.retry}</button></p> : null}</>}
    labelOptions={labelOptions}
    languageOptions={(material?.languages ?? []).map(language => ({ id: language.code, label: language.label }))}
    sourceOptions={(material?.dictionaries ?? []).map(source => ({ id: source.id, label: source.name }))}
  />;
}
