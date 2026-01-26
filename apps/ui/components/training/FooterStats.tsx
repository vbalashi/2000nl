"use client";
import React from "react";
import type { CardFilter, DetailedStats, TrainingMode } from "@/lib/types";
import { Tooltip } from "@/components/Tooltip";
import { DropUpSelect } from "./DropUpSelect";
import { appVersionInfo } from "@/lib/appVersion";

type Props = {
  stats: DetailedStats;
  /** @deprecated Use activeScenario instead */
  enabledModes: TrainingMode[];
  cardFilter: CardFilter;
  /** @deprecated Use onOpenSettings instead */
  onModesChange: (modes: TrainingMode[]) => void;
  onCardFilterChange: (filter: CardFilter) => void;
  language: string;
  onLanguageChange: (value: string) => void;
  activeListName?: string | null;
  activeListValue?: string;
  listOptions?: Array<{ value: string; label: string }>;
  onListChange?: (value: string) => void;
  onOpenSettings?: () => void;
  /** Current active scenario name for display */
  activeScenarioName?: string;
  /** Fixed Y value for HERHALING - set at session start, never changes */
  initialReviewDue?: number | null;
};

// Progress stat with bar and numbers
function ProgressStat({
  label,
  value,
  total,
  colorClass,
  barColorClass,
}: {
  label: string;
  value: number;
  total: number;
  colorClass: string;
  barColorClass: string;
}) {
  const progress = total > 0 ? Math.min((value / total) * 100, 100) : 0;

  return (
    <div className="flex items-center gap-2">
      <span
        className={`text-[10px] font-bold uppercase tracking-widest ${colorClass}`}
      >
        {label}
      </span>
      <div className="h-1.5 w-8 md:w-16 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
        <div
          className={`h-full rounded-full transition-all ${barColorClass}`}
          style={{ width: `${progress}%` }}
        />
      </div>
      <span className="text-slate-800 dark:text-slate-100">
        {value}
        <span className="opacity-50">/{total}</span>
      </span>
    </div>
  );
}

export function FooterStats({
  stats,
  cardFilter,
  onCardFilterChange,
  language,
  onLanguageChange,
  activeListName,
  activeListValue,
  listOptions,
  onListChange,
  onOpenSettings,
  activeScenarioName,
  initialReviewDue,
}: Props) {
  const versionInfo = appVersionInfo();
  const {
    newCardsToday,
    dailyNewLimit,
    reviewCardsDone,
    totalWordsLearned,
    totalWordsInList,
  } = stats;

  // Use fixed Y value from session start, or fall back to current stats
  const reviewTotal =
    initialReviewDue ?? reviewCardsDone + stats.reviewCardsDue;

  const languageOptions = [
    { value: "nl", label: "Nederlands" },
  ];

  const cardFilterOptions: { value: CardFilter; label: string }[] = [
    { value: "both", label: "Nieuw + Herhaling" },
    { value: "new", label: "Alleen nieuw" },
    { value: "review", label: "Alleen herhaling" },
  ];

  return (
    <footer className="sticky bottom-0 z-10 w-full border-t border-slate-200 bg-white/80 py-2 sm:py-3 backdrop-blur dark:border-slate-800 dark:bg-slate-900/75">
      <div className="mx-auto flex w-full max-w-[1200px] justify-center px-2 sm:px-4 lg:px-6">
        <div className="flex w-full max-w-2xl flex-col gap-2 p-3 sm:p-3">
          {/* Stats Row - Horizontal grid on mobile, flex on desktop */}
          <div className="grid grid-cols-3 gap-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-300 sm:flex sm:items-center sm:justify-between sm:gap-3">
            {/* New cards today */}
            <ProgressStat
              label="Nieuw"
              value={newCardsToday}
              total={dailyNewLimit}
              colorClass="text-blue-500 dark:text-blue-400"
              barColorClass="bg-blue-500 dark:bg-blue-400"
            />

            {/* Review cards today */}
            <ProgressStat
              label="Herhaling"
              value={reviewCardsDone}
              total={reviewTotal}
              colorClass="text-amber-500 dark:text-amber-400"
              barColorClass="bg-amber-500 dark:bg-amber-400"
            />

            {/* Total progress */}
            <ProgressStat
              label="Totaal"
              value={totalWordsLearned}
              total={totalWordsInList}
              colorClass="text-emerald-500 dark:text-emerald-400"
              barColorClass="bg-emerald-500 dark:bg-emerald-400"
            />
          </div>

          {/* Controls Row */}
          <div className="hidden sm:block border-t border-slate-100 pt-2 text-xs dark:border-slate-800/60">
            <div className="grid w-full grid-cols-4 gap-2">
              <DropUpSelect
                label="Taal"
                showLabel={false}
                uppercase={false}
                buttonClassName="w-full justify-between px-3 py-2"
                value={language}
                options={languageOptions}
                onChange={onLanguageChange}
              />
              {listOptions?.length && activeListValue && onListChange ? (
                <DropUpSelect
                  label="Lijst"
                  showLabel={false}
                  uppercase={false}
                  buttonClassName="w-full justify-between px-3 py-2"
                  value={activeListValue}
                  options={listOptions}
                  onChange={onListChange}
                />
              ) : (
                <Tooltip content="Wijzig lijst in Instellingen" side="top">
                  <button
                    type="button"
                    onClick={onOpenSettings}
                    className="flex w-full items-center justify-between gap-2 rounded-full border border-slate-200 bg-white/80 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-200 dark:hover:bg-slate-800/60"
                    aria-label="Wijzig lijst in Instellingen"
                  >
                    <span className="text-slate-800 dark:text-white">
                      {activeListName ?? "VanDale 2k"}
                    </span>
                  </button>
                </Tooltip>
              )}
              <Tooltip content="Wijzig scenario in Instellingen" side="top">
                <button
                  type="button"
                  onClick={onOpenSettings}
                  className="flex w-full items-center justify-between gap-2 rounded-full bg-slate-100/70 px-3 py-2 text-[11px] tracking-wide text-slate-600 transition hover:bg-slate-200/80 dark:bg-slate-800/70 dark:text-slate-200 dark:hover:bg-slate-700/80"
                  aria-label="Wijzig scenario in Instellingen"
                >
                  <span className="font-semibold text-slate-800 dark:text-white">
                    {activeScenarioName ?? "Begrip"}
                  </span>
                </button>
              </Tooltip>
              <DropUpSelect
                label="Kaarten"
                showLabel={false}
                uppercase={false}
                buttonClassName="w-full justify-between px-3 py-2"
                value={cardFilter}
                options={cardFilterOptions}
                onChange={(value) => onCardFilterChange(value as CardFilter)}
              />
            </div>
          </div>

          <div className="text-center text-[10px] text-slate-400 sm:text-right dark:text-slate-500">
            {versionInfo.display}
          </div>
        </div>
      </div>
    </footer>
  );
}
