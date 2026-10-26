"use client";
import { useCurrentTrainingCard, usePresentedTrainingCard, type PresentedTrainingCard } from "../v2/useCurrentTrainingCard";
import { readCurrentTrainingCard, type CurrentTrainingCardContext } from "@/lib/platform/trainingCurrentCardClient";
import { useAdditionalTranslationLanguage } from "@/components/practice/article/AdditionalCardTranslation";
import { useLatchedTranslationBuffer } from "../v2/useLatchedTranslationBuffer";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { getUiMessages } from "@/lib/uiMessages";
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
import { resolveIdiomExerciseContent, type IdiomExerciseContent } from "@/lib/training/idiomExerciseContent";
import {
  beginTrainingUserTransition,
  createTrainingTransitionId,
  finishTrainingUserTransition,
  measureTrainingTransitionStage,
} from "@/lib/training/trainingTransitionTiming";

import { TrainingCompletion, type TrainingCompletionActions } from "../v2/TrainingCompletion";
import { TrainingSessionState } from "../v2/TrainingSessionState";
import { TrainingSessionV2Layout } from "../v2/TrainingSessionV2Layout";
import { TrainingSessionNotice } from "../v2/TrainingSessionSurface";
import { TrainingSessionChrome } from "../v2/TrainingSessionChrome";

import { TrainingSessionStatsFooter } from "../TrainingSessionStatsFooter";
import { useIdiomTrainingStats } from "./useIdiomTrainingStats";

import { useTrainingExclusion } from "../v2/useTrainingExclusion";
import { trainingExclusionCopy } from "../v2/TrainingExcludeAction";
import { TrainingIdiomCard } from "./TrainingIdiomCard";

import { useRecordedStudyTime } from "../useRecordedStudyTime";

import { useTrainingExerciseProgress } from "../useTrainingExerciseProgress";
import type { TrainingSessionProgress } from "@/lib/training/sessionLifecycle";

import type {CardFilter} from "@/lib/types";
type Props = TrainingCompletionActions & {
  presentationActive?: boolean;
  cardFilter?: CardFilter;
  sessionName?: string;
  studyTimeEnabled?: boolean;
  userId: string;
  session: PlatformIdiomExerciseSessionV2;
  contentLanguageCode: string;
  translationTargetLanguageCode: string | null;
  interfaceLanguage: OnboardingLanguage;
  onExit: () => void;
  onProgress?: (progress: TrainingSessionProgress) => void;
  onSessionSuperseded?: () => void;
  onHistory?: () => void;
  onPlayResolvedAudio?: (url: string, label: string) => void;
  onCurrentCardContextChange?: (value: PresentedTrainingCard | null) => void;
  onOpenDetails?: (details: {
    currentCard?: CurrentTrainingCardContext;
    group: IdiomExerciseContent["group"];
    entry: IdiomExerciseContent["entry"];
  }) => void;
};


