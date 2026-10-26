"use client";

import React, { useEffect } from "react";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import { getTrainingHotkeys } from "./trainingHotkeys";

type Props = {
  interfaceLanguage?: OnboardingLanguage;
  onClose: () => void;
};

const dialogCopy = {
  nl: { title: "Sneltoetsen", close: "Sluiten" },
  en: { title: "Keyboard shortcuts", close: "Close" },
  ru: { title: "Горячие клавиши", close: "Закрыть" },
} satisfies Record<OnboardingLanguage, { title: string; close: string }>;

export function HotkeyDialog({ interfaceLanguage = "nl", onClose }: Props) {
  const copy = dialogCopy[interfaceLanguage];
  const hotkeys = getTrainingHotkeys(interfaceLanguage);
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
            {copy.title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-200 px-2 py-1 text-sm text-slate-500 transition hover:border-primary hover:text-primary dark:border-slate-700 dark:text-slate-400 dark:hover:border-primary-light dark:hover:text-primary-light"
          >
            {copy.close}
          </button>
        </div>
        <div className="mt-4 space-y-3">
          {hotkeys.map((item) => (
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
