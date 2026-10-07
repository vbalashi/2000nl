"use client";
import { hasTrainingCardTranslation as hasTranslation } from "@/lib/training/exerciseCardPresentation";
import { selectTrainingReversePrompt } from "@/lib/training/trainingReversePrompt";

import React from "react";
import { Check, Volume2 } from "lucide-react";
import { areTrainingHotkeysSuspended } from "../trainingHotkeys";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import type { TrainingMode } from "@/lib/types";
import { platformV2Message } from "@/lib/platform/platformV2ClientI18n";
import { trainingPresentationV1Enabled } from "@/lib/platform/platformV2Rollout";
import { senseCardQuietAction } from "../SenseCardChrome";
import approvedCard from "../approvedTrainingCard.module.css";
import { RatingControls, type Rating } from "@/components/practice/RatingControls";
import { useTranslationSwipe } from "@/components/practice/ui/useTranslationSwipe";
import { useTrainingPromptReveal } from "@/components/practice/ui/useTrainingPromptReveal";
import {
  TrainingCardAnswerHeader as EntityHeader,
  TrainingCardAnswerBody as AnswerBody,
  TrainingCardFace,
  TrainingCardShell,
  TrainingCardSecondaryActions as SecondaryActionRow,
  TrainingCardFaceControls,
  TrainingCardReviewButton,
  TrainingCardIconButton as IconButton,
  trainingStageClassName,
  trainingReviewGridClassName,
} from "./TrainingCardTemplates";
import type { PlatformSenseCardCapabilityV2 } from "../../../../../packages/shared/types/platformV2";
import type { TrainingSenseCardModel } from "./trainingSenseCardModel";
import type { WordContextPrompt } from "@/lib/training/wordContextPrompt";

type Props = {
  model: TrainingSenseCardModel;
  contextPrompt?: WordContextPrompt;
  onHintOpened?: () => void;
  mode: TrainingMode;
  interfaceLanguage: OnboardingLanguage;
  contentLanguage?: string;
  translationLanguage?: string;
  busy?: boolean;
  focusOnMount?: boolean;
  onPlayAudio?: () => void;
  onOpenDetails?: () => void;
  reportAction?: React.ReactNode;
  exclusionAction?: React.ReactNode;
  side: "face" | "answer";
  onSideChange: (side: "face" | "answer") => void;
  onAction: (capability: PlatformSenseCardCapabilityV2) => void;
};

