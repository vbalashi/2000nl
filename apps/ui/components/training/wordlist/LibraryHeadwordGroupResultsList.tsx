"use client";

import React from "react";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import {
  LibraryResultList,
  LibraryResultRow,
} from "@/components/practice/library/LibraryResultList";
import {Check} from "lucide-react";
import bulk from "./wordsBulk.module.css";
import { platformV2Message } from "@/lib/platform/platformV2ClientI18n";
import theme from "@/components/practice/ui/practiceTheme.module.css";
import type { LibraryHeadwordGroupResult } from "./libraryHeadwordGroupResults";

type Props = {
  interfaceLanguage?: OnboardingLanguage;
  appearance?: "plain" | "framed";
  results: LibraryHeadwordGroupResult[];
  selectedHeadwordGroupId: string | null;
  onSelect: (result: LibraryHeadwordGroupResult) => void;
  bulkSelected?: ReadonlySet<string>;
  bulkLocked?: boolean;
  bulkAll?: boolean;
  bulkExcludedCount?: number;
  onBulkSelect?: (id:string, selected:boolean) => void;
};

function coreVocabularyLabel(
  result: LibraryHeadwordGroupResult,
  language: OnboardingLanguage,
) {
  const indicator = result.group.indicators.find(
    (item) => item.indicatorId === "core-vocabulary",
  );
  return indicator ? platformV2Message(language, indicator.messageKey) : null;
}

export function LibraryHeadwordGroupResultsList({
  results,
  appearance,
  interfaceLanguage = "nl",
  selectedHeadwordGroupId,
  onSelect, bulkSelected, bulkLocked, bulkAll, bulkExcludedCount, onBulkSelect,
}: Props) {
  return (
      <div className={theme.theme} data-colour-mode="app">
        <LibraryResultList
          language={interfaceLanguage}
          appearance={appearance}
          hasDetail={Boolean(selectedHeadwordGroupId)}
          showSource={
            new Set(
              results.map((result) => result.group.dictionary.dictionaryId),
            ).size > 1
          }
        >
          {results.map((result) => (
            <div
              key={result.headwordGroupId}
              data-testid="library-headword-group-row"
              className={onBulkSelect ? bulk.row : undefined}
            >
              <LibraryResultRow
                testId={`library-headword-group-${result.headwordGroupId}`}
                headword={result.headword}
                article={result.group.header.article}
                parts={result.partOfSpeechLabels}
                source={result.dictionaryLabel}
                core={coreVocabularyLabel(result, interfaceLanguage)}
                meaningCount={result.meaningCount}
                referenceCount={result.referenceCount}
                homographNumber={result.homographNumber}
                contentLanguage={result.group.dictionary.sourceLanguageCode}
                language={interfaceLanguage}
                selected={onBulkSelect ? Boolean(bulkSelected?.has(result.headwordGroupId)) : result.headwordGroupId === selectedHeadwordGroupId}
                disabled={Boolean(onBulkSelect && (bulkLocked || result.meaningCount===0 || (bulkAll ? Boolean(bulkSelected?.has(result.headwordGroupId)) && (bulkExcludedCount ?? 0)>=200 : !bulkSelected?.has(result.headwordGroupId) && (bulkSelected?.size ?? 0)>=200)))}
                onSelect={() => onBulkSelect ? onBulkSelect(result.headwordGroupId,!bulkSelected?.has(result.headwordGroupId)) : onSelect(result)}
              />
              {onBulkSelect && bulkSelected?.has(result.headwordGroupId) && <Check className={bulk.mark} size={16} aria-hidden="true"/>}
            </div>
          ))}
        </LibraryResultList>
      </div>
    );
}
