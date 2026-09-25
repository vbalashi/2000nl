"use client";
import React from "react";
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
    group: IdiomExerciseContent["group"];
    entry: IdiomExerciseContent["entry"];
  }) => void;
}) {
  const [content, setContent] = React.useState(initialContent);
  const [actionBusy, setActionBusy] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  const pending = React.useRef<object | null>(null);
  const scope = React.useRef(0);
  React.useEffect(() => {
    scope.current += 1;
    setContent(initialContent);
    setActionBusy(false);
    setFailed(false);
    pending.current = null;
    return () => {
      scope.current += 1;
    };
  }, [initialContent, translationTargetLanguageCode]);
  const presentation = React.useMemo(
    () =>
      buildIdiomCardPresentation({
        content,
        direction: candidate.direction,
        interfaceLanguage,
        translationTargetLanguageCode,
        repeatCount: candidate.state?.seenCount ?? 0,
      }),
    [content, candidate, interfaceLanguage, translationTargetLanguageCode],
  );
  const translation = content.entry.capabilities?.find(
    (cap) =>
      cap.actionId === "request-translation" &&
      cap.targetLanguageCode === translationTargetLanguageCode,
  );
  const reportEntry = React.useMemo(
    () => ({
      ...content.entry,
      card: null,
      translation: null,
      contentNodes: [
        content.expression,
        content.explanation,
        ...content.examples,
      ],
    }),
    [content],
  );

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
        presentation={presentation}
        interfaceLanguage={interfaceLanguage}
        revealed={revealed}
        onReveal={onReveal}
        busy={busy || actionBusy}
        onGrade={onGrade}
        onPlayAudio={
          content.group?.header.audio && onPlayResolvedAudio
            ? () => {
                void run(
                  () =>
                    resolvePlatformV2Audio({
                      cacheOwnerId: userId,
                      capability: content.group.header.audio!,
                      text: content.headword,
                    }),
                  (url) => onPlayResolvedAudio(url, content.headword),
                ).catch(() => undefined);
              }
            : undefined
        }
        onOpenDetails={
          onOpenDetails
            ? () =>
                onOpenDetails({ group: content.group, entry: content.entry })
            : undefined
        }
        onRequestTranslation={
          translation?.actionId === "request-translation"
            ? () =>
                run(async () => {
                  await requestPlatformV2Translation(translation);
                  const loaded = await loadIdiomExerciseContent({
                    candidate,
                    contentLanguageCode,
                    translationTargetLanguageCode,
                  });
                  if (loaded.state !== "ready")
                    throw new Error("translation_content_unavailable");
                  return loaded.content;
                }, setContent)
            : undefined
        }
        notice={
          failed ? (
            <p
              role="alert"
              className="shrink-0 text-sm text-rose-600 dark:text-rose-300"
            >
              {
                {
                  en: "The action failed. Please try the button again.",
                  nl: "De actie is mislukt. Probeer de knop opnieuw.",
                  ru: "Не удалось выполнить действие. Нажмите кнопку ещё раз.",
                }[interfaceLanguage]
              }
            </p>
          ) : null
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
                  entry: reportEntry,
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
