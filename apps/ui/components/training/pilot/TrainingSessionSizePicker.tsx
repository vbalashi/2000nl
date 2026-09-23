"use client";

import React from "react";
import type { TrainingSessionSize } from "@/lib/types";

const BASE_STEPS: TrainingSessionSize[] = [
  5, 10, 15, 20, 30, 50, "all-due-today",
];

const nearestStepIndex = (steps: TrainingSessionSize[], value: number) => {
  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  steps.forEach((step, index) => {
    if (typeof step !== "number") return;
    const distance = Math.abs(step - value);
    if (distance < bestDistance) {
      bestIndex = index;
      bestDistance = distance;
    }
  });
  return bestIndex;
};

export function TrainingSessionSizePicker({
  value,
  onChange,
  label,
  exercisesLabel,
  allDueLabel,
  allDueHelp,
}: {
  value: TrainingSessionSize;
  onChange: (value: TrainingSessionSize) => void;
  label: string;
  exercisesLabel: (count: number) => string;
  allDueLabel: string;
  allDueHelp: string;
}) {
  // Keep a saved 100-exercise choice selectable until the learner moves the
  // slider. New selections use the shorter scale ending at All due.
  const steps = value === 100
    ? [...BASE_STEPS.slice(0, -1), 100, "all-due-today" as const]
    : BASE_STEPS;
  const selectedIndex = value === "all-due-today"
    ? steps.length - 1
    : nearestStepIndex(steps, value);
  const selectedLabel = value === "all-due-today"
    ? allDueLabel
    : exercisesLabel(value);

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <label
          htmlFor="training-session-size"
          className="text-sm font-semibold text-slate-950 dark:text-white"
        >
          {label}
        </label>
        <span className="text-sm font-semibold text-indigo-700 dark:text-indigo-300">
          {selectedLabel}
        </span>
      </div>
      <input
        id="training-session-size"
        type="range"
        min={0}
        max={steps.length - 1}
        step={1}
        value={selectedIndex}
        onChange={(event) => onChange(steps[Number(event.target.value)])}
        aria-valuetext={selectedLabel}
        className="mt-4 h-8 w-full cursor-pointer accent-indigo-500"
      />
      <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400">
        {steps.map((step) => (
          <span key={step} className="w-7 text-center first:text-left last:w-auto last:text-right">
            {step === "all-due-today" ? allDueLabel : step}
          </span>
        ))}
      </div>
      {value === "all-due-today" ? (
        <p className="mt-1 text-xs leading-4 text-slate-500 dark:text-slate-400">
          {allDueHelp}
        </p>
      ) : null}
    </div>
  );
}
