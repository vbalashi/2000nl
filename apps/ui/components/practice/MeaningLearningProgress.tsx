"use client";
import { completeMeaningExclusionResume } from "../training/v2/trainingExclusionUndoStore";
import React from "react";
import { X } from "lucide-react";
import type {
  MeaningLearningProgress as Progress,
  MeaningDirectionProgress,
} from "../../../../packages/shared/types/meaningLearningProgress";
import { meaningLearningStatus } from "../../../../packages/shared/types/meaningLearningProgress";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import { getUiMessages } from "@/lib/uiMessages";
import { platformV2Message } from "@/lib/platform/platformV2ClientI18n";
import {
  fetchMeaningProgress,
  resumeMeaningProgress,
} from "@/lib/platform/meaningProgressClient";
import { DialogSurface } from "./ui/DialogSurface";
import { SheetDragRegion } from "./ui/SheetDragRegion";
import { SheetHandle } from "./ui/SheetHandle";
import { useResizableSheet } from "./ui/useResizableSheet";
import s from "./meaningLearningProgress.module.css";

export function MeaningLearningProgress({
  entryId,
  language,
  onClose,
  onChanged,
  learningActionsBlocked = false,
  headwordActionsBlocked = false,
}: {
  learningActionsBlocked?: boolean;
  headwordActionsBlocked?: boolean;
  entryId: string;
  language: OnboardingLanguage;
  onClose: () => void;
  onChanged?: () => void | Promise<void>;
}) {
  const t = getUiMessages(language).learningProgress;
  const [progress, setProgress] = React.useState<Progress>();
  const [failed, setFailed] = React.useState(false),
    [busy, setBusy] = React.useState(false),
    [retry, setRetry] = React.useState(0);
  const pending = React.useRef<{ progress: Progress; eventId: string }>();
  const sheet = useResizableSheet(entryId, onClose);
  const titleId = React.useId();
  React.useEffect(() => {
    const controller = new AbortController();
    setFailed(false);
    void fetchMeaningProgress(entryId, controller.signal)
      .then(setProgress)
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, [entryId, retry]);
  const mutationBlocked = learningActionsBlocked || (headwordActionsBlocked && Boolean(progress?.exclusionId));
  const protectionCopy = getUiMessages(language).activeTrainingCard;
  const protectionHint = learningActionsBlocked ? protectionCopy.actionHint : protectionCopy.headwordHint;
  const resume = async () => {
    if (!progress || busy || mutationBlocked) return;
    setBusy(true);
    setFailed(false);
    const request = pending.current ?? {
      progress,
      eventId: crypto.randomUUID(),
    };
    pending.current = request;
    try {
      const next = await resumeMeaningProgress(
        request.progress,
        request.eventId,
      );
      completeMeaningExclusionResume(request.progress.exclusionId);
      pending.current = undefined;
      setProgress(next);
      await onChanged?.();
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "meaning_progress_conflict"
      ) {
        pending.current = undefined;
        setRetry((v) => v + 1);
      }
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <DialogSurface
      ref={sheet.ref as React.RefObject<HTMLDialogElement>}
      className={s.panel}
      style={
        {
          "--sheet-height": sheet.height ? `${sheet.height}px` : undefined,
        } as React.CSSProperties
      }
      data-dragging={sheet.dragging}
      aria-labelledby={titleId}
      onClick={(event) => event.stopPropagation()}
      onDismiss={onClose}
    >
      <div className={s.handle}>
        <SheetHandle controller={sheet} label={t.resize} />
      </div>
      <SheetDragRegion controller={sheet} className={s.heading}>
        <div>
          <h2 id={titleId}>{t.title}</h2>
          {progress && <p>{progress.headword}</p>}
        </div>
        <button
          type="button"
          className={s.close}
          aria-label={t.close}
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </SheetDragRegion>
      <div className={s.body} tabIndex={0}>
        {!progress && !failed && <p role="status">{t.loading}</p>}
        {failed && (
          <p role="alert">
            {t.failed}{" "}
            <button type="button" onClick={() => setRetry((v) => v + 1)}>
              {t.retry}
            </button>
          </p>
        )}
        {progress && (
          <>
            <p className={s.hint}>{t.directionHint}</p>
            {mutationBlocked && <p className={s.hint} role="note">{protectionHint}</p>}
            {progress.directions.map((direction) => (
              <Direction
                key={direction.cardTypeId}
                direction={direction}
                excluded={Boolean(progress.exclusionId)}
                language={language}
              />
            ))}
            {(meaningLearningStatus(progress) === "excluded" ||
              progress.directions.some((d) => d.knownMarkId)) && (
              <footer className={s.footer}>
                <p>{mutationBlocked ? protectionHint : t.resumeHelp}</p>
                <button
                  type="button"
                  disabled={busy || mutationBlocked}
                  onClick={() => void resume()}
                >
                  {t.resume}
                </button>
              </footer>
            )}
          </>
        )}
      </div>
    </DialogSurface>
  );
}
function Direction({
  direction: d,
  excluded,
  language,
}: {
  direction: MeaningDirectionProgress;
  excluded: boolean;
  language: OnboardingLanguage;
}) {
  const t = getUiMessages(language).learningProgress;
  const dates = new Intl.DateTimeFormat(language, {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const date = (value: string | null) =>
    value ? <time dateTime={value}>{dates.format(new Date(value))}</time> : "—";
  const rating = d.lastGrade
    ? platformV2Message(
        language,
        `senseCard.review.${({ 1: "fail", 2: "hard", 3: "success", 4: "easy" } as const)[d.lastGrade]}`,
      )
    : t.ungraded;
  const status = excluded
    ? t.excluded
    : d.knownMarkId
      ? t.known
      : d.gradedAttempts === 0 && d.phase !== "new"
        ? t.awaiting
        : d.phase === "new"
          ? t.new
          : d.phase === "reviewing"
            ? t.reviewing
            : t.learning;
  const stability =
    d.stability !== null && d.stability > 0 ? d.stability : null;
  const difficulty =
    d.difficulty !== null && d.difficulty >= 1 && d.difficulty <= 10
      ? d.difficulty
      : null;
  return (
    <section className={s.direction}>
      <h3>
        {d.cardTypeId === "word-to-definition"
          ? t.wordToMeaning
          : t.meaningToWord}
      </h3>
      <p className={s.status}>{status}</p>
      <dl className={s.fields}>
        <dt>{t.lastRating}</dt>
        <dd>{rating}</dd>
        {d.lastReviewedAt && (
          <>
            <dt>{t.lastRated}</dt>
            <dd>{date(d.lastReviewedAt)}</dd>
          </>
        )}
        <dt>{t.presentations}</dt>
        <dd>{d.presentations}</dd>
        <dt>{t.attempts}</dt>
        <dd>{d.gradedAttempts}</dd>
        <dt>{t.nextReview}</dt>
        <dd>
          {excluded
            ? t.pausedExcluded
            : d.knownMarkId
              ? t.pausedKnown
              : d.gradedAttempts === 0 && d.phase !== "new"
                ? t.ready
                : date(d.nextReviewAt)}
        </dd>
        {stability !== null && (
          <>
            <dt>{t.stability}</dt>
            <dd>
              ≈{" "}
              {new Intl.NumberFormat(language, {
                maximumFractionDigits: 1,
              }).format(stability)}{" "}
              {t.days}
              <p className={s.hint}>{t.stabilityShort}</p>
              <div className={s.scale}>
                <div className={s.track}>
                  <span
                    className={s.dot}
                    style={{ left: `${stabilityPosition(stability)}%` }}
                  />
                </div>
                <div className={s.markers}>
                  {[t.day, t.week, t.month, t.quarter, t.year].map((v, i) => (
                    <span
                      key={v}
                      style={{
                        left: `${stabilityPosition([1, 7, 30, 90, 365][i])}%`,
                      }}
                    >
                      {v}
                    </span>
                  ))}
                </div>
              </div>
              <details>
                <summary>{t.stabilityMore}</summary>
                <p>{t.stabilityHelp}</p>
              </details>
            </dd>
          </>
        )}
        {difficulty !== null && (
          <>
            <dt>{t.difficulty}</dt>
            <dd>
              {new Intl.NumberFormat(language, {
                maximumFractionDigits: 1,
              }).format(difficulty)}{" "}
              / 10
              <meter
                min={1}
                max={10}
                value={difficulty}
                aria-label={t.difficulty}
              />
              <div className={s.ends}>
                <span>{t.easier}</span>
                <span>{t.harder}</span>
              </div>
              <details>
                <summary>{t.difficultyMore}</summary>
                <p>{t.difficultyHelp}</p>
              </details>
            </dd>
          </>
        )}
      </dl>
    </section>
  );
}
/** The logarithmic axis is a comparison scale, never a mastery target. */
export function stabilityPosition(days: number) {
  return Math.max(
    0,
    Math.min(100, (Math.log(Math.max(1, days)) / Math.log(365)) * 100),
  );
}
