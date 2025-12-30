import React from "react";
import { useEffect, useRef, useState } from "react";

type Option = { value: string; label: string };

type Props = {
  label: string;
  value: string;
  options: Option[];
  onChange: (value: string) => void;
  align?: "left" | "right";
};

/**
 * Lightweight drop-up selector for the bottom bar filters.
 * Opens upward to avoid overlapping the footer.
 */
export function DropUpSelect({
  label,
  value,
  options,
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

  const selectedLabel = options.find((opt) => opt.value === value)?.label;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex items-center gap-2 rounded-full bg-slate-100/70 px-3 py-2 text-[11px] uppercase tracking-wide text-slate-600 transition hover:bg-slate-200/80 dark:bg-slate-800/70 dark:text-slate-200 dark:hover:bg-slate-700/80"
      >
        <span className="text-slate-500 dark:text-slate-300">{label}:</span>
        <span className="font-semibold text-slate-800 dark:text-white">
          {selectedLabel ?? value}
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
          } min-w-[200px] overflow-hidden rounded-xl border border-slate-200 bg-white/95 text-sm shadow-xl dark:border-slate-700 dark:bg-slate-900/95`}
        >
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {options.map((option) => {
              const isActive = option.value === value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center justify-between px-4 py-2 text-left transition hover:bg-slate-50 dark:hover:bg-slate-800/60 ${
                    isActive
                      ? "bg-slate-100 font-semibold text-slate-900 dark:bg-slate-800/80 dark:text-white"
                      : "text-slate-600 dark:text-slate-200"
                  }`}
                >
                  <span>{option.label}</span>
                  {isActive && (
                    <span className="text-[10px] uppercase text-primary">
                      gekozen
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
