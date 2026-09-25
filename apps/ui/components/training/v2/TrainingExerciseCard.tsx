"use client";
import React from "react";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import { platformV2Message } from "@/lib/platform/platformV2ClientI18n";
import {
  hasTrainingCardTranslation,
  type TrainingExercisePresentation,
} from "@/lib/training/exerciseCardPresentation";
import { areTrainingHotkeysSuspended } from "../trainingHotkeys";
import {
  TrainingCardShell,
  TrainingCardFace,
  TrainingCardAnswerHeader,
  TrainingCardAnswerBody,
  TrainingCardFaceControls,
  TrainingCardReviewButton,
  trainingCardStageClassName,
  trainingReviewGridClassName,
} from "./TrainingCardTemplates";

type Grade = "fail" | "hard" | "success" | "easy";
const grades = ["fail", "hard", "success", "easy"] as const;
const gradeKeys = { h: "fail", j: "hard", k: "success", l: "easy" } as const;

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
  const [translationVisible, setTranslationVisible] = React.useState(false);
  const stageRef = React.useRef<HTMLElement>(null);
  const revealRef = React.useRef<HTMLButtonElement>(null);
  const firstGradeRef = React.useRef<HTMLButtonElement>(null);
  const t = (key: string) => platformV2Message(interfaceLanguage, key);
  const hasTranslation = hasTrainingCardTranslation(presentation.answer);
  const translationAvailable = hasTranslation || Boolean(onRequestTranslation);
  const toggleTranslation = async () => {
    if (busy) return;
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
    if (revealed) firstGradeRef.current?.focus();
  }, [revealed]);

  function onKeyDown(event: React.KeyboardEvent) {
    if (
      busy ||
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
      onReveal();
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
      className={trainingCardStageClassName}
    >
      {notice}
      <TrainingCardShell answerVisible={revealed}>
        {revealed ? (
          <>
            <TrainingCardAnswerHeader
              model={presentation.answer}
              translationVisible={translationVisible}
              translationAvailable={translationAvailable}
              translationLabel={t("senseCard.translation.request")}
              audioLabel={t("senseCard.audio.play")}
              moreLabel={t("senseCard.wordDetails.open")}
              busy={busy}
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
        {revealed ? (
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
                busy={busy}
                onClick={() => onGrade(grade)}
                buttonRef={index === 0 ? firstGradeRef : undefined}
              />
            ))}
          </div>
        ) : (
          <TrainingCardFaceControls
            busy={busy}
            hintAvailable={Boolean(presentation.hint)}
            hintVisible={hintVisible}
            showHintLabel={t("senseCard.hint.show")}
            hideHintLabel={t("senseCard.hint.hide")}
            showAnswerLabel={t("senseCard.answer.show")}
            onToggleHint={() => setHintVisible((v) => !v)}
            onShowAnswer={onReveal}
            showAnswerRef={revealRef}
          />
        )}
        {secondaryActions}
      </footer>
    </section>
  );
}
