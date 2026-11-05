"use client";

import React from "react";

import { interfaceLanguages, type InterfaceLanguage as LanguageCode } from "@/lib/i18n/registry";
import { getUiMessages } from "@/lib/uiMessages";
import { useInterfaceLanguage } from "@/lib/i18n/useInterfaceLanguage";

type Props = {
  open: boolean;
  onSelectLanguage: (lang: LanguageCode) => void;
};

export function LanguageSelectionModal({ open, onSelectLanguage }: Props) {
  const language = useInterfaceLanguage();
  const copy = getUiMessages(language).interfaceSelection;
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md mx-4 bg-white dark:bg-slate-800 rounded-2xl shadow-2xl p-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-2 text-center">
          {copy.title}
        </h2>
        <p className="text-sm text-slate-600 dark:text-slate-400 mb-6 text-center">
          {copy.subtitle}
        </p>

        <div className="flex flex-col gap-3">
          {interfaceLanguages.map((lang) => (
            <button
              key={lang.code}
              onClick={() => onSelectLanguage(lang.code)}
              className="w-full px-6 py-4 text-lg font-medium rounded-xl border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/40 text-slate-900 dark:text-slate-100 hover:border-blue-500 dark:hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
            >
              {lang.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
