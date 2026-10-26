"use client";
import {useEntryNoteMaterial} from "../useEntryNoteMaterial";
import { readCurrentTrainingCard, type CurrentTrainingCardContext } from "@/lib/platform/trainingCurrentCardClient";
import { resolveIdiomExerciseContent } from "@/lib/training/idiomExerciseContent";
import { translationPendingCopy } from "@/lib/training/translationPendingCopy";
import React from "react";
import { useTrainingAnswerTranslationPreparation } from "@/components/training/v2/TrainingAnswerTranslation";
import { getUiMessages } from "@/lib/uiMessages";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import type {
  PlatformIdiomExerciseCandidateV2,
  PlatformTrainingExerciseReviewResultV2,
} from "../../../../../packages/shared/types/platformV2";
import type { IdiomExerciseContent } from "@/lib/training/idiomExerciseContent";
import { buildIdiomCardPresentation } from "@/lib/training/idiomCardPresentation";
import { loadIdiomExerciseContent } from "@/lib/training/idiomExerciseLoader";
import {
  requestPlatformV2Translation,
  resolvePlatformV2Audio,
} from "@/lib/platform/platformV2TrainingMediaClient";
import { freezeSenseCardDiagnosticSnapshot } from "@/lib/feedback/diagnosticReportClient";
import { SenseCardReportAction } from "@/components/feedback/SenseCardReportSheet";
import { TrainingCardSecondaryActions } from "../v2/TrainingCardTemplates";
import { TrainingExcludeAction } from "../v2/TrainingExcludeAction";
import { TrainingExerciseCard } from "../v2/TrainingExerciseCard";

