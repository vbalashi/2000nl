"use client";
import React from "react";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import { platformV2Message } from "@/lib/platform/platformV2ClientI18n";
import {
  hasTrainingCardTranslation,
  type TrainingExercisePresentation,
} from "@/lib/training/exerciseCardPresentation";
import { areTrainingHotkeysSuspended } from "../trainingHotkeys";
import { trainingPresentationV1Enabled } from "@/lib/platform/platformV2Rollout";
import { useTrainingPromptReveal } from "@/components/practice/ui/useTrainingPromptReveal";
import { RatingControls, type Rating } from "@/components/practice/RatingControls";
import {
  TrainingCardShell,
  TrainingCardFace,
  TrainingCardAnswerHeader,
  TrainingCardAnswerBody,
  TrainingCardFaceControls,
  TrainingCardReviewButton,
  trainingStageClassName,
  trainingReviewGridClassName,
} from "./TrainingCardTemplates";

type Grade = "fail" | "hard" | "success" | "easy";
const grades = ["fail", "hard", "success", "easy"] as const;
const gradeKeys = { h: "fail", j: "hard", k: "success", l: "easy" } as const;
const ratingGrades: Record<Rating, Grade> = { Again: "fail", Hard: "hard", Good: "success", Easy: "easy" };

/** Presentation only: the session owns target identity, retries, and grade persistence. */
export function TrainingExerciseCard({
  presentation,
  interfaceLanguage,
  revealed,
  onReveal,
  busy,
  onGrade,
  onPlayAudio,
  onOpenDetails,
  onRequestTranslation,
  secondaryActions,
  notice,
}: {
  presentation: TrainingExercisePresentation;
  interfaceLanguage: OnboardingLanguage;
  revealed: boolean;
  onReveal: () => void;
  busy: boolean;
  onGrade: (grade: Grade) => void;
  onPlayAudio?: () => void;
  onOpenDetails?: () => void;
  onRequestTranslation?: () => Promise<void>;
  secondaryActions?: React.ReactNode;
  notice?: React.ReactNode;
}) {
  const [hintVisible, setHintVisible] = React.useState(false);
  const [translationVisible, setTranslationVisible] = React.useState(
    presentation.answerTranslationInitiallyVisible ?? false,
  );
  const stageRef = React.useRef<HTMLElement>(null);
  const revealRef = React.useRef<HTMLButtonElement>(null);
  const firstGradeRef = React.useRef<HTMLButtonElement>(null);
  const source = React.useCallback((root: HTMLElement) => presentation.prompt.kind === "explanation"
    ? root.querySelector<HTMLElement>('[data-testid="reverse-prompt"]')
    : root.querySelector<HTMLElement>('[data-testid="sense-card-headword-lockup"] h2')?.parentElement ?? null,
  [presentation.prompt.kind]);
  const target = React.useCallback((root: HTMLElement) => {
    const content = Array.from(root.querySelectorAll<HTMLElement>("[data-content-node-id]"))
      .find(node => node.dataset.contentNodeId === presentation.promptTarget.contentNodeId);
    return content?.querySelector<HTMLElement>(presentation.promptTarget.kind === "translation"
      ? '[data-content-translation="true"]' : ":scope > div > p") ?? null;
  }, [presentation.promptTarget.contentNodeId, presentation.promptTarget.kind]);
  const { capture, moving } = useTrainingPromptReveal({ root: stageRef, revealed,
    enabled: trainingPresentationV1Enabled(), identity: presentation.promptTarget.contentNodeId, source, target });
  const reveal = () => { capture(); onReveal(); };
  const actionBusy = busy || moving;
  const t = (key: string) => platformV2Message(interfaceLanguage, key);
  const hasTranslation = hasTrainingCardTranslation(presentation.answer);
  const translationAvailable = hasTranslation || Boolean(onRequestTranslation);
  const toggleTranslation = async () => {
    if (actionBusy) return;
    if (!hasTranslation && onRequestTranslation) {
      try {
        await onRequestTranslation();
        setTranslationVisible(true);
      } catch {
        /* The session action boundary owns error/retry UI. */
      }
      return;
    }
    setTranslationVisible((v) => !v);
  };

  React.useEffect(() => {
    stageRef.current?.focus();
  }, []);

  React.useEffect(() => {
    if (revealed && !moving) firstGradeRef.current?.focus();
  }, [revealed, moving]);

  function onKeyDown(event: React.KeyboardEvent) {
    if (
      actionBusy ||
      areTrainingHotkeysSuspended() ||
      event.metaKey ||
      event.ctrlKey ||
      event.altKey ||
      event.shiftKey
    )
      return;
    if (
      event.target instanceof HTMLElement &&
      event.target.closest(
        "input,textarea,select,[contenteditable='true'],[role='textbox']",
      )
    )
      return;
    const key = event.key.toLowerCase();
    // Native button Space/Enter activation must remain intact. Letter shortcuts
    // still work after reveal moves focus to the first grade button.
    const interactive =
      event.target instanceof HTMLElement &&
      event.target.closest("button,a,[role='button']");
    if ((key === " " || key === "enter") && interactive) return;
    if (key === " " && !revealed) {
      event.preventDefault();
      reveal();
    }
    if (key === "i" && !revealed && presentation.hint) {
      event.preventDefault();
      setHintVisible((v) => !v);
    }
    if (key === "t" && revealed && translationAvailable) {
      event.preventDefault();
      void toggleTranslation();
    }
    const grade = gradeKeys[key as keyof typeof gradeKeys];
    if (revealed && grade) {
      event.preventDefault();
      onGrade(grade);
    }
  }

  return (
    <section
      ref={stageRef}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      aria-label={t("senseCard.training.cardChanged")}
      data-testid="training-exercise-card"
      data-side={revealed ? "answer" : "face"}
      data-reveal-moving={moving ? "true" : undefined}
      className={trainingStageClassName()}
    >
      {notice}
      <TrainingCardShell answerVisible={revealed}>
        {revealed ? (
          <>
            <TrainingCardAnswerHeader
              model={presentation.answer}
              translationVisible={translationVisible}
              translationAvailable={translationAvailable}
              translationLabel={t(translationAvailable ? "senseCard.translation.request" : "senseCard.translation.disabled")}
              audioLabel={t("senseCard.audio.play")}
              moreLabel={t("senseCard.wordDetails.open")}
              busy={actionBusy}
              onToggleTranslation={() => void toggleTranslation()}
              onPlayAudio={onPlayAudio}
              onOpenDetails={onOpenDetails}
            />
            <TrainingCardAnswerBody
              model={presentation.answer}
              translationVisible={translationVisible}
              interfaceLanguage={interfaceLanguage}
              onReachEnd={() => firstGradeRef.current?.focus()}
            />
          </>
        ) : (
          <TrainingCardFace
            prompt={presentation.prompt}
            label={presentation.label}
            hint={presentation.hint}
            hintVisible={hintVisible}
            hintLabel={presentation.hint?.label ?? ""}
            contentLabel={t("senseCard.training.content")}
          />
        )}
      </TrainingCardShell>
      <footer className="shrink-0 flex flex-col gap-2">
        {revealed && trainingPresentationV1Enabled() ? (
          <RatingControls language={interfaceLanguage} height="adaptive" disabled={actionBusy}
            label={t("senseCard.sections.reviewPrompt")} firstRef={firstGradeRef}
            options={(Object.keys(ratingGrades) as Rating[]).map(rating => ({ rating, label: t(`senseCard.review.${ratingGrades[rating]}`) }))}
            onRate={rating => onGrade(ratingGrades[rating])} />
        ) : revealed ? (
          <div
            role="group"
            aria-label={t("senseCard.sections.reviewPrompt")}
            className={trainingReviewGridClassName}
          >
            {grades.map((grade, index) => (
              <TrainingCardReviewButton
                key={grade}
                result={grade}
                label={t(`senseCard.review.${grade}`)}
                busy={actionBusy}
                onClick={() => onGrade(grade)}
                buttonRef={index === 0 ? firstGradeRef : undefined}
              />
            ))}
          </div>
        ) : (
          <TrainingCardFaceControls
            busy={actionBusy}
            hintAvailable={Boolean(presentation.hint)}
            hintVisible={hintVisible}
            showHintLabel={t("senseCard.hint.show")}
            hideHintLabel={t("senseCard.hint.hide")}
            showAnswerLabel={t("senseCard.answer.show")}
            onToggleHint={() => setHintVisible((v) => !v)}
            onShowAnswer={reveal}
            showAnswerRef={revealRef}
          />
        )}
        {secondaryActions}
      </footer>
    </section>
  );
}
