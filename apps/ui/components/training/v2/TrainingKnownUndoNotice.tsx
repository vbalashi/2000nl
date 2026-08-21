"use client";

import React from "react";
import { TransientNotice } from "@/components/system/TransientNotice";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import { platformV2Message } from "@/lib/platform/platformV2ClientI18n";
import { usePendingKnownUndo } from "./usePendingKnownUndo";

export function TrainingKnownUndoNotice({
  interfaceLanguage,
  currentPresentationIdentity,
}: {
  interfaceLanguage: OnboardingLanguage;
  currentPresentationIdentity: string | null;
}) {
  const { busy, errorCode, undoKnown, undo, dismiss, dismissError } =
    usePendingKnownUndo(currentPresentationIdentity);
  const t = (key: string) => platformV2Message(interfaceLanguage, key);

  if (!undoKnown && !errorCode) return null;

  return (
    <div className="fixed inset-x-4 bottom-20 z-50 mx-auto flex max-w-md flex-col gap-2">
      {errorCode ? (
        <TransientNotice
          tone="error"
          dismissLabel={t("senseCard.dismiss")}
          onDismiss={dismissError}
        >
          {t("senseCard.known.undoFailed")}
        </TransientNotice>
      ) : null}
      {undoKnown ? (
        <TransientNotice
          tone="success"
          dismissLabel={t("senseCard.dismiss")}
          onDismiss={dismiss}
          action={
            <button
              type="button"
              disabled={busy}
              onClick={() => void undo()}
              className="shrink-0 font-semibold text-indigo-200 hover:text-white disabled:opacity-50"
            >
              {t(undoKnown.messageKey)}
            </button>
          }
        >
          {t("senseCard.known.marked")}
        </TransientNotice>
      ) : null}
    </div>
  );
}
