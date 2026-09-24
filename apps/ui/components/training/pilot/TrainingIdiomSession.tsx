"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
    idiom: "IDIOM",
    meaningPrompt: "What does this expression mean?",
    expressionPrompt: "Which expression matches this meaning?",
    headword: "Headword",
    reveal: "Show answer",
    answer: "Answer",
    again: "Again",
    hard: "Hard",
    good: "Good",
    easy: "Easy",
    loading: "Preparing the next idiom…",
    empty: "No explained idioms match this selection.",
    complete: "Idiom session complete",
    completeDetail: (count: number) => `${count} exercises completed`,
    retry: "Try again",
    failed: "The next idiom could not be prepared.",
    example: "Example",
  },
  nl: {
    title: "Uitdrukkingen trainen",
    back: "Terug naar instellen",
    idiom: "UITDRUKKING",
    meaningPrompt: "Wat betekent deze uitdrukking?",
    expressionPrompt: "Welke uitdrukking past bij deze betekenis?",
    headword: "Trefwoord",
    reveal: "Antwoord tonen",
    answer: "Antwoord",
    again: "Opnieuw",
    hard: "Moeilijk",
    good: "Goed",
    easy: "Makkelijk",
    loading: "De volgende uitdrukking wordt voorbereid…",
    empty: "Geen uitgelegde uitdrukkingen passen bij deze selectie.",
    complete: "Sessie uitdrukkingen afgerond",
    completeDetail: (count: number) => `${count} oefeningen afgerond`,
    retry: "Opnieuw proberen",
    failed: "De volgende uitdrukking kon niet worden voorbereid.",
    example: "Voorbeeld",
  },
  ru: {
    title: "Тренировка идиом",
    back: "Назад к настройкам",
    idiom: "ИДИОМА",
    meaningPrompt: "Что означает это выражение?",
    expressionPrompt: "Какое выражение соответствует этому значению?",
    headword: "Словарная статья",
    reveal: "Показать ответ",
    answer: "Ответ",
    again: "Снова",
    hard: "Сложно",
    good: "Хорошо",
    easy: "Легко",
    loading: "Готовим следующую идиому…",
    empty: "По этому выбору нет идиом с объяснением.",
    complete: "Сессия идиом завершена",
    completeDetail: (count: number) => `Завершено упражнений: ${count}`,
    retry: "Повторить",
    failed: "Не удалось подготовить следующую идиому.",
    example: "Пример",
  },
} satisfies Record<OnboardingLanguage, Record<string, unknown>>;

function displayNodeText(
  node: IdiomExerciseContent["expression"],
  languageCode: string,
) {
  return (
    node.translations.find(
      (translation) =>
        translation.targetLanguageCode === languageCode &&
        translation.status === "ready" &&
        translation.text?.trim(),
    )?.text?.trim() ?? node.text
  );
}

