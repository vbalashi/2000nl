"use client";
import {useEntryNoteMaterial} from "../useEntryNoteMaterial";
import { useCurrentTrainingCard, usePresentedTrainingCard, type PresentedTrainingCard } from "../v2/useCurrentTrainingCard";
import { readCurrentTrainingCard, type CurrentTrainingCardContext } from "@/lib/platform/trainingCurrentCardClient";
import { useAdditionalTranslationLanguage } from "@/components/practice/article/AdditionalCardTranslation";
import { useLatchedTranslationBuffer } from "../v2/useLatchedTranslationBuffer";
import { useDictionaryTranslationRecovery } from "@/lib/translation/useDictionaryTranslationRecovery";
import { useTrainingAnswerTranslationPreparation } from "@/components/training/v2/TrainingAnswerTranslation";
import { translationPendingCopy } from "@/lib/training/translationPendingCopy";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { getUiMessages } from "@/lib/uiMessages";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import type { PlatformTranslationExerciseCandidateV2, PlatformTranslationExerciseSessionV2, PlatformTrainingExerciseReviewResultV2 } from "../../../../../packages/shared/types/platformV2";
import { resolveSentenceExerciseContent, type SentenceExerciseContent } from "@/lib/training/sentenceExerciseContent";
import { loadSentenceExerciseContent } from "@/lib/training/sentenceExerciseLoader";
import { fetchNextPlatformV2TranslationTrainingSessionExercise, markPlatformV2TranslationTrainingSessionMemberUnavailable, performPlatformV2TranslationExerciseAction } from "@/lib/platform/platformV2TranslationExerciseClient";
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

import { useTrainingExerciseProgress } from "../useTrainingExerciseProgress";
import type { TrainingSessionProgress } from "@/lib/training/sessionLifecycle";

