"use client";

import { useEffect, useRef, useState } from "react";
import type { TrainingMode } from "@/lib/types";

type ModeOption = {
  value: TrainingMode;
  label: string;
  shortLabel: string;
};

const MODE_OPTIONS: ModeOption[] = [
  {
    value: "word-to-definition",
    label: "Woord \u2192 Definitie",
    shortLabel: "W\u2192D",
  },
  {
    value: "definition-to-word",
    label: "Definitie \u2192 Woord",
    shortLabel: "D\u2192W",
  },
];

type Props = {
  label: string;
  enabledModes: TrainingMode[];
  onChange: (modes: TrainingMode[]) => void;
  align?: "left" | "right";
};

/**
 * Multi-select checkbox group for training modes.
 * Opens upward as a popover with checkboxes.
 */
export function ModeCheckboxGroup({
  label,
  enabledModes,
  onChange,
  align = "left",
}: Props) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const handleToggle = (mode: TrainingMode) => {
    const isEnabled = enabledModes.includes(mode);
    if (isEnabled) {
      // Don't allow disabling the last mode
      if (enabledModes.length === 1) return;
      onChange(enabledModes.filter((m) => m !== mode));
    } else {
      onChange([...enabledModes, mode]);
    }
  };

  // Build display label
  const displayLabel =
    enabledModes.length === MODE_OPTIONS.length
      ? "Beide"
      : MODE_OPTIONS.filter((opt) => enabledModes.includes(opt.value))
          .map((opt) => opt.shortLabel)
          .join(", ") || "Geen";

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex items-center gap-2 rounded-full bg-slate-100/70 px-3 py-2 text-[11px] uppercase tracking-wide text-slate-600 transition hover:bg-slate-200/80 dark:bg-slate-800/70 dark:text-slate-200 dark:hover:bg-slate-700/80"
      >
        <span className="text-slate-500 dark:text-slate-300">{label}:</span>
        <span className="font-semibold text-slate-800 dark:text-white">
          {displayLabel}
        </span>
        <svg
          className={`h-3 w-3 text-slate-500 transition-transform dark:text-slate-300 ${
            open ? "rotate-180" : ""
          }`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m18 15-6-6-6 6" />
        </svg>
      </button>

      {open ? (
        <div
          className={`absolute bottom-[calc(100%+8px)] ${
            align === "right" ? "right-0" : "left-0"
          } min-w-[240px] overflow-hidden rounded-xl border border-slate-200 bg-white/95 text-sm shadow-xl dark:border-slate-700 dark:bg-slate-900/95`}
        >
          <div className="p-2">
            <p className="px-2 pb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Trainingsrichtingen
            </p>
            <div className="space-y-1">
              {MODE_OPTIONS.map((option) => {
                const isEnabled = enabledModes.includes(option.value);
                const isOnlyOne = enabledModes.length === 1 && isEnabled;
                return (
                  <label
                    key={option.value}
                    className={`flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 transition ${
                      isEnabled
                        ? "bg-primary/10 text-slate-900 dark:bg-primary/20 dark:text-white"
                        : "text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800/60"
                    } ${isOnlyOne ? "opacity-70" : ""}`}
                  >
                    <input
                      type="checkbox"
                      checked={isEnabled}
                      disabled={isOnlyOne}
                      onChange={() => handleToggle(option.value)}
                      className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary disabled:cursor-not-allowed dark:border-slate-600 dark:text-primary-light"
                    />
                    <span className="flex-1 font-medium">{option.label}</span>
                    {isEnabled && (
                      <span className="text-[10px] font-semibold uppercase text-primary dark:text-primary-light">
                        actief
                      </span>
                    )}
                  </label>
                );
              })}
            </div>
            <p className="mt-2 px-2 text-[10px] text-slate-500 dark:text-slate-400">
              Elke richting heeft een eigen voortgang
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
