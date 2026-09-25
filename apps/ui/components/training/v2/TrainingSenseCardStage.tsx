"use client";
import { hasTrainingCardTranslation as hasTranslation } from "@/lib/training/exerciseCardPresentation";
import { selectTrainingReversePrompt } from "@/lib/training/trainingReversePrompt";

import React from "react";
import { Check, Volume2 } from "lucide-react";
import { areTrainingHotkeysSuspended } from "../trainingHotkeys";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import type { TrainingMode } from "@/lib/types";
import { platformV2Message } from "@/lib/platform/platformV2ClientI18n";
import { senseCardQuietActionClassName } from "../SenseCardChrome";
import {
  TrainingCardAnswerHeader as EntityHeader,
  TrainingCardAnswerBody as AnswerBody,
  TrainingCardFace,
  TrainingCardShell,
  TrainingCardSecondaryActions as SecondaryActionRow,
  TrainingCardFaceControls,
  TrainingCardReviewButton,
  TrainingCardIconButton as IconButton,
  trainingCardStageClassName,
  trainingReviewGridClassName,
} from "./TrainingCardTemplates";
import type { PlatformSenseCardCapabilityV2 } from "../../../../../packages/shared/types/platformV2";
import type { TrainingSenseCardModel } from "./trainingSenseCardModel";

type Props = {
  model: TrainingSenseCardModel;
  mode: TrainingMode;
  interfaceLanguage: OnboardingLanguage;
  busy?: boolean;
  focusOnMount?: boolean;
  onPlayAudio?: () => void;
  onOpenDetails?: () => void;
  reportAction?: React.ReactNode;
  side: "face" | "answer";
  onSideChange: (side: "face" | "answer") => void;
  onAction: (capability: PlatformSenseCardCapabilityV2) => void;
};