export function TrainingSenseCardStage({
  model,
  contextPrompt,
  onHintOpened,
  mode,
  interfaceLanguage,
  contentLanguage,
  translationLanguage,
  busy = false,
  focusOnMount = false,
  onPlayAudio,
  onOpenDetails,
  reportAction,
  exclusionAction,
  side,
  onSideChange,
  onAction,
}: Props) {
  const answerVisible = side === "answer";
  const [hintVisible, setHintVisible] = React.useState(false);
  const toggleHint = React.useCallback(() => {
    if (!hintVisible) onHintOpened?.();
    setHintVisible(!hintVisible);
  }, [hintVisible, onHintOpened]);
  const [translationVisible, setTranslationVisible] = React.useState(false);
  const stageRef = React.useRef<HTMLElement>(null);
  const primaryAnswerActionRef = React.useRef<HTMLButtonElement>(null);
  const showAnswerRef = React.useRef<HTMLButtonElement>(null);
  const previousAnswerVisibleRef = React.useRef(answerVisible);
  const [announcement, setAnnouncement] = React.useState("");
  const t = React.useCallback(
    (key: string) => platformV2Message(interfaceLanguage, key),
    [interfaceLanguage],
  );
  const reversePrompt = selectTrainingReversePrompt([
    ...model.definitions,
    ...model.examples,
  ]);
  const hint = contextPrompt
    ? reversePrompt?.kind === "definition" ? reversePrompt : undefined
    : model.examples[0];
  const selectedExample = contextPrompt
    ? model.examples.find((item) => item.contentNodeId === contextPrompt.contentNodeId)
    : undefined;
  const answerModel = contextPrompt
    ? {
        ...model,
        examples: [{
          ...selectedExample,
          contentNodeId: contextPrompt.contentNodeId,
          parentContentNodeId: selectedExample?.parentContentNodeId ?? null,
          kind: "example" as const,
          text: contextPrompt.sourceText,
          translation: contextPrompt.text,
          children: selectedExample?.children ?? [],
        }],
      }
    : model;
  const translationActionAvailable = Boolean(
    model.requestTranslationCapability,
  );
  const contextTarget = contextPrompt ? model.entryTranslation?.trim() : undefined;
  const listeningMode = mode === "listen-recognize";
  const approvedPresentation = trainingPresentationV1Enabled();
  const { capture, moving } = useTrainingPromptReveal({ root: stageRef, revealed: answerVisible,
    enabled: approvedPresentation && !listeningMode, identity: model.entryId });
  const revealAnswer = React.useCallback(() => { capture(); onSideChange("answer"); }, [capture, onSideChange]);
  const toggleTranslation = React.useCallback(() => {
    if (busy || moving) return;
    if (!hasTranslation(model) && model.requestTranslationCapability) {
      setTranslationVisible(true); onAction(model.requestTranslationCapability); return;
    }
    setTranslationVisible(visible => !visible);
  }, [busy, moving, model, onAction]);
  useTranslationSwipe({ root: stageRef, enabled: answerVisible && !busy && !moving && (hasTranslation(model) || translationActionAvailable), onToggle: toggleTranslation });


  React.useEffect(() => {
    if (!focusOnMount) return;
    window.requestAnimationFrame(() => stageRef.current?.focus());
  }, [focusOnMount]);

  React.useEffect(() => {
    setHintVisible(false);
    setTranslationVisible(false);
  }, [model.entryId]);

  React.useEffect(() => {
    if (previousAnswerVisibleRef.current === answerVisible) return;
    previousAnswerVisibleRef.current = answerVisible;
    setAnnouncement(
      t(
        answerVisible ? "senseCard.answer.revealed" : "senseCard.answer.hidden",
      ),
    );
    window.requestAnimationFrame(() => {
      if (answerVisible && !moving) {
        primaryAnswerActionRef.current?.focus();
      } else showAnswerRef.current?.focus();
    });
  }, [answerVisible, t, moving]);
  React.useEffect(() => {
    if (answerVisible && !moving) primaryAnswerActionRef.current?.focus();
  }, [answerVisible, moving]);

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (areTrainingHotkeysSuspended()) return;
      if (event.metaKey || event.ctrlKey || event.altKey || busy || moving) {
        return;
      }
      const targetInsideStage =
        event.target instanceof Node &&
        stageRef.current?.contains(event.target);
      if (isInteractiveTarget(event.target)) return;
      if (
        event.key === " " &&
        !event.shiftKey &&
        !isTextEntryTarget(event.target) &&
        targetInsideStage
      ) {
        event.preventDefault();
        if (answerVisible) onSideChange("face"); else revealAnswer();
        return;
      }
      const key = event.key.toLowerCase();
      if (key === "i" && !event.shiftKey && !answerVisible && hint) {
        event.preventDefault();
        toggleHint();
        return;
      }
      if (key === "t" && answerVisible && hasTranslation(model)) {
        event.preventDefault();
        setTranslationVisible((visible) => !visible);
        return;
      }
      if (!answerVisible) return;
      const reviewResult = (
        {
          h: "fail",
          j: "hard",
          k: "success",
          l: "easy",
        } as const
      )[key as "h" | "j" | "k" | "l"];
      const capability = model.reviewCapabilities.find(
        (candidate) => candidate.reviewResult === reviewResult,
      );
      if (!capability) return;
      event.preventDefault();
      onAction(capability);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [answerVisible, busy, moving, hint, model, onAction, onSideChange, revealAnswer, toggleHint]);

  return (
    <section
      ref={stageRef}
      tabIndex={-1}
      aria-label={t("senseCard.training.cardChanged")}
      data-testid="training-sense-card-stage"
      data-side={answerVisible ? "answer" : "face"}
      data-reveal-moving={moving ? "true" : undefined}
      data-visual-spec={approvedPresentation ? "training-approved-v1" : "training-v1.0"}
      className={trainingStageClassName()}
    >
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </span>
      <TrainingCardShell answerVisible={answerVisible}>
        {model.audioCapability &&
        onPlayAudio &&
        mode === "word-to-definition" &&
        !answerVisible ? (
          <div
            data-testid="training-card-audio-corner"
            className="absolute right-[18px] top-[18px] z-20"
          >
            <IconButton
              label={t("senseCard.audio.play")}
              disabled={busy}
              onClick={onPlayAudio}
            >
              <Volume2 aria-hidden="true" className="h-5 w-5" />
            </IconButton>
          </div>
        ) : null}
        {answerVisible ? (
          <>
            <EntityHeader
              model={model}
              translationVisible={translationVisible}
              translationAvailable={
                hasTranslation(model) || translationActionAvailable
              }
              translationLabel={t(hasTranslation(model) || translationActionAvailable ? "senseCard.translation.request" : "senseCard.translation.disabled")}
              audioLabel={t("senseCard.audio.play")}
              busy={busy || moving}
              moreLabel={t("senseCard.wordDetails.open")}
              onPlayAudio={onPlayAudio}
              onToggleTranslation={toggleTranslation}
              onOpenDetails={onOpenDetails}
            />
            <AnswerBody
              contentLanguage={contentLanguage}
              translationLanguage={translationLanguage}
              model={answerModel}
              translationVisible={Boolean(contextPrompt) || translationVisible}
              interfaceLanguage={interfaceLanguage}
              onReachEnd={() => primaryAnswerActionRef.current?.focus()}
            />
          </>
        ) : mode === "listen-recognize" ? (
          <ListeningFaceBody
            mode={mode}
            interfaceLanguage={interfaceLanguage}
            onPlayAudio={onPlayAudio}
            busy={busy || moving}
            contentLabel={t("senseCard.training.content")}
          />
        ) : (
          <TrainingCardFace
            prompt={
              mode === "definition-to-word"
                ? { kind: "explanation", text: contextPrompt?.text ?? reversePrompt?.text ?? "" }
                : {
                    kind: "expression",
                    text: model.headword,
                    article: model.article,
                  }
            }
            hint={hint}
            hintVisible={hintVisible}
            label={contextPrompt ? (contextTarget ? {
              en: "Recall the Dutch word for", nl: "Herinner je het Nederlandse woord voor", ru: "Вспомните нидерландское слово для",
            } : {
              en: "Recall the Dutch word in this sentence", nl: "Herinner je het Nederlandse woord in deze zin", ru: "Вспомните нидерландское слово в этом предложении",
            })[interfaceLanguage] : mode === "definition-to-word" ? {
              en: "Recall the Dutch word from its meaning", nl: "Herinner je het Nederlandse woord bij deze betekenis", ru: "Вспомните нидерландское слово по значению",
            }[interfaceLanguage] : undefined}
            partOfSpeech={mode === "definition-to-word" ? model.partOfSpeech : undefined}
            recallTarget={contextTarget}
            contextLabel={contextPrompt ? { en: "In this sentence", nl: "In deze zin", ru: "В этом предложении" }[interfaceLanguage] : undefined}
            hintLabel={contextPrompt ? t("senseCard.sections.definition") : t("senseCard.hint.example")}
            contentLabel={t("senseCard.training.content")}
          />
        )}
      </TrainingCardShell>

      <footer
        data-testid="training-sense-card-dock"
        className={`shrink-0 ${
          answerVisible
            ? model.reviewCapabilities.length
              ? approvedPresentation
                ? "min-h-[78px]"
                : "h-[120px] min-h-[120px] sm:h-[76px] sm:min-h-[76px]"
              : "h-[76px] min-h-[76px]"
            : reportAction || exclusionAction || model.markKnownCapability
              ? "h-[76px] min-h-[76px]"
              : "h-11 min-h-11"
        }`}
      >
        {answerVisible ? (
          <AnswerDock
            model={model}
            mode={mode}
            busy={busy || moving}
            interfaceLanguage={interfaceLanguage}
            primaryActionRef={primaryAnswerActionRef}
            onAction={onAction}
            reportAction={reportAction}
            exclusionAction={exclusionAction}
            approvedPresentation={approvedPresentation}
          />
        ) : (
          <FaceDock
            model={model}
            busy={busy}
            interfaceLanguage={interfaceLanguage}
            hintAvailable={!listeningMode && Boolean(hint)}
            hintVisible={hintVisible}
            showHintLabel={t("senseCard.hint.show")}
            hideHintLabel={t("senseCard.hint.hide")}
            showAnswerLabel={t("senseCard.answer.show")}
            onToggleHint={toggleHint}
            onShowAnswer={revealAnswer}
            showAnswerRef={showAnswerRef}
            onAction={onAction}
            reportAction={reportAction}
            exclusionAction={exclusionAction}
          />
        )}
      </footer>
    </section>
  );
}