/** Non-learning actions reuse Platform services; grades remain with the session. */
export function TrainingIdiomCard({
  currentCard,
  presentationActive=true,
  userId,
  candidate,
  content: initialContent,
  contentLanguageCode,
  translationTargetLanguageCode,
  interfaceLanguage,
  revealed,
  onReveal,
  busy,
  onGrade,
  onExclude,
  onPlayResolvedAudio,
  onOpenDetails,
}: {
  currentCard?:CurrentTrainingCardContext;
  presentationActive?:boolean;
  userId: string;
  candidate: PlatformIdiomExerciseCandidateV2;
  content: IdiomExerciseContent;
  contentLanguageCode: string;
  translationTargetLanguageCode: string | null;
  interfaceLanguage: OnboardingLanguage;
  revealed: boolean;
  onReveal: () => void;
  busy: boolean;
  onGrade: (result: PlatformTrainingExerciseReviewResultV2) => void;
  onExclude?: () => void;
  onPlayResolvedAudio?: (url: string, label: string) => void;
  onOpenDetails?: (details: {
    currentCard?: CurrentTrainingCardContext;
    group: IdiomExerciseContent["group"];
    entry: IdiomExerciseContent["entry"];
  }) => void;
}) {
  const [content, setContent] = React.useState(initialContent);
  const [actionBusy, setActionBusy] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  const [translationPending, setTranslationPending] = React.useState(false);
  const pending = React.useRef<object | null>(null);
  const scope = React.useRef(0);
  const audioController=React.useRef<AbortController|null>(null);
  React.useEffect(()=>()=>audioController.current?.abort(),[userId,currentCard?.sessionId,currentCard?.permitId]);
  React.useEffect(() => {
    scope.current += 1;
    setContent(initialContent);
    setTranslationPending(false);
    setActionBusy(false);
    setFailed(false);
    pending.current = null;
    return () => {
      audioController.current?.abort();
      scope.current += 1;
    };
  }, [initialContent, translationTargetLanguageCode]);
  const noteMaterial=useEntryNoteMaterial({userId,entryId:content.entry.entryId,scope:JSON.stringify([candidate.targetId,currentCard?.sessionId,currentCard?.permitId]),active:presentationActive&&content.entry.noteMaterial!==undefined,busy:busy||actionBusy});
  const presentation = React.useMemo(
    () =>
      buildIdiomCardPresentation({
        content:{...content,entry:{...content.entry,noteMaterial}},
        direction: candidate.direction,
        interfaceLanguage,
        translationTargetLanguageCode,
        repeatCount: candidate.state?.seenCount ?? 0,
      }),
    [content, candidate, interfaceLanguage, translationTargetLanguageCode,noteMaterial],
  );
  const translation = content.entry.capabilities?.find(
    (cap) =>
      cap.actionId === "request-translation" &&
      cap.targetLanguageCode === translationTargetLanguageCode,
  );
  const translationPreparing = useTrainingAnswerTranslationPreparation({
    entry: content.entry,
    currentCard,
    targetLanguageCode: translationTargetLanguageCode,
    paused: busy || actionBusy,
    refresh: async signal => {
      if(currentCard){
        const payload=await readCurrentTrainingCard(userId,{...currentCard,entryId:candidate.entryId,cardTypeId:"word-to-definition",contentLanguageCode,translationTargetLanguageCode},signal);
        if(signal.aborted)return null;
        const next=resolveIdiomExerciseContent(candidate,payload.groups[0]);
        if(!next)throw new Error("translation_content_unavailable");
        setContent(next);setTranslationPending(false);return next.entry;
      }
      const loaded = await loadIdiomExerciseContent({ candidate, contentLanguageCode, translationTargetLanguageCode, signal });
      if (signal.aborted) return null;
      if (loaded.state !== "ready") throw new Error("translation_content_unavailable");
      setContent(loaded.content);
      setTranslationPending(false);
      return loaded.content.entry;
    },
    onStatus: status => { setTranslationPending(status === "pending"); if (status === "failed") setFailed(true); },
  });
  async function run<T>(
    operation: () => Promise<T>,
    accept: (value: T) => void,
  ): Promise<void> {
    if (pending.current || busy) throw new Error("card_action_busy");
    const token = {};
    pending.current = token;
    const generation = scope.current;
    setActionBusy(true);
    setFailed(false);
    try {
      const value = await operation();
      if (generation !== scope.current)
        throw new Error("card_action_superseded");
      accept(value);
    } catch (error) {
      if (generation === scope.current) setFailed(true);
      throw error;
    } finally {
      if (pending.current === token) pending.current = null;
      if (generation === scope.current) setActionBusy(false);
    }
  }

  return (
    <>
      <TrainingExerciseCard
        currentCard={currentCard}
        entryId={content.entry.entryId}
        contentLanguage={contentLanguageCode}
        translationLanguage={translationTargetLanguageCode ?? undefined}
        presentation={presentation}
        interfaceLanguage={interfaceLanguage}
        revealed={revealed}
        onReveal={onReveal}
        busy={busy || actionBusy}
        onGrade={onGrade}
        onPlayAudio={
          content.group?.header.audio && onPlayResolvedAudio
            ? () => {
                const controller=new AbortController();
                audioController.current?.abort();audioController.current=controller;
                void run(
                  () =>
                    resolvePlatformV2Audio({
                      cacheOwnerId: userId,
                      capability: content.group.header.audio!,
                      entryId: content.entry.entryId,
                      sourceVersion: content.entry.sourceVersion,
                      currentCard,
                      signal: controller.signal,
                      text: content.headword,
                    }).catch(error=>{if(controller.signal.aborted)return "";throw error;}),
                  (url) => {if(!controller.signal.aborted)onPlayResolvedAudio(url, content.headword);},
                ).catch(() => undefined);
              }
            : undefined
        }
        onOpenDetails={
          onOpenDetails
            ? () =>
                onOpenDetails({ group: content.group, entry: content.entry, ...(currentCard ? { currentCard } : {}) })
            : undefined
        }
        onRequestTranslation={
          translation?.actionId === "request-translation"
            ? () =>
                run(async () => {
                  if (translationPreparing.current) return { pending: true, content: null };
                  setTranslationPending(false);
                  const status = await requestPlatformV2Translation(translation, { force: true });
                  if (status === "pending") {
                    return { pending: true, content: null };
                  }
                  if (status === "failed") throw new Error("translation_failed");
                  const loaded = await loadIdiomExerciseContent({
                    candidate,
                    contentLanguageCode,
                    translationTargetLanguageCode,
                  });
                  if (loaded.state !== "ready")
                    throw new Error("translation_content_unavailable");
                  return { pending: false, content: loaded.content };
                }, (loaded) => { setTranslationPending(loaded.pending); if (loaded.content) setContent(loaded.content); })
            : undefined
        }
        notice={
          failed ? (
            <p
              role="alert"
              className="shrink-0 text-sm text-rose-600 dark:text-rose-300"
            >
              {getUiMessages(interfaceLanguage).trainingSession.exclusion.failed}
            </p>
          ) : translationPending ? <p role="status" className="shrink-0 text-sm">{translationPendingCopy[interfaceLanguage]}</p> : null
        }
        secondaryActions={
          <TrainingCardSecondaryActions>
            {content.entry.reportContentRevision &&
            content.entry.capabilities?.some(
              (cap) => cap.actionId === "report-content",
            ) ? (
              <SenseCardReportAction
                appearance="training-text"
                snapshot={freezeSenseCardDiagnosticSnapshot({
                  route: "training",
                  group: content.group,
                  entry: content.entry,
                  target: {
                    kind: "content-node",
                    entryId: content.entry.entryId,
                    contentNodeId: content.expression.contentNodeId,
                    nodeKind: "idiom",
                    sourceTextFingerprint:
                      content.expression.sourceTextFingerprint,
                  },
                })}
                interfaceLanguage={interfaceLanguage}
                disabled={busy || actionBusy}
              />
            ) : (
              <span />
            )}
            {onExclude ? (
              <TrainingExcludeAction
                language={interfaceLanguage}
                disabled={busy || actionBusy}
                onClick={onExclude}
              />
            ) : null}
          </TrainingCardSecondaryActions>
        }
      />
    </>
  );
}