export function TrainingSenseCardStage({
  model,
  mode,
  interfaceLanguage,
  busy = false,
  focusOnMount = false,
  onPlayAudio,
  onOpenDetails,
  reportAction,
  side,
  onSideChange,
  onAction,
}: Props) {
  const answerVisible = side === "answer";
  const [hintVisible, setHintVisible] = React.useState(false);
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
  const hint = model.examples[0];
  const reversePrompt = selectTrainingReversePrompt([
    ...model.definitions,
    ...model.examples,
  ]);
  const translationActionAvailable = Boolean(
    model.requestTranslationCapability,
  );
  const listeningMode = mode === "listen-recognize";

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
      if (answerVisible) {
        primaryAnswerActionRef.current?.focus();
      } else showAnswerRef.current?.focus();
    });
  }, [answerVisible, t]);

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (areTrainingHotkeysSuspended()) return;
      if (event.metaKey || event.ctrlKey || event.altKey || busy) {
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
        onSideChange(answerVisible ? "face" : "answer");
        return;
      }
      const key = event.key.toLowerCase();
      if (key === "i" && !event.shiftKey && !answerVisible && hint) {
        event.preventDefault();
        setHintVisible((visible) => !visible);
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
  }, [answerVisible, busy, hint, model, onAction, onSideChange]);

  return (
    <section
      ref={stageRef}
      tabIndex={-1}
      aria-label={t("senseCard.training.cardChanged")}
      data-testid="training-sense-card-stage"
      data-side={answerVisible ? "answer" : "face"}
      data-visual-spec="training-v1.0"
      className={trainingCardStageClassName}
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
              translationLabel={t("senseCard.translation.request")}
              audioLabel={t("senseCard.audio.play")}
              busy={busy}
              moreLabel={t("senseCard.wordDetails.open")}
              onPlayAudio={onPlayAudio}
              onToggleTranslation={() => {
                if (
                  !hasTranslation(model) &&
                  model.requestTranslationCapability
                ) {
                  setTranslationVisible(true);
                  onAction(model.requestTranslationCapability);
                  return;
                }
                setTranslationVisible((visible) => !visible);
              }}
              onOpenDetails={onOpenDetails}
            />
            <AnswerBody
              model={model}
              translationVisible={translationVisible}
              interfaceLanguage={interfaceLanguage}
              onReachEnd={() => primaryAnswerActionRef.current?.focus()}
            />
          </>
        ) : mode === "listen-recognize" ? (
          <ListeningFaceBody
            mode={mode}
            interfaceLanguage={interfaceLanguage}
            onPlayAudio={onPlayAudio}
            busy={busy}
            contentLabel={t("senseCard.training.content")}
          />
        ) : (
          <TrainingCardFace
            prompt={
              mode === "definition-to-word"
                ? { kind: "explanation", text: reversePrompt?.text ?? "" }
                : {
                    kind: "expression",
                    text: model.headword,
                    article: model.article,
                  }
            }
            hint={hint}
            hintVisible={hintVisible}
            hintLabel={t("senseCard.hint.example")}
            contentLabel={t("senseCard.training.content")}
          />
        )}
      </TrainingCardShell>

      <footer
        data-testid="training-sense-card-dock"
        className={`shrink-0 ${
          answerVisible
            ? model.reviewCapabilities.length
              ? "h-[120px] min-h-[120px] sm:h-[76px] sm:min-h-[76px]"
              : "h-[76px] min-h-[76px]"
            : reportAction || model.markKnownCapability
              ? "h-[76px] min-h-[76px]"
              : "h-11 min-h-11"
        }`}
      >
        {answerVisible ? (
          <AnswerDock
            model={model}
            mode={mode}
            busy={busy}
            interfaceLanguage={interfaceLanguage}
            primaryActionRef={primaryAnswerActionRef}
            onAction={onAction}
            reportAction={reportAction}
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
            onToggleHint={() => setHintVisible((visible) => !visible)}
            onShowAnswer={() => onSideChange("answer")}
            showAnswerRef={showAnswerRef}
            onAction={onAction}
            reportAction={reportAction}
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
      {reportAction || model.markKnownCapability ? (
        <SecondaryActionRow>
          {reportAction ?? <span />}
          {model.markKnownCapability ? (
            <MarkKnownAction
              capability={model.markKnownCapability}
              busy={busy}
              label={t(model.markKnownCapability.messageKey)}
              onAction={onAction}
            />
          ) : null}
        </SecondaryActionRow>
      ) : null}
    </div>
  );
}

function AnswerDock({
  model,
  mode,
  busy,
  interfaceLanguage,
  primaryActionRef,
  onAction,
  reportAction,
}: {
  model: TrainingSenseCardModel;
  mode: TrainingMode;
  busy: boolean;
  interfaceLanguage: OnboardingLanguage;
  primaryActionRef: React.RefObject<HTMLButtonElement>;
  onAction: (capability: PlatformSenseCardCapabilityV2) => void;
  reportAction?: React.ReactNode;
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

  return (
    <div className="flex h-full flex-col gap-2">
      {model.learnCapability ? (
        <button
          ref={primaryActionRef}
          type="button"
          disabled={busy}
          onClick={() => onAction(model.learnCapability!)}
          className="mx-auto block h-11 shrink-0 w-[94%] rounded-xl border border-indigo-400/60 bg-indigo-600 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 dark:bg-[#292650] dark:text-indigo-100 dark:hover:bg-[#332f60]"
        >
          {t(model.learnCapability.messageKey)}
        </button>
      ) : null}

      {reviewCapabilities.length ? (
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
                label={
                  mode === "listen-recognize"
                    ? t(
                        capability.reviewResult === "fail"
                          ? "senseCard.listening.fail"
                          : "senseCard.listening.success",
                      )
                    : t(capability.messageKey)
                }
              />
            ))}
          </div>
        </div>
      ) : null}

      <SecondaryActionRow>
        {reportAction ?? <span />}
        {model.markKnownCapability ? (
          <MarkKnownAction
            capability={model.markKnownCapability}
            busy={busy}
            label={t(model.markKnownCapability.messageKey)}
            onAction={onAction}
          />
        ) : null}
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
      className={senseCardQuietActionClassName}
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