function ListeningFaceBody({
  mode,
  interfaceLanguage,
  onPlayAudio,
  busy,
  contentLabel,
}: {
  mode: "listen-recognize";
  interfaceLanguage: OnboardingLanguage;
  onPlayAudio?: () => void;
  busy: boolean;
  contentLabel: string;
}) {
  const t = (key: string) => platformV2Message(interfaceLanguage, key);
  return (
    <div
      data-testid="training-listening-face"
      data-listening-mode={mode}
      role="region"
      aria-label={contentLabel}
      className="min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-[14px] outline-none [scrollbar-width:thin]"
    >
      <div className="flex min-h-full flex-col items-center justify-center gap-5 p-[18px] text-center">
        {onPlayAudio ? (
          <IconButton
            label={t("senseCard.audio.play")}
            disabled={busy}
            onClick={onPlayAudio}
          >
            <Volume2 aria-hidden="true" className="h-9 w-9" />
          </IconButton>
        ) : null}
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
            {t("senseCard.listening.label")}
          </p>
          <p className="text-xl font-semibold text-slate-800 dark:text-slate-100">
            {t("senseCard.listening.prompt")}
          </p>
        </div>
      </div>
    </div>
  );
}

function FaceDock({
  model,
  busy,
  interfaceLanguage,
  hintAvailable,
  hintVisible,
  showHintLabel,
  hideHintLabel,
  showAnswerLabel,
  onToggleHint,
  onShowAnswer,
  showAnswerRef,
  onAction,
  reportAction,
  exclusionAction,
}: {
  model: TrainingSenseCardModel;
  busy: boolean;
  interfaceLanguage: OnboardingLanguage;
  hintAvailable: boolean;
  hintVisible: boolean;
  showHintLabel: string;
  hideHintLabel: string;
  showAnswerLabel: string;
  onToggleHint: () => void;
  onShowAnswer: () => void;
  showAnswerRef: React.RefObject<HTMLButtonElement>;
  onAction: (capability: PlatformSenseCardCapabilityV2) => void;
  reportAction?: React.ReactNode;
  exclusionAction?: React.ReactNode;
}) {
  const t = (key: string) => platformV2Message(interfaceLanguage, key);

  return (
    <div className="flex h-full flex-col gap-[6px]">
      <TrainingCardFaceControls
        {...{
          busy,
          hintAvailable,
          hintVisible,
          showHintLabel,
          hideHintLabel,
          showAnswerLabel,
          onToggleHint,
          onShowAnswer,
          showAnswerRef,
        }}
      />
      {reportAction || exclusionAction || model.markKnownCapability ? (
        <SecondaryActionRow>
          {reportAction ?? <span />}
          {exclusionAction ??
            (model.markKnownCapability ? (
              <MarkKnownAction
                capability={model.markKnownCapability}
                busy={busy}
                label={t(model.markKnownCapability.messageKey)}
                onAction={onAction}
              />
            ) : null)}
        </SecondaryActionRow>
      ) : null}
    </div>
  );
}

