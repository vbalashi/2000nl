"use client";

import React from "react";
import { X } from "lucide-react";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import { getUiMessages } from "@/lib/uiMessages";
import { DialogSurface } from "../ui/DialogSurface";
import s from "./libraryEntryEditor.module.css";

/** Presentation only; draft fields and the create-user-entry action retain their owner. */
export function LibraryEntryEditor({ children, locale, onClose, busy, modal }: {
  children: React.ReactNode;
  locale: OnboardingLanguage;
  onClose: () => void;
  busy: boolean;
  modal: boolean;
}) {
  const copy = getUiMessages(locale).library;
  if (!modal) return <div className="mt-3 grid gap-2">{children}</div>;
  return <DialogSurface className={s.dialog} aria-label={copy.addEntry} lang={locale}
    onDismiss={() => { if (!busy) onClose(); }}>
    <header className={s.header}>
      <h2>{copy.addEntry}</h2>
      <button type="button" aria-label={copy.closeEntry} disabled={busy} onClick={onClose}><X size={18} /></button>
    </header>
    <div className={s.body}>{children}</div>
  </DialogSurface>;
}
