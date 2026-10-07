"use client";

import React from "react";
import { useRetainedAccountRead } from "@/lib/training/activity/useRetainedAccountRead";
import { getUiMessages } from "@/lib/uiMessages";
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
  const exerciseLabel = (item: RecentTrainingHistoryItem) => item.exercise
    ? text.exercises[item.exercise.family === "translation" ? "translation" : item.exercise.direction === "reverse" ? "idiomReverse" : "idiomDirect"]
    : text.modes[item.cardTypeId];
  const [requestVersion, setRequestVersion] = React.useState(0);
  const load = React.useCallback((signal: AbortSignal) => fetchRecentTrainingHistory(signal), []);
  const read = useRetainedAccountRead("recent-history", userId, load, open, requestVersion);
  const visibleLoadState = read.status === "ready"
    ? { ...read, ...read.value }
    : { ...read, items: [] as RecentTrainingHistoryItem[], hasMore: false };
  const refreshFailed = read.status === "ready" && read.refreshFailed;
  const tones = { learning_started: "Started", review_fail: "Again", review_hard: "Hard", review_success: "Good", review_easy: "Easy" } as const;
  const items: ActivityRow[] = visibleLoadState.items.map((item) => ({
    id: item.activityId,
    word: item.exercise?.text ?? item.headword,
    at: item.reviewedAt,
    exercise: exerciseLabel(item),
    result: text.events[item.reviewResult],
    tone: tones[item.reviewResult],
  }));

  if (!open) return null;
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
