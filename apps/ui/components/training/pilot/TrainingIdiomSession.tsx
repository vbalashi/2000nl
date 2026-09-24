"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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

import { TrainingExerciseCard } from "../v2/TrainingExerciseCard";
import { buildIdiomCardPresentation } from "@/lib/training/idiomCardPresentation";

type Props = {
  userId: string;
  session: PlatformIdiomExerciseSessionV2;
  contentLanguageCode: string;
  translationTargetLanguageCode: string | null;
  interfaceLanguage: OnboardingLanguage;
  onExit: () => void;
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
}: Props) {
  const t = copy[interfaceLanguage];
  const [candidate, setCandidate] =
    useState<PlatformIdiomExerciseCandidateV2 | null>(null);
  const [content, setContent] = useState<IdiomExerciseContent | null>(null);
  const [completedCount, setCompletedCount] = useState(
    session.completedActions,
  );
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

  const loadNext = useCallback(async () => {
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
      setError(true);
      activeTransitionIdRef.current = null;
      finishTrainingUserTransition(transitionId, "error-request");
    } finally {
      setLoading(false);
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

  const progressLabel = useMemo(
    () =>
      `${Math.min(completedCount, session.requestedTotal)} / ${session.requestedTotal}`,
    [completedCount, session.requestedTotal],
  );

  const grade = async (
    reviewResult: PlatformTrainingExerciseReviewResultV2,
  ) => {
    if (!candidate || !content || submitting) return;
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

  const presentation = useMemo(
    () =>
      content && candidate
        ? buildIdiomCardPresentation({
            content,
            direction: candidate.direction,
            interfaceLanguage,
            translationTargetLanguageCode,
            repeatCount: candidate.state?.seenCount ?? 0,
          })
        : null,
    [content, candidate, interfaceLanguage, translationTargetLanguageCode],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-transparent px-4 py-5 md:px-8 md:py-8">
      <div className="mx-auto flex w-full max-w-[760px] min-h-0 flex-1 flex-col gap-[10px]">
        <header className="flex items-center justify-between gap-4">
          <div>
            <p className="font-mono text-xs font-bold tracking-[0.18em] text-indigo-600 dark:text-indigo-300">
              {t.title}
            </p>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {progressLabel}
            </p>
          </div>
          <button
            type="button"
            onClick={onExit}
            className="min-h-10 rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200"
          >
            {t.back}
          </button>
        </header>

        {loading ? (
          <div
            role="status"
            className="grid min-h-[320px] flex-1 place-items-center rounded-3xl border border-slate-300 bg-slate-50 text-sm font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-300"
          >
            {t.loading}
          </div>
        ) : null}
        {!loading && terminal ? (
          <div
            role="status"
            className="grid min-h-[320px] flex-1 place-items-center rounded-3xl border border-slate-300 bg-slate-50 px-6 text-center dark:border-slate-700 dark:bg-slate-900/50"
          >
            <div>
              <h1 className="text-2xl font-semibold text-slate-950 dark:text-white">
                {terminal === "complete" ? t.complete : t.empty}
              </h1>
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                {terminal === "complete"
                  ? t.completeDetail(completedCount)
                  : ""}
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
          <TrainingExerciseCard
            key={candidate.targetKey}
            presentation={presentation!}
            interfaceLanguage={interfaceLanguage}
            revealed={revealed}
            onReveal={() => setRevealed(true)}
            busy={submitting}
            onGrade={(result) => void grade(result)}
          />
        ) : null}
        {error ? (
          <div
            role="alert"
            className="flex items-center justify-between gap-3 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800 dark:border-red-800 dark:bg-red-950/30 dark:text-red-200"
          >
            <span>{t.failed}</span>
            <button
              type="button"
              onClick={() => void loadNext()}
              className="shrink-0 underline"
            >
              {t.retry}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
