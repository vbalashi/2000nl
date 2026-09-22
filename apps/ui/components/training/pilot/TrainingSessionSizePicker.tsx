"use client";

import React from "react";
import type { TrainingSessionSize } from "@/lib/types";

const STEPS = [5, 10, 15, 20, 30, 50, 100] as const;

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
  const selectedIndex =
    typeof value === "number"
      ? STEPS.reduce(
          (best, step, index) =>
            Math.abs(step - value) < Math.abs(STEPS[best] - value)
              ? index
              : best,
          0,
        )
      : 3;

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
          {value === "all-due-today" ? allDueLabel : exercisesLabel(value)}
        </span>
      </div>
      <input
        id="training-session-size"
        type="range"
        min={0}
        max={STEPS.length - 1}
        step={1}
        value={selectedIndex}
        onChange={(event) => onChange(STEPS[Number(event.target.value)])}
        aria-valuetext={exercisesLabel(STEPS[selectedIndex])}
        className="mt-4 h-8 w-full cursor-pointer accent-indigo-500"
      />
      <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400">
        {STEPS.map((step) => (
          <span key={step} className="w-7 text-center first:text-left last:text-right">
            {step}
          </span>
        ))}
      </div>
      <button
        type="button"
        aria-pressed={value === "all-due-today"}
        onClick={() => onChange("all-due-today")}
        className={`mt-4 min-h-10 w-full rounded-lg border px-3 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${
          value === "all-due-today"
            ? "border-indigo-500 bg-indigo-500/20 text-indigo-950 dark:text-indigo-100"
            : "border-slate-200 text-slate-700 dark:border-slate-700 dark:text-slate-300"
        }`}
      >
        {allDueLabel}
      </button>
      <p className="mt-1 text-xs leading-4 text-slate-500 dark:text-slate-400">
        {allDueHelp}
      </p>
    </div>
  );
}