export function TrainingIdiomSession({
  sessionName,
  cardFilter = "both",
  studyTimeEnabled = false,
  userId,
  presentationActive = true,
  session,
  contentLanguageCode,
  translationTargetLanguageCode,
  interfaceLanguage,
  onExit,
  onProgress,
  onRestart, onEdit, pending, startFailed,
  onSessionSuperseded,
  onHistory,
  onPlayResolvedAudio,
  onOpenDetails,
  onCurrentCardContextChange,
}: Props) {
  const t = getUiMessages(interfaceLanguage).trainingExercises.idiom;
  const [candidate, setCandidate] =
    useState<PlatformIdiomExerciseCandidateV2 | null>(null);
  const [content, setContent] = useState<IdiomExerciseContent | null>(null);
  const { completed: completedCount, accept, finish } = useTrainingExerciseProgress(session, onProgress);
  const footerStats = useIdiomTrainingStats(session.sessionId, completedCount);
  const [terminal, setTerminal] = useState<"complete" | "empty" | null>(
    session.plannedTotal === 0 ? session.completedActions > 0 ? "complete" : "empty" : null,
  );
  const [revealed, setRevealed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(false);
  const actionClientEventIdRef = useRef<string | null>(null);
  const activeTransitionIdRef = useRef<string | null>(null);
  const loadGenerationRef = useRef(0);

  const currentCard = useCurrentTrainingCard({ userId, active: presentationActive && Boolean(candidate && content) && !loading && !terminal,
    target: candidate && content ? { sessionId: session.sessionId, entryId: candidate.entryId,
      cardTypeId: `${candidate.family}:${candidate.direction}`, targetId: candidate.targetId, direction: candidate.direction,
      sourceVersion: content.entry.sourceVersion ?? 0, stateRevision: candidate.state?.stateRevision ?? "untracked" } : null });
  usePresentedTrainingCard(presentationActive && currentCard.ready && currentCard.context && content ? { userId, group: content.group, entry: content.entry, currentCard: currentCard.context } : null, onCurrentCardContextChange);
  const currentReadRef = React.useRef<{targetId:string; context:CurrentTrainingCardContext} | null>(null);
  React.useLayoutEffect(()=>{currentReadRef.current = currentCard.context && candidate ? {targetId:candidate.targetId,context:currentCard.context} : null;},[candidate,currentCard.context]);
  const additionalTranslationLanguage = useAdditionalTranslationLanguage();
  useLatchedTranslationBuffer({ ownerId: userId, sessionId: session.sessionId, generation: session.runGeneration, currentEntryId: candidate?.entryId, currentOrdinal: session.members.find(member => member.targetId === candidate?.targetId)?.ordinal, targetLanguageCode: translationTargetLanguageCode, additionalTargetLanguageCode: additionalTranslationLanguage, members: session.members });

  const loadNext = useCallback(async () => {
    const readPermit = currentReadRef.current;
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
              (async () => {
                if (!readPermit || readPermit.targetId !== next.targetId) return loadIdiomExerciseContent({candidate:next,contentLanguageCode,translationTargetLanguageCode});
                const payload=await readCurrentTrainingCard(userId,{...readPermit.context,entryId:next.entryId,cardTypeId:"word-to-definition",contentLanguageCode,translationTargetLanguageCode});
                const group=payload.groups.find(item=>item.entries.some(entry=>entry.kind==="sense-card"&&entry.entryId===next.entryId));
                const content=group&&resolveIdiomExerciseContent(next,group);
                return content ? {state:"ready" as const,content} : {state:"projection-missing" as const};
              })(),
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
          const completedActions = finish({ ...next, status: next.status });
          setTerminal(completedActions > 0 ? "complete" : "empty");
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
    finish,
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
      accept();
      await loadNext();
    },
  });

  useRecordedStudyTime({ ownerId: userId, sessionId: session.sessionId, family: "idiom", entryId: candidate?.entryId, targetId: candidate?.targetId,
    enabled: studyTimeEnabled && currentCard.ready && Boolean(candidate && content) && !loading && !terminal && !submitting && !exclusion.busy && !exclusion.failed });

  const grade = async (
    reviewResult: PlatformTrainingExerciseReviewResultV2,
  ) => {
    if (!candidate || !content || submitting || exclusion.busy || !currentCard.ready) return;
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
      accept();
      await loadNext();
    } catch {
      setError(true);
    } finally {
      setSubmitting(false);
    }
  };

  const preparationFailed = error && !candidate && !loading && !terminal;
  const sessionPresentation = {
    kind: "planned" as const,
    position: Math.min(completedCount, session.requestedTotal),
    total: session.requestedTotal,
    fraction: session.requestedTotal > 0
      ? Math.min(completedCount / session.requestedTotal, 1)
      : 0,
  };

  return (
    <TrainingSessionV2Layout
      approvedPresentation={true}
            phase={loading || (candidate && !currentCard.ready && !currentCard.failed) ? "loading" : currentCard.failed || (error && !candidate) ? "failure" : "ready"}
      chrome={
        <TrainingSessionChrome
          approvedPresentation={true}
          interfaceLanguage={interfaceLanguage}
          scenario="idiom"
          mode={
            (candidate?.direction ?? session.direction) !== "reverse"
              ? "word-to-definition"
              : "definition-to-word"
          }
          cardFilter={cardFilter}
          sessionName={sessionName || t.title}
          presentation={sessionPresentation}
          showProgress={!loading && !(error && !candidate) && !terminal}
          onHistory={onHistory}
          onClose={onExit}
          disabled={submitting || exclusion.busy}
        />
      }
      notice={
        !preparationFailed && (error || exclusion.failed) ? (
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
      {currentCard.enabled && candidate && !loading && !currentCard.ready ? <TrainingSessionState loading={!currentCard.failed} title={currentCard.failed ? t.failed : t.loading}
        action={currentCard.failed ? {label:t.retry,onClick:currentCard.retry} : undefined} /> : null}
      {loading ? <TrainingSessionState loading title={t.loading} /> : null}
      {preparationFailed ? <TrainingSessionState title={t.failed} announcement="alert"
        action={{label:t.retry,onClick:()=>void loadNext()}}
        secondaryAction={{label:getUiMessages(interfaceLanguage).trainingSession.back,onClick:onExit}} /> : null}
      {!loading && terminal ? <TrainingCompletion empty={terminal==="empty"} emptyDetail={cardFilter==="review" && session.plannedTotal===0?{en:"No idioms are due now. Include new cards in training settings to start learning more.",nl:"Er hoeven nu geen uitdrukkingen herhaald te worden. Voeg nieuwe kaarten toe in de trainingsinstellingen om verder te leren.",ru:"Сейчас нет идиом для повторения. Включите новые карточки в настройках тренировки, чтобы продолжить изучение."}[interfaceLanguage]:undefined} ownerId={userId} sessionId={session.sessionId} interfaceLanguage={interfaceLanguage} completedCount={completedCount} onExit={onExit} onRestart={onRestart} onEdit={onEdit} pending={pending} startFailed={startFailed} /> : null}
      {!loading && !terminal && currentCard.ready && candidate && content ? (
        <TrainingIdiomCard
          presentationActive={presentationActive}
          currentCard={currentCard.context}
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
