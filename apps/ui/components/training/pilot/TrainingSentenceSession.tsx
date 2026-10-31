"use client";
import {useEntryNoteMaterial} from "../useEntryNoteMaterial";
import { useCurrentTrainingCard, usePresentedTrainingCard, type PresentedTrainingCard } from "../v2/useCurrentTrainingCard";
import { readCurrentTrainingCard, type CurrentTrainingCardContext } from "@/lib/platform/trainingCurrentCardClient";
import { useAdditionalTranslationLanguage } from "@/components/practice/article/AdditionalCardTranslation";
import { useLatchedTranslationBuffer } from "../v2/useLatchedTranslationBuffer";
import { useDictionaryTranslationRecovery } from "@/lib/translation/useDictionaryTranslationRecovery";
import { useTrainingAnswerTranslationPreparation } from "@/components/training/v2/TrainingAnswerTranslation";
import { translationPendingCopy } from "@/lib/training/translationPendingCopy";
import React, { useEffect, useRef } from "react";
import { useTrainingExerciseSession } from "../useTrainingExerciseSession";
import { sentenceExerciseAdapter } from "./trainingExerciseAdapters";
import { getUiMessages } from "@/lib/uiMessages";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import type { PlatformTranslationExerciseSessionV2 } from "../../../../../packages/shared/types/platformV2";
import { resolveSentenceExerciseContent, type SentenceExerciseContent } from "@/lib/training/sentenceExerciseContent";
import { loadSentenceExerciseContent } from "@/lib/training/sentenceExerciseLoader";
import { buildSentenceCardPresentation } from "@/lib/training/sentenceCardPresentation";
import { TrainingCompletion, type TrainingCompletionActions } from "../v2/TrainingCompletion";
import { TrainingSessionState } from "../v2/TrainingSessionState";
import { TrainingSessionV2Layout } from "../v2/TrainingSessionV2Layout";
import { TrainingSessionNotice } from "../v2/TrainingSessionSurface";
import { TrainingSessionChrome } from "../v2/TrainingSessionChrome";
import { TrainingSessionStatsFooter } from "../TrainingSessionStatsFooter";
import { useTranslationTrainingStats } from "./useTranslationTrainingStats";
import { useTrainingExclusion } from "../v2/useTrainingExclusion";
import { trainingExclusionCopy, TrainingExcludeAction } from "../v2/TrainingExcludeAction";
import { TrainingExerciseCard } from "../v2/TrainingExerciseCard";
import { TrainingCardSecondaryActions } from "../v2/TrainingCardTemplates";
import { SenseCardReportAction } from "@/components/feedback/SenseCardReportSheet";
import { freezeSenseCardDiagnosticSnapshot } from "@/lib/feedback/diagnosticReportClient";
import { resolvePlatformV2Audio } from "@/lib/platform/platformV2TrainingMediaClient";

import { useRecordedStudyTime } from "../useRecordedStudyTime";

import type { TrainingSessionProgress } from "@/lib/training/sessionLifecycle";

type Props = TrainingCompletionActions & {
  presentationActive?: boolean;
  interactionDisabled?: boolean;
  authorityRefreshing?: boolean;
  sessionName?: string;
  studyTimeEnabled?: boolean;
  userId: string;
  session: PlatformTranslationExerciseSessionV2;
  contentLanguageCode: string;
  translationTargetLanguageCode: string;
  interfaceLanguage: OnboardingLanguage;
  onExit: () => void;
  onProgress?: (progress: TrainingSessionProgress) => void;
  onSessionSuperseded?: () => void;
  onHistory?: () => void;
  onPlayResolvedAudio?: (url: string, label: string) => void;
  onCurrentCardContextChange?: (value: PresentedTrainingCard | null) => void;
  onOpenDetails?: (details: { currentCard?: CurrentTrainingCardContext; group: SentenceExerciseContent["group"]; entry: SentenceExerciseContent["entry"] }) => void;
};

