import React from "react";
import s from "./TrainingKnownChoice.module.css";

type Props = {
  label: string;
  initiallyKnown: boolean;
  known: boolean;
  knownLabel: string;
  learningLabel: string;
  actionLabel: string;
  disabled: boolean;
  onToggle: () => void;
  children: React.ReactNode;
};

export function TrainingKnownDirection({
  label, initiallyKnown, known, knownLabel, learningLabel, actionLabel, disabled, onToggle, children,
}: Props) {
  const [visual, setVisual] = React.useState(() => ({ known: initiallyKnown, changed: false }));
  // Track display transitions separately so the draft is actionable throughout the pulse.
  if (visual.known !== known) {
    setVisual({ known, changed: true });
  }

  const motion = visual.changed ? (known ? "mark" : "restore") : undefined;
  return (
    <div className={s.direction} data-known={known} data-motion={motion} role="group" aria-label={label}>
      <span key={motion} className={s.pulse} aria-hidden="true" />
      {children}
      <div className={s.status}>
        <div role="status" className={s.statusText}>
          {motion && (
            <span
              key={motion}
              className={s.previousState}
              data-label={known ? learningLabel : knownLabel}
              aria-hidden="true"
            />
          )}
          <span key={`status-${motion ?? "idle"}`} className={s.stateLabel}>{known ? knownLabel : learningLabel}</span>
        </div>
        <button type="button" className={s.link} disabled={disabled} onClick={onToggle}>
          {actionLabel}
        </button>
      </div>
    </div>
  );
}
