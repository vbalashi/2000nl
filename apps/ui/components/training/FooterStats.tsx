"use client";
import React, { useState } from "react";
import type {
  CardFilter,
  DetailedStats,
  TrainingMode,
  WordListSummary,
} from "@/lib/types";
import { Tooltip } from "@/components/Tooltip";
import { DropUpSelect } from "./DropUpSelect";
import { appVersionInfo } from "@/lib/appVersion";
import { EffectiveTrainingScopeSummary } from "./EffectiveTrainingScopeSummary";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";

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
  languageOptions?: Array<{ value: string; label: string }>;
  activeList?: WordListSummary | null;
  activeListName?: string | null;
  activeListValue?: string;
  listOptions?: Array<{ value: string; label: string }>;
  onListChange?: (value: string) => void;
  onOpenSettings?: () => void;
  /** Current active scenario name for display */
  activeScenarioName?: string;
  /** Fixed Y value for HERHALING - set at session start, never changes */
  initialReviewDue?: number | null;
  /** Hide the duplicate legacy chooser when Today/Setup owns session setup. */
  inlineControlsEnabled?: boolean;
  /** Compact Oiksc session footer: progress only, with stable stage height. */
  compact?: boolean;
  interfaceLanguage?: OnboardingLanguage;
};

const footerCopy = {
  nl: { new: "Nieuw", review: "Herhaling", total: "Totaal" },
  en: { new: "New", review: "Review", total: "Total" },
  ru: { new: "Новые", review: "Повторение", total: "Всего" },
} satisfies Record<
  OnboardingLanguage,
  { new: string; review: string; total: string }
>;

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

function CompactProgressStat({
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
    <div className="flex h-[33px] w-[104px] flex-col gap-[3px] font-mono">
      <span className={`text-[8px] font-bold uppercase ${colorClass}`}>
        {label}
      </span>
      <div className="flex h-[14px] items-center gap-[6px]">
        <div className="h-1 w-[52px] overflow-hidden rounded-sm bg-[#4B5360]">
          <div
            className={`h-full rounded-sm transition-[width] motion-reduce:transition-none ${barColorClass}`}
            style={{ width: `${progress}%` }}
          />
        </div>
        <span className="whitespace-nowrap text-[10px] font-semibold text-[#BFC7D4]">
          {value} / {total}
        </span>
      </div>
    </div>
  );
}