export function TrainingIdiomSession({
  userId,
  session,
  contentLanguageCode,
  translationTargetLanguageCode,
  interfaceLanguage,
  onExit,
}: Props) {
  const t = copy[interfaceLanguage];
  const [candidate, setCandidate] = useState<PlatformIdiomExerciseCandidateV2 | null>(null);
  const [content, setContent] = useState<IdiomExerciseContent | null>(null);
  const [completedCount, setCompletedCount] = useState(session.completedActions);
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
  }, [contentLanguageCode, session.sessionId, translationTargetLanguageCode, userId]);

  useEffect(() => {
    if (!candidate || !content) return;
    const transitionId = activeTransitionIdRef.current;
    if (!transitionId) return;
    activeTransitionIdRef.current = null;
    finishTrainingUserTransition(transitionId, "ready");
  }, [candidate, content]);

  useEffect(() => {
    void loadNext();
  }, [loadNext]);

  const progressLabel = useMemo(
    () => `${Math.min(completedCount, session.requestedTotal)} / ${session.requestedTotal}`,
    [completedCount, session.requestedTotal],
  );

  const grade = async (reviewResult: PlatformTrainingExerciseReviewResultV2) => {
    if (!candidate || !content || submitting) return;
    setSubmitting(true);
    setError(false);
    try {
      const clientEventId = actionClientEventIdRef.current ?? crypto.randomUUID();
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

  const expression = content ? content.expression.text : "";
  const explanation = content
    ? displayNodeText(content.explanation, translationTargetLanguageCode ?? "")
    : "";
  const examples = content?.examples ?? [];

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-transparent px-4 py-5 md:px-8 md:py-8">
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-5">
        <header className="flex items-center justify-between gap-4">
          <div>
            <p className="font-mono text-xs font-bold tracking-[0.18em] text-indigo-600 dark:text-indigo-300">{t.title}</p>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{progressLabel}</p>
          </div>
          <button type="button" onClick={onExit} className="min-h-10 rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200">{t.back}</button>
        </header>

        {loading ? <div role="status" className="grid min-h-[320px] flex-1 place-items-center rounded-3xl border border-slate-300 bg-slate-50 text-sm font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-300">{t.loading}</div> : null}
        {!loading && terminal ? (
          <div role="status" className="grid min-h-[320px] flex-1 place-items-center rounded-3xl border border-slate-300 bg-slate-50 px-6 text-center dark:border-slate-700 dark:bg-slate-900/50">
            <div>
              <h1 className="text-2xl font-semibold text-slate-950 dark:text-white">{terminal === "complete" ? t.complete : t.empty}</h1>
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{terminal === "complete" ? t.completeDetail(completedCount) : ""}</p>
              <button type="button" onClick={onExit} className="mt-5 rounded-xl bg-indigo-500 px-4 py-3 font-semibold text-white">{t.back}</button>
            </div>
          </div>
        ) : null}
        {!loading && !terminal && candidate && content ? (
          <main className="flex flex-1 flex-col gap-4">
            <section className="rounded-3xl border border-slate-300 bg-slate-50 p-6 shadow-sm dark:border-slate-700 dark:bg-[#1d222b] md:p-10">
              <div className="flex items-center justify-between gap-3 text-xs font-bold tracking-[0.18em] text-indigo-600 dark:text-indigo-300">
                <span>{t.idiom}</span>
                <span>{candidate.queueSource}</span>
              </div>
              <p className="mt-8 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">{candidate.direction === "direct" ? t.meaningPrompt : t.expressionPrompt}</p>
              {candidate.direction === "direct" ? (
                <h1 className="mt-4 font-serif text-4xl italic leading-tight text-slate-950 dark:text-white md:text-6xl">{expression}</h1>
              ) : (
                <div className="mt-4">
                  <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">{t.headword}: {content.headword}</p>
                  <p className="mt-4 text-2xl leading-relaxed text-slate-950 dark:text-white md:text-4xl">{explanation}</p>
                </div>
              )}
            </section>

            {revealed ? (
              <section className="rounded-3xl border border-indigo-300 bg-indigo-50/70 p-6 dark:border-indigo-800 dark:bg-indigo-950/30">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-indigo-700 dark:text-indigo-300">{t.answer}</p>
                <p className="mt-3 font-serif text-3xl italic text-slate-950 dark:text-white">{expression}</p>
                <p className="mt-3 text-lg leading-relaxed text-slate-800 dark:text-slate-100">{explanation}</p>
                {examples.map((example) => <p key={example.contentNodeId} className="mt-4 border-l-2 border-indigo-400 pl-4 text-sm italic text-slate-600 dark:text-slate-300"><span className="not-italic font-semibold">{t.example}: </span>{example.text}</p>)}
              </section>
            ) : (
              <button type="button" onClick={() => setRevealed(true)} className="min-h-12 rounded-xl border border-indigo-500 bg-indigo-500/10 px-4 py-3 font-semibold text-indigo-800 dark:text-indigo-200">{t.reveal}</button>
            )}

            {revealed ? (
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {([["fail", t.again], ["hard", t.hard], ["success", t.good], ["easy", t.easy]] as const).map(([result, label]) => (
                  <button key={result} type="button" disabled={submitting} onClick={() => void grade(result)} className="min-h-12 rounded-xl border border-slate-300 bg-white/70 px-3 py-3 font-semibold text-slate-800 disabled:cursor-wait disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-100">{label}</button>
                ))}
              </div>
            ) : null}
          </main>
        ) : null}
        {error ? <div role="alert" className="flex items-center justify-between gap-3 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800 dark:border-red-800 dark:bg-red-950/30 dark:text-red-200"><span>{t.failed}</span><button type="button" onClick={() => void loadNext()} className="shrink-0 underline">{t.retry}</button></div> : null}
      </div>
    </div>
  );
}
