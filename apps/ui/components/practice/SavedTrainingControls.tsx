"use client";
import React, { useId, useState } from "react";
import { Check, Trash2 } from "lucide-react";
import { DialogSurface } from "./ui/DialogSurface";
import { formatUiMessage, getUiMessages } from "@/lib/uiMessages";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import s from "./savedTrainingControls.module.css";
export function SavedTrainingControls({ name, main, hasOthers, language, pending = false, hideDelete = false, onMain, onDelete }: {
  name: string; main: boolean; hasOthers: boolean; language: OnboardingLanguage; pending?: boolean; hideDelete?: boolean;
  onMain: () => void | Promise<unknown>;
  onDelete: () => void | boolean | Promise<void | boolean>;
}) {
  const [deleting, setDeleting] = useState(false);
  const titleId = useId();
  const copy = getUiMessages(language).builder;
  return <>
    <div className={s.controls}>
      <button className={s.makeMain} aria-pressed={main} disabled={main || pending} onClick={() => void onMain()}>
        {main && <Check size={15} aria-hidden="true" />} {main ? copy.mainTraining : copy.makeMain}
      </button>
      {!hideDelete && <button className={s.delete} disabled={pending} onClick={() => setDeleting(true)}><Trash2 size={15} aria-hidden="true" /> {copy.delete}</button>}
    </div>
    {deleting && <DialogSurface className={s.modal} lang={language} aria-labelledby={titleId} onDismiss={() => { if (!pending) setDeleting(false); }}>
      <div className={s.content}>
        <h2 id={titleId}>{copy.deleteTitle}</h2>
        <p>{formatUiMessage(copy.deleteNotice, { name })}</p>
        {main && hasOthers && <p>{copy.nextMain}</p>}
        <div className={s.actions}>
          <button className={s.cancel} disabled={pending} autoFocus onClick={() => setDeleting(false)}>{copy.cancel}</button>
          <button className={s.confirmDelete} disabled={pending} onClick={async () => { if (await onDelete() !== false) setDeleting(false); }}>{copy.delete}</button>
        </div>
      </div>
    </DialogSurface>}
  </>;
}
