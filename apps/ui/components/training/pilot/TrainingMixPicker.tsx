"use client";

import React from "react";
import type { CardFilter } from "@/lib/types";

const MIX_STEPS = [
  { cardFilter: "review", ratio: null },
  { cardFilter: "both", ratio: 5 },
  { cardFilter: "both", ratio: 4 },
  { cardFilter: "both", ratio: 3 },
  { cardFilter: "both", ratio: 2 },
  { cardFilter: "both", ratio: 1 },
  { cardFilter: "new", ratio: null },
] as const;

export function mixStepIndex(cardFilter: CardFilter, ratio: number): number {
  if (cardFilter === "review") return 0;
  if (cardFilter === "new") return MIX_STEPS.length - 1;
  const index = MIX_STEPS.findIndex(
    (step) => step.cardFilter === "both" && step.ratio === ratio,
  );
  return index < 0 ? 4 : index;
}

export function mixStepSelection(index: number, currentRatio: number): {
  cardFilter: CardFilter;
  newReviewRatio: number;
} {
  const step = MIX_STEPS[Math.max(0, Math.min(MIX_STEPS.length - 1, index))];
  return {
    cardFilter: step.cardFilter,
    newReviewRatio: step.ratio ?? currentRatio,
  };
}

export function TrainingMixPicker({
  cardFilter,
  ratio,
  onChange,
  label,
  reviewsOnly,
  newOnly,
  ratioLabel,
  help,
}: {
  cardFilter: CardFilter;
  ratio: number;
  onChange: (index: number) => void;
  label: string;
  reviewsOnly: string;
  newOnly: string;
  ratioLabel: (ratio: number) => string;
  help: string;
}) {
  const index = mixStepIndex(cardFilter, ratio);
  const selectedLabel = cardFilter === "review"
    ? reviewsOnly
    : cardFilter === "new"
      ? newOnly
      : ratioLabel(ratio);

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <label
          htmlFor="training-session-mix"
          className="text-sm font-semibold text-slate-950 dark:text-white"
        >
          {label}
        </label>
        <span className="text-right text-sm font-semibold text-indigo-700 dark:text-indigo-300">
          {selectedLabel}
        </span>
      </div>
      <input
        id="training-session-mix"
        type="range"
        min={0}
        max={MIX_STEPS.length - 1}
        step={1}
        value={index}
        onChange={(event) => onChange(Number(event.target.value))}
        aria-valuetext={selectedLabel}
        className="mt-3 h-8 w-full cursor-pointer accent-indigo-500"
      />
      <div className="grid grid-cols-7 text-[10px] text-slate-500 dark:text-slate-400 sm:text-xs">
        {[reviewsOnly, "1:5", "1:4", "1:3", "1:2", "1:1", newOnly].map((stepLabel, stepIndex) => (
          <span
            key={stepIndex}
            aria-hidden="true"
            className={`truncate text-center first:text-left last:text-right ${stepIndex === index ? "font-bold text-indigo-700 dark:text-indigo-300" : ""}`}
            title={stepLabel}
          >
            {stepIndex === 0 ? "Review" : stepIndex === 6 ? "New" : stepLabel}
          </span>
        ))}
      </div>
      <p className="mt-1 text-xs leading-4 text-slate-500 dark:text-slate-400">
        {help}
      </p>
    </div>
  );
}
