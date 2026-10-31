"use client";
import { useCardLoadDiagnostics } from "@/lib/diagnostics/useCardLoadDiagnostics";
import { useCurrentTrainingCard, usePresentedTrainingCard, type PresentedTrainingCard } from "../v2/useCurrentTrainingCard";
import { readCurrentTrainingCard, type CurrentTrainingCardContext } from "@/lib/platform/trainingCurrentCardClient";
import { useAdditionalTranslationLanguage } from "@/components/practice/article/AdditionalCardTranslation";
import { useLatchedTranslationBuffer } from "../v2/useLatchedTranslationBuffer";

import React from "react";
import { useTrainingExerciseSession } from "../useTrainingExerciseSession";
import { idiomExerciseAdapter } from "./trainingExerciseAdapters";
import { getUiMessages } from "@/lib/uiMessages";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import type {
  PlatformIdiomExerciseSessionV2,
} from "../../../../../packages/shared/types/platformV2";
import type { IdiomExerciseContent } from "@/lib/training/idiomExerciseContent";

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

import type { TrainingSessionProgress } from "@/lib/training/sessionLifecycle";

import type {CardFilter} from "@/lib/types";
type Props = TrainingCompletionActions & {
  presentationActive?: boolean;
  interactionDisabled?: boolean;
  authorityRefreshing?: boolean;
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
  interactionDisabled=false,
  authorityRefreshing=false,
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
  const currentReadRef = React.useRef<{targetId:string; context:CurrentTrainingCardContext} | null>(null);
  const runtime = useTrainingExerciseSession({
    identity:JSON.stringify([userId,session.sessionId,session.runGeneration]),
    preparationIdentity:JSON.stringify([contentLanguageCode,translationTargetLanguageCode]),session,
    adapter:idiomExerciseAdapter({userId,sessionId:session.sessionId,contentLanguageCode,translationTargetLanguageCode,readPermit:currentReadRef}),
    onProgress,onSuperseded:onSessionSuperseded ?? onExit,
  });
  const {candidate,content,revealed,setRevealed,loading,submitting,failed:error,terminal,superseded,completed:completedCount,replaceSession}=runtime;
  const footerStats = useIdiomTrainingStats(session.sessionId, completedCount);
  const currentCard = useCurrentTrainingCard({ userId, active: !superseded && presentationActive && Boolean(candidate && content) && !loading && !terminal,
    target: candidate && content ? { sessionId: session.sessionId, entryId: candidate.entryId,
      cardTypeId: `${candidate.family}:${candidate.direction}`, targetId: candidate.targetId, direction: candidate.direction,
      sourceVersion: content.entry.sourceVersion ?? 0, stateRevision: candidate.state?.stateRevision ?? "untracked" } : null });
  useCardLoadDiagnostics(JSON.stringify([userId, session.sessionId, candidate?.targetId]),
    superseded || !presentationActive || terminal ? "inactive" : currentCard.failed || (error && !candidate) ? "failed" : loading || (candidate && !currentCard.ready) ? "loading" : "ready");
  usePresentedTrainingCard(presentationActive && currentCard.ready && currentCard.context && content ? { userId, group: content.group, entry: content.entry, currentCard: currentCard.context } : null, onCurrentCardContextChange);
  React.useLayoutEffect(()=>{currentReadRef.current = currentCard.context && candidate ? {targetId:candidate.targetId,context:currentCard.context} : null;},[candidate,currentCard.context]);
  const additionalTranslationLanguage = useAdditionalTranslationLanguage();
  useLatchedTranslationBuffer({ ownerId: userId, sessionId: session.sessionId, generation: session.runGeneration, currentEntryId: candidate?.entryId, currentOrdinal: session.members.find(member => member.targetId === candidate?.targetId)?.ordinal, targetLanguageCode: translationTargetLanguageCode, additionalTargetLanguageCode: additionalTranslationLanguage, members: session.members });

  const exclusion = useTrainingExclusion({
    userId,
    onSessionSuperseded: replaceSession,
    identity: candidate?.targetKey ?? "none",
    sessionId: session.sessionId,
    target: { kind: "exercise", targetId: candidate?.targetId ?? "" },
    onAccepted: runtime.acceptAndAdvance,
  });

  useRecordedStudyTime({ ownerId: userId, sessionId: session.sessionId, family: "idiom", entryId: candidate?.entryId, targetId: candidate?.targetId,
    enabled: studyTimeEnabled && currentCard.ready && Boolean(candidate && content) && !loading && !terminal && !submitting && !exclusion.busy && !exclusion.failed });

  const preparationFailed = error && !candidate && !loading && !terminal;
  const sessionPresentation = {
    kind: "planned" as const,
    position: Math.min(completedCount, session.requestedTotal),
    total: session.requestedTotal,
    fraction: session.requestedTotal > 0
      ? Math.min(completedCount / session.requestedTotal, 1)
      : 0,
  };

  if (superseded) return null;

  return (
    <TrainingSessionV2Layout
      authorityRefreshing={authorityRefreshing && !submitting && !exclusion.busy}
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
                exclusion.failed ? void exclusion.exclude() : void runtime.retry(),
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
        action={{label:t.retry,onClick:()=>void runtime.retry()}}
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
          busy={interactionDisabled || submitting || exclusion.busy || exclusion.failed || runtime.actionRetryRequired}
          onExclude={() => void exclusion.exclude()}
          onGrade={(result) => { if(!interactionDisabled && currentCard.ready && !exclusion.busy)void runtime.grade(result); }}
        />
      ) : null}
    </TrainingSessionV2Layout>
  );
}