const reviewRating: Record<TrainingSenseCardModel["reviewCapabilities"][number]["reviewResult"], Rating> = {
  fail: "Again",
  hard: "Hard",
  success: "Good",
  easy: "Easy",
};

function AnswerDock({
  model,
  mode,
  busy,
  interfaceLanguage,
  primaryActionRef,
  onAction,
  reportAction,
  exclusionAction,
  approvedPresentation,
}: {
  model: TrainingSenseCardModel;
  mode: TrainingMode;
  busy: boolean;
  interfaceLanguage: OnboardingLanguage;
  primaryActionRef: React.RefObject<HTMLButtonElement>;
  onAction: (capability: PlatformSenseCardCapabilityV2) => void;
  reportAction?: React.ReactNode;
  exclusionAction?: React.ReactNode;
  approvedPresentation: boolean;
}) {
  const t = (key: string) => platformV2Message(interfaceLanguage, key);
  const reviewCapabilities =
    mode === "listen-recognize"
      ? model.reviewCapabilities.filter(
          (capability) =>
            capability.reviewResult === "fail" ||
            capability.reviewResult === "success",
        )
      : model.reviewCapabilities;

  if (model.isKnown && model.undoKnownCapability) {
    if (approvedPresentation) return (
      <div className={approvedCard.known}>
        <span className="inline-flex items-center gap-2">
          <Check aria-hidden="true" className="h-4 w-4" /> {t("senseCard.known.marked")}
        </span>
        <button ref={primaryActionRef} type="button" disabled={busy} onClick={() => onAction(model.undoKnownCapability!)}>
          {t(model.undoKnownCapability.messageKey)}
        </button>
      </div>
    );
    return (
      <div className="flex min-h-12 flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-400/60 bg-emerald-50 px-4 py-2 text-sm dark:bg-[#18352b]">
        <span className="inline-flex items-center gap-2 font-semibold text-emerald-700 dark:text-emerald-200">
          <Check aria-hidden="true" className="h-4 w-4" />{" "}
          {t("senseCard.known.marked")}
        </span>
        <button
          ref={primaryActionRef}
          type="button"
          disabled={busy}
          onClick={() => onAction(model.undoKnownCapability!)}
          className="text-indigo-700 hover:text-indigo-900 disabled:opacity-50 dark:text-indigo-200 dark:hover:text-white"
        >
          {t(model.undoKnownCapability.messageKey)}
        </button>
      </div>
    );
  }

  const reviewLabel = (capability: (typeof reviewCapabilities)[number]) =>
    mode === "listen-recognize"
      ? t(capability.reviewResult === "fail" ? "senseCard.listening.fail" : "senseCard.listening.success")
      : t(capability.messageKey);

  return (
    <div className={approvedPresentation ? approvedCard.dock : "flex h-full flex-col gap-2"}>
      {model.learnCapability ? (
        <button
          ref={primaryActionRef}
          type="button"
          disabled={busy}
          onClick={() => onAction(model.learnCapability!)}
          className={approvedPresentation ? approvedCard.primary : "mx-auto block h-11 shrink-0 w-[94%] rounded-xl border border-indigo-400/60 bg-indigo-600 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 dark:bg-[#292650] dark:text-indigo-100 dark:hover:bg-[#332f60]"}
        >
          {t(model.learnCapability.messageKey)}
        </button>
      ) : null}

      {reviewCapabilities.length && approvedPresentation ? (
        <div data-testid="training-review-grid" className="shrink-0">
          <RatingControls
            language={interfaceLanguage}
            height="adaptive"
            disabled={busy}
            label={t("senseCard.sections.reviewPrompt")}
            firstRef={primaryActionRef}
            options={reviewCapabilities.map((capability) => ({
              rating: reviewRating[capability.reviewResult],
              label: reviewLabel(capability),
            }))}
            onRate={(rating) => {
              const capability = reviewCapabilities.find((candidate) => reviewRating[candidate.reviewResult] === rating);
              if (capability) onAction(capability);
            }}
          />
        </div>
      ) : reviewCapabilities.length ? (
        <div
          role="group"
          aria-label={t("senseCard.sections.reviewPrompt")}
          className="flex shrink-0 flex-col"
        >
          <div
            data-testid="training-review-grid"
            className={trainingReviewGridClassName}
          >
            {reviewCapabilities.map((capability, index) => (
              <TrainingCardReviewButton
                key={capability.reviewResult}
                result={capability.reviewResult}
                buttonRef={index === 0 ? primaryActionRef : undefined}
                busy={busy}
                onClick={() => onAction(capability)}
                label={reviewLabel(capability)}
              />
            ))}
          </div>
        </div>
      ) : null}

      <SecondaryActionRow>
        {reportAction ?? <span />}
        {exclusionAction ??
          (model.markKnownCapability ? (
            <MarkKnownAction
              capability={model.markKnownCapability}
              busy={busy}
              label={t(model.markKnownCapability.messageKey)}
              onAction={onAction}
            />
          ) : null)}
      </SecondaryActionRow>
    </div>
  );
}

function MarkKnownAction({
  capability,
  busy,
  label,
  onAction,
}: {
  capability: NonNullable<TrainingSenseCardModel["markKnownCapability"]>;
  busy: boolean;
  label: string;
  onAction: (capability: PlatformSenseCardCapabilityV2) => void;
}) {
  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => onAction(capability)}
      className={senseCardQuietAction()}
    >
      <Check aria-hidden="true" className="h-4 w-4" /> {label}
    </button>
  );
}

function isInteractiveTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    Boolean(
      target.closest(
        "button, a, input, textarea, select, summary, [role='button'], [contenteditable='true']",
      ),
    )
  );
}

function isTextEntryTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    Boolean(
      target.closest(
        "input, textarea, select, [contenteditable='true'], [role='textbox']",
      ),
    )
  );
}
