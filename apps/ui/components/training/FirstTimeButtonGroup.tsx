"use client";

import React from "react";

type Props = {
  onStartLearning: () => void;
  onAlreadyKnow: () => void;
  disabled?: boolean;
  swipeDirection?: "left" | "right" | null;
  swipeIntensity?: number; // 0..1 (distance-scaled)
};

const buttonBase =
  "flex h-12 w-full items-center justify-center gap-2 whitespace-nowrap rounded-xl px-3 text-xs md:text-sm font-semibold uppercase tracking-wide transition shadow-sm hover:shadow-md disabled:cursor-wait disabled:opacity-60";

const startLearningStyle =
  "bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-200 dark:hover:bg-emerald-900/45";

const alreadyKnowStyle =
  "border border-slate-200 bg-white text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-200 dark:hover:bg-slate-900/70";

export function FirstTimeButtonGroup({
  onStartLearning,
  onAlreadyKnow,
  disabled,
  swipeDirection,
  swipeIntensity = 0,
}: Props) {
  const intensity = Math.max(0, Math.min(1, swipeIntensity));
  const startLearningHighlight =
    swipeDirection === "right" ? intensity : 0;
  const alreadyKnowHighlight =
    swipeDirection === "left" ? intensity : 0;

  return (
    <div className="grid grid-cols-1 gap-2 md:grid-cols-2 md:gap-3 w-full">
      <button
        type="button"
        disabled={disabled}
        onClick={onStartLearning}
        style={
          startLearningHighlight > 0
            ? {
                outline: `2px solid rgba(16, 185, 129, ${0.65 * startLearningHighlight})`, // emerald-500
                outlineOffset: 2,
              }
            : undefined
        }
        className={`${buttonBase} ${startLearningStyle}`}
      >
        Begin met leren
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={onAlreadyKnow}
        style={
          alreadyKnowHighlight > 0
            ? {
                outline: `2px solid rgba(100, 116, 139, ${0.65 * alreadyKnowHighlight})`, // slate-500
                outlineOffset: 2,
              }
            : undefined
        }
        className={`${buttonBase} ${alreadyKnowStyle}`}
      >
        Ik ken dit al
      </button>
    </div>
  );
}
