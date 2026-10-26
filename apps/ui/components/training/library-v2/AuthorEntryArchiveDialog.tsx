"use client";
import React from "react";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import { DialogSurface } from "@/components/practice/ui/DialogSurface";
import { archiveAuthorEntry } from "@/lib/platform/authorEntryArchiveClient";
import { authorEntryArchiveCopy } from "@/lib/platform/authorEntryArchiveCopy";
import s from "./AuthorEntryArchiveDialog.module.css";

export function AuthorEntryArchiveDialog({entryId, headword, userId, language, onCancel, onArchived}: {
  entryId: string; headword: string; userId: string; language: OnboardingLanguage;
  onCancel: () => void; onArchived: () => void;
}) {
  const copy = authorEntryArchiveCopy(language);
  const titleId = React.useId();
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<"failed" | "uncertain" | null>(null);
  const pendingRef = React.useRef(false);
  const mounted = React.useRef(true);
  React.useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const submit = async () => {
    if (pendingRef.current) return;
    pendingRef.current = true; setPending(true); setError(null);
    try {
      const result = await archiveAuthorEntry(entryId, userId);
      if (!mounted.current) return;
      if (result === "archived") onArchived();
      else setError(result === "rejected" ? "failed" : "uncertain");
    } catch { if (mounted.current) setError("failed"); }
    finally { pendingRef.current = false; if (mounted.current) setPending(false); }
  };
  return <DialogSurface className={s.dialog} lang={language} aria-labelledby={titleId} onDismiss={() => { if (!pendingRef.current) onCancel(); }}>
    <h2 className={s.title} id={titleId}>{copy.title(headword)}</h2>
    <p className={s.body}>{copy.notice}</p><p className={s.body}>{copy.history}</p>
    {error ? <p className={s.body} role="alert">{copy[error]}</p> : null}
    <div className={s.actions}>
      <button type="button" className={s.button} autoFocus disabled={pending} onClick={onCancel}>{copy.cancel}</button>
      <button type="button" className={`${s.button} ${s.primary}`} disabled={pending} onClick={() => void submit()}>{pending ? copy.pending : copy.confirm}</button>
    </div>
  </DialogSurface>;
}
