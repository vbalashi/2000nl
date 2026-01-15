"use client";

import React from "react";
import { Tooltip } from "@/components/Tooltip";

type Props = {
  enabled: boolean;
  onToggle: () => void;
};

export function AudioModeToggle({ enabled, onToggle }: Props) {
  const label = enabled ? "Audio modus aan" : "Audio modus uit";

  return (
    <Tooltip content={label} side="bottom" showOnFocus={false} hideOnMobile>
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={enabled}
        aria-label={label}
        className={`flex h-11 w-11 md:h-8 md:w-8 items-center justify-center rounded-full border shadow-sm backdrop-blur-sm transition select-none ${
          enabled
            ? "border-emerald-300 bg-emerald-100/80 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-700/60 dark:bg-emerald-900/30 dark:text-emerald-200"
            : "border-slate-200 bg-white/70 text-slate-500 opacity-70 hover:opacity-100 hover:bg-white/90 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300 dark:hover:bg-slate-900/80"
        }`}
      >
        <span className="text-base leading-none" aria-hidden="true">
          {enabled ? "🔊" : "🔇"}
        </span>
      </button>
    </Tooltip>
  );
}
