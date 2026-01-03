"use client";

import React from "react";

type Props = {
  open: boolean;
  onClose: () => void;
  title?: string;
  /** When true, the drawer can appear on desktop too (>= lg). */
  showOnDesktop?: boolean;
  children: React.ReactNode;
};

export function TrainingSidebarDrawer({
  open,
  onClose,
  title = "Recent & details",
  showOnDesktop = false,
  children,
}: Props) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className={`fixed inset-0 z-40${showOnDesktop ? "" : " lg:hidden"}`}>
      <div
        className="absolute inset-0 bg-black/30"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="absolute inset-y-0 right-0 w-full max-w-full sm:w-[460px]">
        <div className="relative h-full bg-white shadow-2xl dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-200 bg-white/80 px-4 py-3 backdrop-blur dark:border-slate-800 dark:bg-slate-900/70">
            {/* Title is intentionally not shown (tabs already label content). */}
            <span className="sr-only">{title}</span>
            {/* Spacer so the close button sits on the right (sr-only is absolute). */}
            <div className="flex-1" />

            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800/60"
            >
              Sluiten
            </button>
          </div>

          <div className="h-[calc(100%-52px)] p-3">{children}</div>
        </div>
      </div>
    </div>
  );
}

