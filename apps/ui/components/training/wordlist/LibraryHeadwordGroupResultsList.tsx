"use client";

import React from "react";
import { sharedArticlePresentationV1Enabled } from "@/lib/platform/platformV2Rollout";
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
  if (sharedArticlePresentationV1Enabled())
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
  return (
    <div className="space-y-2">
      {results.map((result) => {
        const selected = result.headwordGroupId === selectedHeadwordGroupId;
        const meaningCount =
          result.meaningCount === 1
            ? "1 betekenis"
            : `${result.meaningCount} betekenissen`;
        const context = [
          result.partOfSpeechLabels.join(" · "),
          result.dictionaryLabel,
          result.homographNumber ? `homoniem ${result.homographNumber}` : null,
          meaningCount,
        ]
          .filter(Boolean)
          .join(" · ");

        return (
          <div
            key={result.headwordGroupId}
            data-testid="library-headword-group-row"
          >
            <button
              type="button"
              data-testid={`library-headword-group-${result.headwordGroupId}`}
              onClick={() => onSelect(result)}
              className={`w-full rounded-2xl border p-3 text-left transition ${
                selected
                  ? "border-primary/50 bg-primary/5 shadow-sm"
                  : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900/70 dark:hover:bg-slate-800"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="font-semibold text-slate-900 dark:text-white">
                      {result.headword}
                    </span>
                    {result.homographNumber ? (
                      <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                        {result.homographNumber}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {context}
                  </div>
                </div>
                <span className="hidden text-slate-400 sm:inline">...</span>
              </div>
            </button>
          </div>
        );
      })}
    </div>
  );
}