export function TrainingSentenceSession(props: Props) {
  const { userId, session, contentLanguageCode, translationTargetLanguageCode, interfaceLanguage, onExit, onSessionSuperseded, onHistory, onPlayResolvedAudio, onOpenDetails } = props;
  const studyTimeEnabled = props.studyTimeEnabled ?? false;
  const t = getUiMessages(interfaceLanguage).trainingExercises.sentence;
  const currentReadRef = React.useRef<{targetId:string; context:CurrentTrainingCardContext} | null>(null);
  const runtime=useTrainingExerciseSession({
    identity:JSON.stringify([userId,session.sessionId,session.runGeneration]),
    preparationIdentity:JSON.stringify([contentLanguageCode,translationTargetLanguageCode]),session,
    adapter:sentenceExerciseAdapter({userId,sessionId:session.sessionId,contentLanguageCode,translationTargetLanguageCode,readPermit:currentReadRef}),
    onProgress:props.onProgress,onSuperseded:onSessionSuperseded ?? onExit,
  });
  const {candidate,content,setContent,revealed,setRevealed,loading,submitting,failed,setFailed,terminal,completed,loadNext}=runtime;
  const translationPending=runtime.pendingEntryId!==null;
  const audioController=useRef<AbortController|null>(null);
  useEffect(()=>()=>audioController.current?.abort(),[userId,session.sessionId,candidate?.targetId,props.presentationActive]);
  const currentCard = useCurrentTrainingCard({ userId, active: props.presentationActive !== false && Boolean(candidate && content) && !loading && !terminal,
    target: candidate && content ? { sessionId: session.sessionId, entryId: candidate.entryId,
      cardTypeId: `${candidate.family}:${candidate.direction}`, targetId: candidate.targetId, direction: candidate.direction,
      sourceVersion: content.entry.sourceVersion ?? 0, stateRevision: candidate.state?.stateRevision ?? "untracked" } : null });
  usePresentedTrainingCard(props.presentationActive !== false && currentCard.ready && currentCard.context && content ? { userId, group: content.group, entry: content.entry, currentCard: currentCard.context } : null, props.onCurrentCardContextChange);
  React.useLayoutEffect(()=>{currentReadRef.current = currentCard.context && candidate ? {targetId:candidate.targetId,context:currentCard.context} : null;},[candidate,currentCard.context]);
  const additionalTranslationLanguage = useAdditionalTranslationLanguage();
  useLatchedTranslationBuffer({ ownerId: userId, sessionId: session.sessionId, generation: session.runGeneration, currentEntryId: candidate?.entryId, currentOrdinal: candidate?.ordinal, targetLanguageCode: translationTargetLanguageCode, additionalTargetLanguageCode: additionalTranslationLanguage, members: session.members });
  const stats = useTranslationTrainingStats(session.sessionId, completed);

  useDictionaryTranslationRecovery({entryId:runtime.pendingEntryId,targetLanguageCode:translationTargetLanguageCode,enabled:translationPending&&!submitting,refresh:()=>void loadNext(false,true)});
  useTrainingAnswerTranslationPreparation({entry:content?.entry??null,targetLanguageCode:translationTargetLanguageCode,currentCard:currentCard.context,paused:!currentCard.ready||loading||submitting,
    refresh:async signal=>{
      if(!candidate)return null;
      if(currentCard.context){
        const payload=await readCurrentTrainingCard(userId,{...currentCard.context,entryId:candidate.entryId,cardTypeId:"word-to-definition",contentLanguageCode,translationTargetLanguageCode},signal);
        if(signal.aborted)return null;
        const group=payload.groups.find(item=>item.entries.some(entry=>entry.kind==="sense-card"&&entry.entryId===candidate.entryId));
        const refreshed=group&&resolveSentenceExerciseContent(candidate,group);
        if(refreshed){setContent(refreshed);return refreshed.entry;}return null;
      }
      const loaded=await loadSentenceExerciseContent({candidate,contentLanguageCode,translationTargetLanguageCode,signal});
      if(signal.aborted)return null;
      if(loaded.state==="ready"){setContent(loaded.content);return loaded.content.entry;}
      return null;
    },
  });
  const exclusion = useTrainingExclusion({ userId, onSessionSuperseded: runtime.replaceSession, identity: candidate?.targetKey ?? "none", sessionId: session.sessionId, target: { kind: "exercise", targetId: candidate?.targetId ?? "" }, onAccepted: runtime.acceptAndAdvance });
  useRecordedStudyTime({ ownerId: userId, sessionId: session.sessionId, family: "sentence", entryId: candidate?.entryId, targetId: candidate?.targetId,
    enabled: studyTimeEnabled && currentCard.ready && Boolean(candidate && content) && !loading && !terminal && !submitting && !exclusion.busy && !exclusion.failed });
  const preparationFailed = failed && !candidate && !loading && !terminal;
  const sessionPresentation = { kind: "planned" as const, position: Math.min(completed, session.requestedTotal), total: session.requestedTotal, fraction: session.requestedTotal ? Math.min(completed / session.requestedTotal, 1) : 0 };
  const noteMaterial=useEntryNoteMaterial({userId,entryId:content?.entry.entryId,scope:JSON.stringify([session.sessionId,session.runGeneration,candidate?.targetId]),active:props.presentationActive!==false&&content?.entry.noteMaterial!==undefined,busy:loading||submitting});
  const presentation = content ? buildSentenceCardPresentation({ content:{...content,entry:{...content.entry,noteMaterial}}, interfaceLanguage, translationTargetLanguageCode, repeatCount: candidate?.state?.seenCount ?? 0 }) : null;
  const playAudio=async()=>{
    if(!content?.group.header.audio||!onPlayResolvedAudio||audioController.current)return;
    const controller=new AbortController();audioController.current=controller;
    const expected=runtime.operations.capture("selection");
    try{
      const url=await resolvePlatformV2Audio({cacheOwnerId:userId,entryId:content.entry.entryId,sourceVersion:content.entry.sourceVersion,
        node:{contentNodeId:content.sentence.contentNodeId,sourceTextFingerprint:content.sentence.sourceTextFingerprint},
        currentCard:currentCard.context??undefined,signal:controller.signal,
        capability:content.group.header.audio,text:content.sentence.text});
      if(!controller.signal.aborted&&expected.isCurrent())onPlayResolvedAudio(url,content.sentence.text);
    }catch{if(!controller.signal.aborted&&expected.isCurrent())setFailed(true);}
    finally{if(audioController.current===controller)audioController.current=null;}
  };

  if(runtime.superseded)return null;
  return <TrainingSessionV2Layout authorityRefreshing={props.authorityRefreshing && !submitting && !exclusion.busy} approvedPresentation={true} phase={loading || translationPending || (candidate && !currentCard.ready && !currentCard.failed) ? "loading" : currentCard.failed || (failed && !candidate) ? "failure" : "ready"}
    chrome={<TrainingSessionChrome approvedPresentation={true} interfaceLanguage={interfaceLanguage} scenario="idiom" mode="word-to-definition" cardFilter="both" sessionName={props.sessionName || t.title} presentation={sessionPresentation} showProgress={!loading && !(failed && !candidate) && !terminal} onHistory={onHistory} onClose={onExit} disabled={submitting || exclusion.busy} />}
    notice={!preparationFailed && (failed || exclusion.failed) ? <TrainingSessionNotice notice={{ kind: "error", message: exclusion.failed ? trainingExclusionCopy[interfaceLanguage].failed : t.failed, retryLabel: t.retry, retryDisabled: submitting || loading, onRetry: () => exclusion.failed ? void exclusion.exclude() : void runtime.retry() }} /> : null}
    footer={<TrainingSessionStatsFooter {...stats} interfaceLanguage={interfaceLanguage} />}>
      {currentCard.enabled && candidate && !loading && !currentCard.ready ? <TrainingSessionState loading={!currentCard.failed} title={currentCard.failed ? t.failed : t.loading}
        action={currentCard.failed ? {label:t.retry,onClick:currentCard.retry} : undefined} /> : null}
      {loading ? <TrainingSessionState loading title={t.loading} /> : null}
      {!loading && translationPending ? <TrainingSessionState title={translationPendingCopy[interfaceLanguage]} action={{label:t.retry,onClick:()=>void runtime.retry()}} secondaryAction={{label:getUiMessages(interfaceLanguage).trainingSession.back,onClick:onExit}} /> : null}
      {preparationFailed ? <TrainingSessionState title={t.failed} announcement="alert"
        action={{label:t.retry,onClick:()=>void runtime.retry(true)}}
        secondaryAction={{label:getUiMessages(interfaceLanguage).trainingSession.back,onClick:onExit}} /> : null}
      {!loading && terminal ? terminal === "complete" ? <TrainingCompletion ownerId={userId} sessionId={session.sessionId} interfaceLanguage={interfaceLanguage} completedCount={completed} onExit={onExit} onRestart={props.onRestart} onEdit={props.onEdit} pending={props.pending} startFailed={props.startFailed} /> : <TrainingSessionState title={t.empty} action={{label:getUiMessages(interfaceLanguage).trainingSession.back,onClick:onExit}} /> : null}
    {!loading && !terminal && currentCard.ready && candidate && content && presentation ? <TrainingExerciseCard currentCard={currentCard.context} entryId={content.entry.entryId} contentLanguage={contentLanguageCode} translationLanguage={translationTargetLanguageCode} key={`${session.sessionId}:${candidate.targetKey}`} presentation={presentation} interfaceLanguage={interfaceLanguage} revealed={revealed} onReveal={() => setRevealed(true)} busy={props.interactionDisabled || submitting || exclusion.busy || exclusion.failed || runtime.actionRetryRequired} onGrade={(result) => {if(!props.interactionDisabled&&currentCard.ready&&!exclusion.busy)void runtime.grade(result);}} onPlayAudio={content.group.header.audio && onPlayResolvedAudio ? () => {void playAudio();} : undefined} onOpenDetails={onOpenDetails ? () => onOpenDetails({ group: content.group, entry: content.entry, ...(currentCard.context ? { currentCard: currentCard.context } : {}) }) : undefined} secondaryActions={<TrainingCardSecondaryActions>{content.entry.reportContentRevision && content.entry.capabilities?.some((cap) => cap.actionId === "report-content") ? <SenseCardReportAction appearance="training-text" snapshot={freezeSenseCardDiagnosticSnapshot({ route: "training", group: content.group, entry: content.entry, target: { kind: "content-node", entryId: content.entry.entryId, contentNodeId: content.sentence.contentNodeId, nodeKind: "example", sourceTextFingerprint: content.sentence.sourceTextFingerprint } })} interfaceLanguage={interfaceLanguage} disabled={props.interactionDisabled || submitting || exclusion.busy || runtime.actionRetryRequired} /> : <span />}{candidate ? <TrainingExcludeAction language={interfaceLanguage} disabled={props.interactionDisabled || submitting || exclusion.busy || runtime.actionRetryRequired} onClick={() => void exclusion.exclude()} /> : null}</TrainingCardSecondaryActions>} /> : null}
  </TrainingSessionV2Layout>;
}
