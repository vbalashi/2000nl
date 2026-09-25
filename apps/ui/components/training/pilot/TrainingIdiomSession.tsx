"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import {
  fetchNextPlatformV2IdiomTrainingSessionExercise,
  markPlatformV2IdiomTrainingSessionMemberUnavailable,
  performPlatformV2IdiomExerciseAction,
} from "@/lib/platform/platformV2IdiomExerciseClient";
import type {
  PlatformIdiomExerciseCandidateV2,
  PlatformIdiomExerciseSessionV2,
  PlatformTrainingExerciseReviewResultV2,
} from "../../../../../packages/shared/types/platformV2";
import { loadIdiomExerciseContent } from "@/lib/training/idiomExerciseLoader";
import type { IdiomExerciseContent } from "@/lib/training/idiomExerciseContent";
import {
  beginTrainingUserTransition,
  createTrainingTransitionId,
  finishTrainingUserTransition,
  measureTrainingTransitionStage,
} from "@/lib/training/trainingTransitionTiming";

import { TrainingSessionV2Layout } from "../v2/TrainingSessionV2Layout";
import { TrainingSessionNotice } from "../v2/TrainingSessionSurface";
import { TrainingSessionChrome } from "../v2/TrainingSessionChrome";

import { TrainingSessionStatsFooter } from "../TrainingSessionStatsFooter";
import { useIdiomTrainingStats } from "./useIdiomTrainingStats";

import { useTrainingExclusion } from "../v2/useTrainingExclusion";
import { trainingExclusionCopy } from "../v2/TrainingExcludeAction";
import { TrainingIdiomCard } from "./TrainingIdiomCard";

type Props = {
  userId: string;
  session: PlatformIdiomExerciseSessionV2;
  contentLanguageCode: string;
  translationTargetLanguageCode: string | null;
  interfaceLanguage: OnboardingLanguage;
  onExit: () => void;
  onSessionSuperseded?: () => void;
  onHistory?: () => void;
  onPlayResolvedAudio?: (url: string, label: string) => void;
  onOpenDetails?: (details: {
    group: IdiomExerciseContent["group"];
    entry: IdiomExerciseContent["entry"];
  }) => void;
};

const copy = {
  en: {
    title: "Idiom training",
    back: "Back to setup",
    loading: "Preparing the next idiom…",
    empty: "No explained idioms match this selection.",
    complete: "Idiom session complete",
    completeDetail: (count: number) => `${count} exercises completed`,
    retry: "Try again",
    failed: "The next idiom could not be prepared.",
  },
  nl: {
    title: "Uitdrukkingen trainen",
    back: "Terug naar instellen",
    loading: "De volgende uitdrukking wordt voorbereid…",
    empty: "Geen uitgelegde uitdrukkingen passen bij deze selectie.",
    complete: "Sessie uitdrukkingen afgerond",
    completeDetail: (count: number) => `${count} oefeningen afgerond`,
    retry: "Opnieuw proberen",
    failed: "De volgende uitdrukking kon niet worden voorbereid.",
  },
  ru: {
    title: "Тренировка идиом",
    back: "Назад к настройкам",
    loading: "Готовим следующую идиому…",
    empty: "По этому выбору нет идиом с объяснением.",
    complete: "Сессия идиом завершена",
    completeDetail: (count: number) => `Завершено упражнений: ${count}`,
    retry: "Повторить",
    failed: "Не удалось подготовить следующую идиому.",
  },
} satisfies Record<OnboardingLanguage, Record<string, unknown>>;

