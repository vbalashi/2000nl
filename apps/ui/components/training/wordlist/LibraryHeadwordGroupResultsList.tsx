"use client";

import React from "react";
import type { LibraryHeadwordGroupResult } from "./libraryHeadwordGroupResults";

type Props = {
  results: LibraryHeadwordGroupResult[];
  selectedHeadwordGroupId: string | null;
  onSelect: (result: LibraryHeadwordGroupResult) => void;
};

export function LibraryHeadwordGroupResultsList({
  results,
  selectedHeadwordGroupId,
  onSelect,
}: Props) {
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
          result.homographNumber
            ? `homoniem ${result.homographNumber}`
            : null,
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
