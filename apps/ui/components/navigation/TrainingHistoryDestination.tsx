"use client";

import React from "react";
import { useRetainedAccountRead } from "@/lib/training/activity/useRetainedAccountRead";
import { getUiMessages } from "@/lib/uiMessages";
import { sharedArticlePresentationV1Enabled } from "@/lib/platform/platformV2Rollout";
import { PracticePanel } from "@/components/practice/ui/PracticePanel";
import { RecentActivityList, type ActivityRow } from "@/components/practice/RecentActivityList";
import activityStyle from "@/components/practice/recentActivity.module.css";
import theme from "@/components/practice/ui/practiceTheme.module.css";
import stateStyle from "@/components/practice/library/libraryWorkspace.module.css";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import {
  fetchRecentTrainingHistory,
  type RecentTrainingHistoryItem,
} from "@/lib/training/trainingHistoryService";



const localeByLanguage: Record<OnboardingLanguage, string> = {
  nl: "nl-NL",
  en: "en-GB",
  ru: "ru-RU",
};

const formatTime = (language: OnboardingLanguage, value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(localeByLanguage[language], {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};

type Props = {
  open: boolean;
  userId: string;
  interfaceLanguage: OnboardingLanguage;
  onReturnToTraining: () => void;
};

export function TrainingHistoryDestination({
  open,
  userId,
  interfaceLanguage,
  onReturnToTraining,
}: Props) {
  const text = getUiMessages(interfaceLanguage).trainingHistory;
  const approved = sharedArticlePresentationV1Enabled();
  const exerciseLabel = (item: RecentTrainingHistoryItem) => item.exercise
    ? text.exercises[item.exercise.family === "translation" ? "translation" : item.exercise.direction === "reverse" ? "idiomReverse" : "idiomDirect"]
    : text.modes[item.cardTypeId];
  const headingRef = React.useRef<HTMLHeadingElement>(null);
  const [requestVersion, setRequestVersion] = React.useState(0);
  const load = React.useCallback((signal: AbortSignal) => fetchRecentTrainingHistory(signal), []);
  const read = useRetainedAccountRead("recent-history", userId, load, open, requestVersion);
  const visibleLoadState = read.status === "ready"
    ? { ...read, ...read.value }
    : { ...read, items: [] as RecentTrainingHistoryItem[], hasMore: false };
  const refreshFailed = read.status === "ready" && read.refreshFailed;

  React.useEffect(() => {
    if (open) headingRef.current?.focus();
  }, [open]);
  if (approved) {
    if (!open) return null;
    const tones = { learning_started: "Started", review_fail: "Again", review_hard: "Hard", review_success: "Good", review_easy: "Easy" } as const;
    const items: ActivityRow[] = visibleLoadState.items.map((item) => ({
      id: item.activityId,
      word: item.exercise?.text ?? item.headword,
      at: item.reviewedAt,
      exercise: exerciseLabel(item),
      result: text.events[item.reviewResult],
      tone: tones[item.reviewResult],
    }));
    return <div className={theme.theme} data-colour-mode="app">
      <PracticePanel title={text.title} language={interfaceLanguage} closeLabel={text.close} onClose={onReturnToTraining}>
        {visibleLoadState.status === "loading" ?
          <div className={activityStyle.state}><p className={stateStyle.notice} role="status">{text.loading}</p></div> : null}
        {(visibleLoadState.status === "error" || refreshFailed) ? <div className={`${activityStyle.state} ${stateStyle.error}`} role="alert">
          <p>{text.error}</p><button type="button" className={stateStyle.button} onClick={() => setRequestVersion(version => version + 1)}>{text.retry}</button>
        </div> : null}
        {visibleLoadState.status === "ready" && <RecentActivityList items={items} locale={interfaceLanguage}
          scopeLabel={text.subtitle} emptyLabel={text.empty} listLabel={text.list} />}
        {visibleLoadState.status === "ready" && visibleLoadState.hasMore && <div className={activityStyle.state}><p className={stateStyle.notice}>{text.truncated}</p></div>}
      </PracticePanel>
    </div>;
  }
  return (
    <section
      aria-hidden={!open}
      aria-busy={open && visibleLoadState.status === "loading"}
      className={`${open ? "flex" : "hidden"} h-full min-h-0 flex-col overflow-hidden`}
    >
      <div className="scrollbar-hide min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6 md:px-8">
        <div className="mx-auto w-full max-w-3xl">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">
                {text.eyebrow}
              </p>
              <h1
                ref={headingRef}
                tabIndex={-1}
                className="mt-1 text-3xl font-bold text-slate-950 outline-none dark:text-white"
              >
                {text.title}
              </h1>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                {text.subtitle}
              </p>
            </div>
            <button
              type="button"
              onClick={onReturnToTraining}
              className="min-h-11 rounded-xl border border-indigo-500 bg-indigo-600 px-5 text-sm font-bold text-white shadow-sm transition hover:bg-indigo-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-950"
            >
              {text.back}
            </button>
          </div>

          <section className="mt-7 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 dark:border-slate-800 dark:bg-slate-900">
            {visibleLoadState.status === "loading" ? (
              <p role="status" className="text-sm text-slate-500 dark:text-slate-400">
                {text.loading}
              </p>
            ) : null}
            {(visibleLoadState.status === "error" || refreshFailed) ? (
              <div role="alert" className="flex flex-col items-start gap-3">
                <p className="text-sm text-red-700 dark:text-red-300">{text.error}</p>
                <button
                  type="button"
                  onClick={() => setRequestVersion((version) => version + 1)}
                  className="min-h-10 rounded-xl border border-slate-300 px-4 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800"
                >
                  {text.retry}
                </button>
              </div>
            ) : null}
            {visibleLoadState.status === "ready" &&
            visibleLoadState.items.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">{text.empty}</p>
            ) : null}
            {visibleLoadState.items.length > 0 ? (
              <ol aria-label={text.list} className="divide-y divide-slate-100 dark:divide-slate-800">
                {visibleLoadState.items.map((item) => {
                  const eventLabel = text.events[item.reviewResult];
                  const modeLabel = exerciseLabel(item);
                  return (
                    <li
                      key={item.activityId}
                      className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                          <span className="font-semibold text-slate-950 dark:text-white">
                            {item.exercise?.text ?? item.headword}
                          </span>
                          {item.partOfSpeech ? (
                            <span className="text-xs text-slate-500 dark:text-slate-400">
                              {item.partOfSpeech}
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                          {modeLabel}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                          {eventLabel}
                        </p>
                        <time
                          dateTime={item.reviewedAt}
                          className="mt-1 block text-xs tabular-nums text-slate-500 dark:text-slate-400"
                        >
                          {formatTime(interfaceLanguage, item.reviewedAt)}
                        </time>
                      </div>
                    </li>
                  );
                })}
              </ol>
            ) : null}
            {visibleLoadState.status === "ready" && visibleLoadState.hasMore ? (
              <p className="mt-4 border-t border-slate-100 pt-4 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
                {text.truncated}
              </p>
            ) : null}
          </section>
        </div>
      </div>
    </section>
  );
}