export function TrainingIdiomSession({
  userId,
  session,
  contentLanguageCode,
  translationTargetLanguageCode,
  interfaceLanguage,
  onExit,
  onSessionSuperseded,
  onHistory,
  onPlayResolvedAudio,
  onOpenDetails,
}: Props) {
  const t = copy[interfaceLanguage];
  const [candidate, setCandidate] =
    useState<PlatformIdiomExerciseCandidateV2 | null>(null);
  const [content, setContent] = useState<IdiomExerciseContent | null>(null);
  const [completedCount, setCompletedCount] = useState(
    session.completedActions,
  );
  const footerStats = useIdiomTrainingStats(session.sessionId, completedCount);
  const completedCountRef = useRef(session.completedActions);
  const [terminal, setTerminal] = useState<"complete" | "empty" | null>(
    session.plannedTotal === 0 ? "empty" : null,
  );
  const [revealed, setRevealed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(false);
  const actionClientEventIdRef = useRef<string | null>(null);
  const activeTransitionIdRef = useRef<string | null>(null);
  const loadGenerationRef = useRef(0);

  const loadNext = useCallback(async () => {
    const generation = ++loadGenerationRef.current;
    const transitionId = createTrainingTransitionId();
    activeTransitionIdRef.current = transitionId;
    beginTrainingUserTransition(transitionId, "continue");
    setLoading(true);
    setError(false);
    setTerminal(null);
    setCandidate(null);
    setContent(null);
    setRevealed(false);
    try {
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const next = await measureTrainingTransitionStage(
          transitionId,
          "idiom.session-next",
          () =>
            fetchNextPlatformV2IdiomTrainingSessionExercise(
              userId,
              session.sessionId,
            ),
        );
        if (generation !== loadGenerationRef.current) return;
        if (next.status === "ready") {
          const loaded = await measureTrainingTransitionStage(
            transitionId,
            "idiom.content-lookup",
            () =>
              loadIdiomExerciseContent({
                candidate: next,
                contentLanguageCode,
                translationTargetLanguageCode,
              }),
          );
          if (generation !== loadGenerationRef.current) return;
          if (loaded.state === "ready") {
            setCandidate(next);
            setContent(loaded.content);
            return;
          }
          await markPlatformV2IdiomTrainingSessionMemberUnavailable(
            userId,
            session.sessionId,
            next.targetId,
            loaded.state,
          );
          continue;
        }
        if (next.status === "unavailable") {
          await markPlatformV2IdiomTrainingSessionMemberUnavailable(
            userId,
            session.sessionId,
            next.targetId,
            next.reason,
          );
          continue;
        }
        if (next.status === "completed" || next.status === "exhausted") {
          setTerminal(completedCountRef.current > 0 ? "complete" : "empty");
          activeTransitionIdRef.current = null;
          finishTrainingUserTransition(transitionId, `terminal-${next.status}`);
          return;
        }
        setError(true);
        activeTransitionIdRef.current = null;
        finishTrainingUserTransition(transitionId, `error-${next.status}`);
        return;
      }
      setError(true);
      activeTransitionIdRef.current = null;
      finishTrainingUserTransition(transitionId, "error-retries-exhausted");
    } catch {
      if (generation !== loadGenerationRef.current) return;
      setError(true);
      activeTransitionIdRef.current = null;
      finishTrainingUserTransition(transitionId, "error-request");
    } finally {
      if (generation === loadGenerationRef.current) setLoading(false);
    }
  }, [
    contentLanguageCode,
    session.sessionId,
    translationTargetLanguageCode,
    userId,
  ]);

  useEffect(() => {
    if (!candidate || !content) return;
    const transitionId = activeTransitionIdRef.current;
    if (!transitionId) return;
    activeTransitionIdRef.current = null;
    finishTrainingUserTransition(transitionId, "ready");
  }, [candidate, content]);

  useEffect(
    () => () => {
      loadGenerationRef.current++;
      const transitionId = activeTransitionIdRef.current;
      if (!transitionId) return;
      activeTransitionIdRef.current = null;
      finishTrainingUserTransition(transitionId, "cancelled");
    },
    [],
  );

  useEffect(() => {
    void loadNext();
  }, [loadNext]);

  const exclusion = useTrainingExclusion({
    userId,
    onSessionSuperseded: onSessionSuperseded ?? onExit,
    identity: candidate?.targetKey ?? "none",
    sessionId: session.sessionId,
    target: { kind: "exercise", targetId: candidate?.targetId ?? "" },
    onAccepted: async () => {
      completedCountRef.current += 1;
      setCompletedCount(completedCountRef.current);
      await loadNext();
    },
  });

  const grade = async (
    reviewResult: PlatformTrainingExerciseReviewResultV2,
  ) => {
    if (!candidate || !content || submitting || exclusion.busy) return;
    setSubmitting(true);
    setError(false);
    try {
      const clientEventId =
        actionClientEventIdRef.current ?? crypto.randomUUID();
      actionClientEventIdRef.current = clientEventId;
      await performPlatformV2IdiomExerciseAction({
        trainingSessionId: session.sessionId,
        clientEventId,
        candidate,
        reviewResult,
      });
      actionClientEventIdRef.current = null;
      completedCountRef.current += 1;
      setCompletedCount(completedCountRef.current);
      await loadNext();
    } catch {
      setError(true);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <TrainingSessionV2Layout
      phase={loading ? "loading" : error && !candidate ? "failure" : "ready"}
      chrome={
        <TrainingSessionChrome
          interfaceLanguage={interfaceLanguage}
          scenario="idiom"
          mode={
            session.direction === "direct"
              ? "word-to-definition"
              : "definition-to-word"
          }
          cardFilter="both"
          sessionName={t.title}
          presentation={{
            kind: "planned",
            position: Math.min(completedCount, session.requestedTotal),
            total: session.requestedTotal,
            fraction:
              session.requestedTotal > 0
                ? Math.min(completedCount / session.requestedTotal, 1)
                : 0,
          }}
          onHistory={onHistory}
          onClose={onExit}
          disabled={submitting || exclusion.busy}
        />
      }
      notice={
        error || exclusion.failed ? (
          <TrainingSessionNotice
            notice={{
              kind: "error",
              message: exclusion.failed
                ? trainingExclusionCopy[interfaceLanguage].failed
                : t.failed,
              retryLabel: t.retry,
              retryDisabled: submitting || loading,
              onRetry: () =>
                exclusion.failed ? void exclusion.exclude() : void loadNext(),
            }}
          />
        ) : null
      }
      footer={
        <TrainingSessionStatsFooter
          {...footerStats}
          interfaceLanguage={interfaceLanguage}
        />
      }
    >
      {loading ? (
        <div
          role="status"
          className="grid h-full min-h-0 place-items-center rounded-3xl border border-slate-300 bg-slate-50 text-sm font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-300"
        >
          {t.loading}
        </div>
      ) : null}
      {!loading && terminal ? (
        <div
          role="status"
          className="grid h-full min-h-0 place-items-center rounded-3xl border border-slate-300 bg-slate-50 px-6 text-center dark:border-slate-700 dark:bg-slate-900/50"
        >
          <div>
            <h1 className="text-2xl font-semibold text-slate-950 dark:text-white">
              {terminal === "complete" ? t.complete : t.empty}
            </h1>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              {terminal === "complete" ? t.completeDetail(completedCount) : ""}
            </p>
            <button
              type="button"
              onClick={onExit}
              className="mt-5 rounded-xl bg-indigo-500 px-4 py-3 font-semibold text-white"
            >
              {t.back}
            </button>
          </div>
        </div>
      ) : null}
      {!loading && !terminal && candidate && content ? (
        <TrainingIdiomCard
          key={`${session.sessionId}:${candidate.targetKey}:${translationTargetLanguageCode ?? "off"}`}
          candidate={candidate}
          content={content}
          userId={userId}
          contentLanguageCode={contentLanguageCode}
          translationTargetLanguageCode={translationTargetLanguageCode}
          onPlayResolvedAudio={onPlayResolvedAudio}
          onOpenDetails={onOpenDetails}
          interfaceLanguage={interfaceLanguage}
          revealed={revealed}
          onReveal={() => setRevealed(true)}
          busy={submitting || exclusion.busy || exclusion.failed}
          onExclude={() => void exclusion.exclude()}
          onGrade={(result) => void grade(result)}
        />
      ) : null}
    </TrainingSessionV2Layout>
  );
}