export function FooterStats({
  stats,
  cardFilter,
  onCardFilterChange,
  language,
  onLanguageChange,
  languageOptions,
  activeList,
  activeListName,
  activeListValue,
  listOptions,
  onListChange,
  onOpenSettings,
  activeScenarioName,
  initialReviewDue,
  inlineControlsEnabled = true,
  compact = false,
  interfaceLanguage = "nl",
}: Props) {
  const [controlsOpen, setControlsOpen] = useState(false);
  const versionInfo = appVersionInfo();
  const text = footerCopy[interfaceLanguage];
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

  const fallbackLanguageOptions = [{ value: "nl", label: "Nederlands" }];

  const cardFilterOptions: { value: CardFilter; label: string }[] = [
    { value: "both", label: "Nieuw + Herhaling" },
    { value: "new", label: "Alleen nieuw" },
    { value: "review", label: "Alleen herhaling" },
  ];

  const progress = (
    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-300 sm:flex-nowrap sm:gap-x-5">
      <ProgressStat
        label={text.new}
        value={newCardsToday}
        total={dailyNewLimit}
        colorClass="text-blue-500 dark:text-blue-400"
        barColorClass="bg-blue-500 dark:bg-blue-400"
      />
      <ProgressStat
        label={text.review}
        value={reviewCardsDone}
        total={reviewTotal}
        colorClass="text-amber-500 dark:text-amber-400"
        barColorClass="bg-amber-500 dark:bg-amber-400"
      />
      <ProgressStat
        label={text.total}
        value={totalWordsLearned}
        total={totalWordsInList}
        colorClass="text-emerald-500 dark:text-emerald-400"
        barColorClass="bg-emerald-500 dark:bg-emerald-400"
      />
    </div>
  );

  if (compact) {
    return (
      <footer
        data-compact="true"
        data-visual-spec="training-v1.0"
        className="z-10 flex h-[44px] w-full shrink-0 items-end justify-center border-t border-slate-200 bg-white px-4 pb-1 dark:border-[#272C35] dark:bg-[#11141A]"
      >
        <div
          data-testid="training-session-footer-progress"
          className="flex h-[33px] w-[326px] max-w-full items-center gap-[7px]"
        >
          <CompactProgressStat
            label={text.new}
            value={newCardsToday}
            total={dailyNewLimit}
            colorClass="text-[#9D94FF]"
            barColorClass="bg-[#9D94FF]"
          />
          <CompactProgressStat
            label={text.review}
            value={reviewCardsDone}
            total={reviewTotal}
            colorClass="text-[#E9C46A]"
            barColorClass="bg-[#E9C46A]"
          />
          <CompactProgressStat
            label={text.total}
            value={totalWordsLearned}
            total={totalWordsInList}
            colorClass="text-[#37D99B]"
            barColorClass="bg-[#37D99B]"
          />
        </div>
      </footer>
    );
  }

  return (
    <footer
      data-compact={compact ? "true" : "false"}
      className={`sticky bottom-0 z-10 w-full border-t border-slate-200 bg-white/80 backdrop-blur dark:border-slate-800 dark:bg-slate-900/75 ${
        compact ? "py-2" : "py-2 sm:py-3"
      }`}
    >
      <div className="mx-auto flex w-full max-w-[1200px] justify-center px-2 sm:px-4 lg:px-6">
        <div
          className={`flex w-full max-w-2xl flex-col ${
            compact ? "justify-center px-2 py-1" : "gap-2 p-3 sm:p-3"
          }`}
        >
          {/* Stats Row - Horizontal grid on mobile, flex on desktop */}
          {progress}

          {!compact ? (
            <div
              className={
                inlineControlsEnabled
                  ? "grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                  : "grid gap-2"
              }
            >
              <EffectiveTrainingScopeSummary
                activeList={activeList ?? null}
                activeScenarioName={activeScenarioName ?? "Begrip"}
                cardFilter={cardFilter}
                language={language}
                showFooterSelectorHint
                className="rounded-xl p-2.5 shadow-none"
              />
              {inlineControlsEnabled ? (
                <button
                  type="button"
                  onClick={() => setControlsOpen((open) => !open)}
                  aria-expanded={controlsOpen}
                  aria-controls="training-footer-controls"
                  className="rounded-full border border-slate-200 bg-white/85 px-4 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900/75 dark:text-slate-100 dark:hover:bg-slate-800"
                >
                  Wijzigen
                </button>
              ) : null}
            </div>
          ) : null}

          {/* Controls Row */}
          {!compact && inlineControlsEnabled && controlsOpen ? (
            <div
              id="training-footer-controls"
              className="border-t border-slate-100 pt-2 text-xs dark:border-slate-800/60"
            >
              <div className="grid w-full gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <DropUpSelect
                  label="Leertaal"
                  showLabel={false}
                  uppercase={false}
                  buttonClassName="w-full justify-between px-3 py-2"
                  value={language}
                  options={
                    languageOptions?.length
                      ? languageOptions
                      : fallbackLanguageOptions
                  }
                  onChange={onLanguageChange}
                />
                {listOptions?.length && activeListValue && onListChange ? (
                  <DropUpSelect
                    label="Trainingslijst"
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
                      aria-label="Wijzig trainingslijst in Instellingen"
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
          ) : null}

          {!compact ? (
            <div className="text-center text-[10px] text-slate-400 sm:text-right dark:text-slate-500">
              {versionInfo.display}
            </div>
          ) : null}
        </div>
      </div>
    </footer>
  );
}
