"use client";

import React from "react";
import s from "@/components/practice/builder/builderControls.module.css";
import type { TrainingSessionSize } from "@/lib/types";

const BASE_STEPS: TrainingSessionSize[] = [
  5, 10, 20, 30, 40, 50, "all-due-today",
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
  approved=false,
  label,
  exercisesLabel,
  allDueLabel,
  allDueHelp,
  allowAllDueToday = true,
}: {
  approved?:boolean;
  value: TrainingSessionSize;
  onChange: (value: TrainingSessionSize) => void;
  label: string;
  exercisesLabel: (count: number) => string;
  allDueLabel: string;
  allDueHelp: string;
  allowAllDueToday?: boolean;
}) {
  // Preserve older saved sizes as explicit stops without changing their meaning.
  const finiteSteps = BASE_STEPS.filter((step) => allowAllDueToday || step !== "all-due-today");
  const savedSize = typeof value === "number" && !finiteSteps.includes(value);
  const steps: TrainingSessionSize[] = savedSize
    ? [...[...finiteSteps.filter((step):step is number => typeof step === "number"),value].sort((a,b)=>a-b),...(allowAllDueToday?["all-due-today" as const]:[])]
    : finiteSteps;
  const selectedIndex = value === "all-due-today"
    ? steps.length - 1
    : nearestStepIndex(steps, value);
  const selectedLabel = value === "all-due-today"
    ? allDueLabel
    : exercisesLabel(value);

  return (
    <div className={approved?s.rangeGroup:undefined}>
      <div className={approved?s.labelRow:"flex items-baseline justify-between gap-3"}>
        <label
          htmlFor="training-session-size"
          className={approved?s.label:"text-sm font-semibold text-slate-950 dark:text-white"}
        >
          {label}
        </label>
        <span className={approved?s.selection:"text-sm font-semibold text-indigo-700 dark:text-indigo-300"}>
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
        className={approved?s.range:"mt-4 h-8 w-full cursor-pointer accent-indigo-500"}
      />
      {approved?<div className={s.sizeTicks} aria-hidden="true">{steps.map((step,index)=><span key={step} style={{left:`${index/(steps.length-1)*100}%`}}>{step==="all-due-today"?"∞":step}</span>)}</div>:<>
      <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400">
        {steps.map((step) => (
          <span key={step} className="w-7 text-center first:text-left last:w-auto last:text-right">
            {step === "all-due-today" ? allDueLabel : step}
          </span>
        ))}
      </div>
      </>}
      {!approved && value === "all-due-today" ? (
        <p className={approved?s.help:"mt-1 text-xs leading-4 text-slate-500 dark:text-slate-400"}>
          {allDueHelp}
        </p>
      ) : null}
    </div>
  );
}