type Props = TrainingCompletionActions & {
  presentationActive?: boolean;
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
  const [candidate, setCandidate] = useState<(PlatformTranslationExerciseCandidateV2 & { ordinal: number }) | null>(null);
  const [content, setContent] = useState<SentenceExerciseContent | null>(null);
  const { completed, accept, finish } = useTrainingExerciseProgress(session, props.onProgress);
  const [revealed, setRevealed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [failed, setFailed] = useState(false);
  const [translationPending, setTranslationPending] = useState(false);
  const loadController = useRef<AbortController | null>(null);
  const audioController=useRef<AbortController|null>(null);
  useEffect(()=>()=>audioController.current?.abort(),[userId,session.sessionId,candidate?.targetId,props.presentationActive]);
  const [terminal, setTerminal] = useState<"complete" | "empty" | null>(session.plannedTotal === 0 ? "empty" : null);
  const eventId = useRef<string | null>(null);
  const generation = useRef(0);
  // A notification callback is not part of the session/content identity.
  // Parent re-renders must not reload the member and hide its revealed answer.
  const supersededCallback = useRef(onSessionSuperseded);
  useEffect(() => { supersededCallback.current = onSessionSuperseded; }, [onSessionSuperseded]);
  const currentCard = useCurrentTrainingCard({ userId, active: props.presentationActive !== false && Boolean(candidate && content) && !loading && !terminal,
    target: candidate && content ? { sessionId: session.sessionId, entryId: candidate.entryId,
      cardTypeId: `${candidate.family}:${candidate.direction}`, targetId: candidate.targetId, direction: candidate.direction,
      sourceVersion: content.entry.sourceVersion ?? 0, stateRevision: candidate.state?.stateRevision ?? "untracked" } : null });
  usePresentedTrainingCard(props.presentationActive !== false && currentCard.ready && currentCard.context && content ? { userId, group: content.group, entry: content.entry, currentCard: currentCard.context } : null, props.onCurrentCardContextChange);
  const currentReadRef = React.useRef<{targetId:string; context:CurrentTrainingCardContext} | null>(null);
  React.useLayoutEffect(()=>{currentReadRef.current = currentCard.context && candidate ? {targetId:candidate.targetId,context:currentCard.context} : null;},[candidate,currentCard.context]);
  const additionalTranslationLanguage = useAdditionalTranslationLanguage();
  useLatchedTranslationBuffer({ ownerId: userId, sessionId: session.sessionId, generation: session.runGeneration, currentEntryId: candidate?.entryId, currentOrdinal: candidate?.ordinal, targetLanguageCode: translationTargetLanguageCode, additionalTargetLanguageCode: additionalTranslationLanguage, members: session.members });
  const stats = useTranslationTrainingStats(session.sessionId, completed);

  const pendingEntryId = useRef<string | null>(null);
  const pendingScope = useRef<string | null>(null);
  const recoveryScope = JSON.stringify([userId, session.sessionId, session.runGeneration, contentLanguageCode, translationTargetLanguageCode]);
  const activeLoad = useRef<number | null>(null);
  const recoveryRequested = useRef(false);
  const loadNext = useCallback(async (force = false, recovery = false) => {
    const readPermit = currentReadRef.current;
    if (recovery && activeLoad.current !== null) {
      recoveryRequested.current = true;
      return;
    }
    recoveryRequested.current = false;
    loadController.current?.abort();
    const controller = new AbortController();
    loadController.current = controller;
    const current = ++generation.current;
    activeLoad.current = current;
    let remainsPending = false;
    if (!recovery) {
      pendingEntryId.current = null; pendingScope.current = null; setTranslationPending(false);
    }
    setLoading(true); setFailed(false); setTerminal(null); setCandidate(null); setContent(null); setRevealed(false);
    try {
      for (let attempt = 0; attempt < 8; attempt++) {
        const next = await fetchNextPlatformV2TranslationTrainingSessionExercise(userId, session.sessionId);
        if (current !== generation.current) return;
        if (next.status === "ready") {
          const loaded = await (async()=>{
            if(!readPermit || readPermit.targetId!==next.targetId)return loadSentenceExerciseContent({candidate:next,contentLanguageCode,translationTargetLanguageCode,signal:controller.signal,force});
            const payload=await readCurrentTrainingCard(userId,{...readPermit.context,entryId:next.entryId,cardTypeId:"word-to-definition",contentLanguageCode,translationTargetLanguageCode},controller.signal);
            const group=payload.groups.find(item=>item.entries.some(entry=>entry.kind==="sense-card"&&entry.entryId===next.entryId));
            const content=group&&resolveSentenceExerciseContent(next,group);
            return content ? {state:"ready" as const,content} : {state:"projection-missing" as const};
          })();
          if (current !== generation.current) return;
          if (loaded.state === "ready") { pendingEntryId.current=null; setCandidate(next); setContent(loaded.content); return; }
          if (loaded.state === "translation-pending") {
            pendingEntryId.current=next.entryId;
            pendingScope.current = recoveryScope;
            remainsPending = true;
            setTranslationPending(true); return;
          }
          if (loaded.state === "translation-unavailable") { setFailed(true); return; }
          await markPlatformV2TranslationTrainingSessionMemberUnavailable(userId, session.sessionId, next.targetId, loaded.state);
          continue;
        }
        if (next.status === "unavailable") {
          await markPlatformV2TranslationTrainingSessionMemberUnavailable(userId, session.sessionId, next.targetId, next.reason);
          continue;
        }
        if (next.status === "completed" || next.status === "exhausted") { const count = finish({ ...next, status: next.status }); setTerminal(count > 0 ? "complete" : "empty"); return; }
        if (next.status === "superseded") { supersededCallback.current?.(); return; }
        setFailed(true); return;
      }
      setFailed(true);
    } catch { if (current === generation.current) setFailed(true); }
    finally {
      if (current === generation.current) {
        activeLoad.current = null;
        setLoading(false);
        if (!remainsPending) {
          pendingEntryId.current = null; pendingScope.current = null; setTranslationPending(false);
        }
        // A hint may arrive while the authoritative read is in flight. Retain
        // one trailing read, without aborting that read or rejoining the topic.
        if (remainsPending && recoveryRequested.current) void loadNext(false, true);
      }
    }
  }, [userId, session.sessionId, contentLanguageCode, translationTargetLanguageCode, finish, recoveryScope]);
  useDictionaryTranslationRecovery({entryId:pendingEntryId.current,targetLanguageCode:translationTargetLanguageCode,enabled:translationPending&&pendingScope.current===recoveryScope&&!submitting,refresh:()=>void loadNext(false, true)});
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
  useEffect(() => {
    const generationRef = generation;
    void loadNext();
    return () => { generationRef.current++; activeLoad.current = null; recoveryRequested.current = false; loadController.current?.abort(); };
  }, [loadNext]);

  const exclusion = useTrainingExclusion({ userId, onSessionSuperseded: onSessionSuperseded ?? onExit, identity: candidate?.targetKey ?? "none", sessionId: session.sessionId, target: { kind: "exercise", targetId: candidate?.targetId ?? "" }, onAccepted: async () => { accept(); await loadNext(); } });
  useRecordedStudyTime({ ownerId: userId, sessionId: session.sessionId, family: "sentence", entryId: candidate?.entryId, targetId: candidate?.targetId,
    enabled: studyTimeEnabled && currentCard.ready && Boolean(candidate && content) && !loading && !terminal && !submitting && !exclusion.busy && !exclusion.failed });
  async function grade(result: PlatformTrainingExerciseReviewResultV2) {
    if (!candidate || !content || submitting || exclusion.busy || !currentCard.ready) return;
    setSubmitting(true); setFailed(false);
    try {
      const clientEventId = eventId.current ?? crypto.randomUUID(); eventId.current = clientEventId;
      await performPlatformV2TranslationExerciseAction({ trainingSessionId: session.sessionId, clientEventId, candidate, reviewResult: result });
      eventId.current = null; accept(); await loadNext();
    } catch { setFailed(true); } finally { setSubmitting(false); }
  }
  const preparationFailed = failed && !candidate && !loading && !terminal;
  const sessionPresentation = { kind: "planned" as const, position: Math.min(completed, session.requestedTotal), total: session.requestedTotal, fraction: session.requestedTotal ? Math.min(completed / session.requestedTotal, 1) : 0 };
  const noteMaterial=useEntryNoteMaterial({userId,entryId:content?.entry.entryId,scope:JSON.stringify([session.sessionId,session.runGeneration,candidate?.targetId]),active:props.presentationActive!==false&&content?.entry.noteMaterial!==undefined,busy:loading||submitting});
  const presentation = content ? buildSentenceCardPresentation({ content:{...content,entry:{...content.entry,noteMaterial}}, interfaceLanguage, translationTargetLanguageCode, repeatCount: candidate?.state?.seenCount ?? 0 }) : null;
  const playAudio=async()=>{
    if(!content?.group.header.audio||!onPlayResolvedAudio||audioController.current)return;
    const controller=new AbortController();audioController.current=controller;
    const expected=generation.current;
    try{
      const url=await resolvePlatformV2Audio({cacheOwnerId:userId,entryId:content.entry.entryId,sourceVersion:content.entry.sourceVersion,
        node:{contentNodeId:content.sentence.contentNodeId,sourceTextFingerprint:content.sentence.sourceTextFingerprint},
        currentCard:currentCard.context??undefined,signal:controller.signal,
        capability:content.group.header.audio,text:content.sentence.text});
      if(!controller.signal.aborted&&expected===generation.current)onPlayResolvedAudio(url,content.sentence.text);
    }catch{if(!controller.signal.aborted&&expected===generation.current)setFailed(true);}
    finally{if(audioController.current===controller)audioController.current=null;}
  };

  return <TrainingSessionV2Layout approvedPresentation={true} phase={loading || translationPending || (candidate && !currentCard.ready && !currentCard.failed) ? "loading" : currentCard.failed || (failed && !candidate) ? "failure" : "ready"}
    chrome={<TrainingSessionChrome approvedPresentation={true} interfaceLanguage={interfaceLanguage} scenario="idiom" mode="word-to-definition" cardFilter="both" sessionName={props.sessionName || t.title} presentation={sessionPresentation} showProgress={!loading && !(failed && !candidate) && !terminal} onHistory={onHistory} onClose={onExit} disabled={submitting || exclusion.busy} />}
    notice={!preparationFailed && (failed || exclusion.failed) ? <TrainingSessionNotice notice={{ kind: "error", message: exclusion.failed ? trainingExclusionCopy[interfaceLanguage].failed : t.failed, retryLabel: t.retry, retryDisabled: submitting || loading, onRetry: () => exclusion.failed ? void exclusion.exclude() : void loadNext() }} /> : null}
    footer={<TrainingSessionStatsFooter {...stats} interfaceLanguage={interfaceLanguage} />}>
      {currentCard.enabled && candidate && !loading && !currentCard.ready ? <TrainingSessionState loading={!currentCard.failed} title={currentCard.failed ? t.failed : t.loading}
        action={currentCard.failed ? {label:t.retry,onClick:currentCard.retry} : undefined} /> : null}
      {loading ? <TrainingSessionState loading title={t.loading} /> : null}
      {!loading && translationPending ? <TrainingSessionState title={translationPendingCopy[interfaceLanguage]} action={{label:t.retry,onClick:()=>void loadNext()}} secondaryAction={{label:getUiMessages(interfaceLanguage).trainingSession.back,onClick:onExit}} /> : null}
      {preparationFailed ? <TrainingSessionState title={t.failed} announcement="alert"
        action={{label:t.retry,onClick:()=>void loadNext(true)}}
        secondaryAction={{label:getUiMessages(interfaceLanguage).trainingSession.back,onClick:onExit}} /> : null}
      {!loading && terminal ? terminal === "complete" ? <TrainingCompletion ownerId={userId} sessionId={session.sessionId} interfaceLanguage={interfaceLanguage} completedCount={completed} onExit={onExit} onRestart={props.onRestart} onEdit={props.onEdit} pending={props.pending} startFailed={props.startFailed} /> : <TrainingSessionState title={t.empty} action={{label:getUiMessages(interfaceLanguage).trainingSession.back,onClick:onExit}} /> : null}
    {!loading && !terminal && currentCard.ready && candidate && content && presentation ? <TrainingExerciseCard currentCard={currentCard.context} entryId={content.entry.entryId} contentLanguage={contentLanguageCode} translationLanguage={translationTargetLanguageCode} key={`${session.sessionId}:${candidate.targetKey}`} presentation={presentation} interfaceLanguage={interfaceLanguage} revealed={revealed} onReveal={() => setRevealed(true)} busy={submitting || exclusion.busy || exclusion.failed} onGrade={(result) => void grade(result)} onPlayAudio={content.group.header.audio && onPlayResolvedAudio ? () => {void playAudio();} : undefined} onOpenDetails={onOpenDetails ? () => onOpenDetails({ group: content.group, entry: content.entry, ...(currentCard.context ? { currentCard: currentCard.context } : {}) }) : undefined} secondaryActions={<TrainingCardSecondaryActions>{content.entry.reportContentRevision && content.entry.capabilities?.some((cap) => cap.actionId === "report-content") ? <SenseCardReportAction appearance="training-text" snapshot={freezeSenseCardDiagnosticSnapshot({ route: "training", group: content.group, entry: content.entry, target: { kind: "content-node", entryId: content.entry.entryId, contentNodeId: content.sentence.contentNodeId, nodeKind: "example", sourceTextFingerprint: content.sentence.sourceTextFingerprint } })} interfaceLanguage={interfaceLanguage} disabled={submitting || exclusion.busy} /> : <span />}{candidate ? <TrainingExcludeAction language={interfaceLanguage} disabled={submitting || exclusion.busy} onClick={() => void exclusion.exclude()} /> : null}</TrainingCardSecondaryActions>} /> : null}
  </TrainingSessionV2Layout>;
}
