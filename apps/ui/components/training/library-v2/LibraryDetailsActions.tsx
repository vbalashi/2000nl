"use client";

import React from "react";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import { platformV2Message } from "@/lib/platform/platformV2ClientI18n";

type Props = {
  entryId: string;
  interfaceLanguage: OnboardingLanguage;
  revealed?: boolean;
  actionLoading?: boolean;
  onTrainingAction?: (
    action: "freeze-card" | "hide-card",
  ) => void | Promise<void>;
  onCopyToUserDictionary?: (entryId: string) => void | Promise<void>;
  leadingAction?: React.ReactNode;
};

export function LibraryDetailsActions({
  entryId,
  interfaceLanguage,
  revealed = true,
  actionLoading = false,
  onTrainingAction,
  onCopyToUserDictionary,
  leadingAction,
}: Props) {
  const [copyBusy, setCopyBusy] = React.useState(false);
  const [copyStatus, setCopyStatus] = React.useState<string | null>(null);
  const [actionStatus, setActionStatus] = React.useState<string | null>(null);
  const entryIdRef = React.useRef(entryId);
  const t = (key: string) => platformV2Message(interfaceLanguage, key);

  React.useEffect(() => {
    entryIdRef.current = entryId;
    setCopyStatus(null);
    setActionStatus(null);
  }, [entryId]);

  const handleTrainingAction = async (action: "freeze-card" | "hide-card") => {
    if (!onTrainingAction) return;
    setActionStatus(null);
    try {
      await onTrainingAction(action);
    } catch {
      setActionStatus(t("senseCard.actions.actionFailed"));
    }
  };

  return (
    <div
      data-testid="library-details-actions"
      className="shrink-0 space-y-2 border-t border-slate-200 pt-3 text-xs dark:border-slate-700"
    >
      <div className="flex flex-wrap items-start gap-2">
        {leadingAction ? <div className="shrink-0">{leadingAction}</div> : null}
        <div className="flex min-w-0 flex-1 flex-wrap gap-2">
          {onTrainingAction ? (
            <>
              <button
                type="button"
                disabled={!revealed || actionLoading}
                onClick={() => void handleTrainingAction("freeze-card")}
                className="rounded-xl border border-slate-300 px-3 py-2 font-semibold text-slate-700 disabled:opacity-50 dark:border-slate-600 dark:text-slate-200"
              >
                {t("senseCard.actions.freeze")}
              </button>
              <button
                type="button"
                disabled={!revealed || actionLoading}
                onClick={() => void handleTrainingAction("hide-card")}
                className="rounded-xl border border-slate-300 px-3 py-2 font-semibold text-slate-700 disabled:opacity-50 dark:border-slate-600 dark:text-slate-200"
              >
                {t("senseCard.actions.hide")}
              </button>
            </>
          ) : null}
          {onCopyToUserDictionary ? (
            <button
              type="button"
              disabled={copyBusy}
              onClick={async () => {
                setCopyBusy(true);
                setCopyStatus(null);
                try {
                  await onCopyToUserDictionary(entryId);
                  if (entryIdRef.current === entryId) {
                    setCopyStatus(t("senseCard.actions.copySuccess"));
                  }
                } catch {
                  if (entryIdRef.current === entryId) {
                    setCopyStatus(t("senseCard.actions.copyFailed"));
                  }
                } finally {
                  setCopyBusy(false);
                }
              }}
              className="rounded-xl border border-slate-300 px-3 py-2 font-semibold text-slate-700 disabled:opacity-50 dark:border-slate-600 dark:text-slate-200"
            >
              {t("senseCard.actions.copy")}
            </button>
          ) : null}
        </div>
      </div>
      {copyStatus ? (
        <p role="status" className="font-semibold text-slate-600 dark:text-slate-300">
          {copyStatus}
        </p>
      ) : null}
      {actionStatus ? (
        <p role="alert" className="font-semibold text-rose-700 dark:text-rose-300">
          {actionStatus}
        </p>
      ) : null}
    </div>
  );
}
