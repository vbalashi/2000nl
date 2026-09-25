"use client";
import React from "react";
import { TransientNotice } from "@/components/system/TransientNotice";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import { performTrainingExclusion } from "@/lib/platform/trainingExclusionClient";
import {
  getExclusionUndo,
  subscribeExclusionUndo,
  rememberExclusionUndo,
} from "./trainingExclusionUndoStore";
import { trainingExclusionCopy } from "./TrainingExcludeAction";
export function TrainingExclusionUndoNotice({
  userId,
  language,
}: {
  userId: string;
  language: OnboardingLanguage;
}) {
  const pending = React.useSyncExternalStore(
    subscribeExclusionUndo,
    getExclusionUndo,
    () => null,
  );
  const [busy, setBusy] = React.useState(false),
    [failed, setFailed] = React.useState(false);
  const running = React.useRef(false);
  React.useEffect(() => setFailed(false), [pending]);
  if (!pending || pending.userId !== userId) return null;
  const t = trainingExclusionCopy[language];
  const undo = async () => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setFailed(false);
    try {
      await performTrainingExclusion(pending.request);
      if (getExclusionUndo() === pending) rememberExclusionUndo(null);
    } catch {
      if (getExclusionUndo() === pending) setFailed(true);
    } finally {
      running.current = false;
      setBusy(false);
    }
  };
  return (
    <div className="fixed inset-x-4 bottom-20 z-50 mx-auto max-w-md">
      <TransientNotice
        tone={failed ? "error" : "success"}
        dismissLabel={t.dismiss}
        onDismiss={() => rememberExclusionUndo(null)}
        action={
          <button
            type="button"
            disabled={busy}
            onClick={() => void undo()}
            className="shrink-0 font-semibold disabled:opacity-50"
          >
            {t.undo}
          </button>
        }
      >
        {failed ? t.failed : t.done}
      </TransientNotice>
    </div>
  );
}
