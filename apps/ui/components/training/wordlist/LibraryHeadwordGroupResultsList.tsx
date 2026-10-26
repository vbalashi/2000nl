"use client";

import React from "react";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import {
  LibraryResultList,
  LibraryResultRow,
} from "@/components/practice/library/LibraryResultList";
import { platformV2Message } from "@/lib/platform/platformV2ClientI18n";
import theme from "@/components/practice/ui/practiceTheme.module.css";
import type { LibraryHeadwordGroupResult } from "./libraryHeadwordGroupResults";

type Props = {
  interfaceLanguage?: OnboardingLanguage;
  results: LibraryHeadwordGroupResult[];
  selectedHeadwordGroupId: string | null;
  onSelect: (result: LibraryHeadwordGroupResult) => void;
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
  interfaceLanguage = "nl",
  selectedHeadwordGroupId,
  onSelect,
}: Props) {
  return (
      <div className={theme.theme} data-colour-mode="app">
        <LibraryResultList
          language={interfaceLanguage}
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
                selected={result.headwordGroupId === selectedHeadwordGroupId}
                onSelect={() => onSelect(result)}
              />
            </div>
          ))}
        </LibraryResultList>
      </div>
    );
}
