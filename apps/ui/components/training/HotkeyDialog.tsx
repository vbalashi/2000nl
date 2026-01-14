"use client";

import React, { useEffect } from "react";

type Props = {
  onClose: () => void;
};

const HOTKEYS = [
  { key: "Space", description: "Toon / Verberg definitie" },
  { key: "I", description: "Hint (context + voorbeeld)" },
  { key: "Shift+I", description: "Woorddetails in sidebar" },
  { key: "T", description: "Toon / verberg vertaling (inline)" },
  { key: "S", description: "Zoeken" },
  { key: "Esc", description: "Sluit vertaling" },
  { key: "H", description: "Opnieuw" },
  { key: "J", description: "Moeilijk" },
  { key: "K", description: "Goed" },
  { key: "L", description: "Makkelijk" },
  { key: "F", description: "Bevriezen (tot morgen)" },
  { key: "X", description: "Niet meer tonen" },
  { key: "?", description: "Toon deze lijst" },
];

export function HotkeyDialog({ onClose }: Props) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl shadow-slate-900/15 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            Hotkey overzicht
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-200 px-2 py-1 text-sm text-slate-500 transition hover:border-primary hover:text-primary dark:border-slate-700"
          >
            Sluiten
          </button>
        </div>
        <div className="mt-4 space-y-3">
          {HOTKEYS.map((item) => (
            <div
              key={item.key}
              className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
            >
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {item.key}
              </span>
              <span>{item.description}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
