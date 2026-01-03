"use client";

import React from "react";
import type { SidebarHistoryItem, DictionaryEntry, WordListSummary } from "@/lib/types";
import type { ReviewResult } from "@/lib/trainingService";
import { SidebarCard } from "./SidebarCard";
import { WordDetailPanel } from "./WordDetailPanel";

type SidebarTab = "recent" | "details";

type Props = {
  selectedEntry: DictionaryEntry | null;
  recentEntries: SidebarHistoryItem[];
  onSelectEntry: (entry: DictionaryEntry) => void;
  onWordClick: (word: string) => void;
  /** Entry to show in the details tab */
  detailEntry: DictionaryEntry | null;
  /** Callback when user clicks info icon on a card */
  onShowDetails: (entry: DictionaryEntry) => void;
  /** Active tab - controlled from parent */
  activeTab: SidebarTab;
  /** Callback when tab changes */
  onTabChange: (tab: SidebarTab) => void;
  /** Props needed for WordDetailPanel */
  userId: string;
  translationLang: string | null;
  userLists: WordListSummary[];
  onListsUpdated?: () => Promise<void> | void;
  onTrainWord?: (wordId: string) => void;
  /** Current training card ID (used to show training-only actions in Details). */
  currentTrainingEntryId?: string | null;
  /** Run a training action (freeze/hide) for the current card. */
  onTrainingAction?: (result: ReviewResult) => void;
  /** Disable training action buttons (e.g. until revealed / while saving). */
  trainingActionDisabled?: boolean;
};

export function Sidebar({
  selectedEntry,
  recentEntries,
  onSelectEntry,
  onWordClick,
  detailEntry,
  onShowDetails,
  activeTab,
  onTabChange,
  userId,
  translationLang,
  userLists,
  onListsUpdated,
  onTrainWord,
  currentTrainingEntryId,
  onTrainingAction,
  trainingActionDisabled,
}: Props) {
  return (
    <div className="flex h-full flex-col rounded-3xl border border-slate-200 bg-white/80 shadow-lg shadow-slate-900/5 dark:border-slate-800 dark:bg-card-dark">
      {/* Tab Header */}
      <div className="flex items-center border-b border-slate-100 dark:border-slate-700">
        <div className="flex flex-1 items-center">
          <button
            type="button"
            onClick={() => onTabChange("recent")}
            className={`flex-1 px-4 py-3 text-sm font-semibold transition-colors ${
              activeTab === "recent"
                ? "border-b-2 border-primary text-slate-900 dark:text-white"
                : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
          >
            Recent
          </button>
          <button
            type="button"
            onClick={() => onTabChange("details")}
            className={`flex-1 px-4 py-3 text-sm font-semibold transition-colors ${
              activeTab === "details"
                ? "border-b-2 border-primary text-slate-900 dark:text-white"
                : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
          >
            Details
            {detailEntry && (
              <span className="ml-1.5 inline-flex h-2 w-2 rounded-full bg-primary" />
            )}
          </button>
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === "recent" ? (
          <div className="h-full overflow-y-auto p-4 custom-scrollbar">
            <div className="space-y-3">
              {recentEntries.length === 0 && (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Nog geen woorden opgezocht.
                </p>
              )}
              {recentEntries.map((entry, index) => (
                <SidebarCard
                  key={`${entry.id}-${index}`}
                  entry={entry}
                  highlightedWord={selectedEntry?.headword}
                  onWordClick={onWordClick}
                  onSelect={() => onSelectEntry(entry)}
                  onShowDetails={() => onShowDetails(entry)}
                />
              ))}
            </div>
          </div>
        ) : (
          <div className="h-full overflow-hidden">
            {detailEntry ? (
              <WordDetailPanel
                entry={detailEntry}
                userId={userId}
                translationLang={translationLang}
                userLists={userLists}
                onListsUpdated={onListsUpdated}
                onTrainWord={onTrainWord}
                showHeader={true}
                showActions={true}
                currentTrainingEntryId={currentTrainingEntryId ?? null}
                onTrainingAction={onTrainingAction}
                trainingActionDisabled={trainingActionDisabled}
              />
            ) : (
              <div className="flex h-full items-center justify-center p-4">
                <div className="text-center">
                  <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
                    <svg
                      className="h-6 w-6 text-slate-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <circle cx="12" cy="12" r="10" strokeWidth="2" />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M12 16v-4m0-4h.01"
                      />
                    </svg>
                  </div>
                  <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
                    Geen woord geselecteerd
                  </p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Klik op het ⓘ icoon bij een woord om details te bekijken
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export type { SidebarTab };
