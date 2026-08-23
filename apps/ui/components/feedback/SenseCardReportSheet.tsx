"use client";

import React from "react";
import { createPortal } from "react-dom";
import { Check, Flag, RotateCcw, X } from "lucide-react";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import { platformV2Message } from "@/lib/platform/platformV2ClientI18n";
import {
  buildSenseCardDiagnosticReport,
  queuePreparedSenseCardDiagnosticReport,
  type SenseCardDiagnosticSnapshot,
  type SenseCardReportDeliveryState,
} from "@/lib/feedback/diagnosticReportClient";
import type { FeedbackKind } from "../../../../packages/shared/diagnostic-report/v1";

const categories: readonly FeedbackKind[] = [
  "translation-quality",
  "content-quality",
  "rendering",
  "loading",
  "training-action",
  "other",
];

export function SenseCardReportAction({
  snapshot,
  interfaceLanguage,
  disabled = false,
}: {
  snapshot: SenseCardDiagnosticSnapshot;
  interfaceLanguage: OnboardingLanguage;
  disabled?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [frozenSnapshot, setFrozenSnapshot] = React.useState(snapshot);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const t = (key: string) => platformV2Message(interfaceLanguage, key);
  const dismissReport = React.useCallback(() => {
    setOpen(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  }, []);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => {
          setFrozenSnapshot(snapshot);
          setOpen(true);
        }}
        className="inline-flex h-8 min-h-8 items-center gap-1.5 rounded-lg border border-transparent px-2 text-xs font-medium text-slate-500 outline-none transition hover:border-slate-200 hover:bg-slate-100 hover:text-slate-900 focus-visible:ring-2 focus-visible:ring-indigo-400 disabled:opacity-50 dark:text-slate-400 dark:hover:border-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-100"
      >
        <Flag aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={1.8} />
        {t("senseCard.report")}
      </button>
      {open
        ? createPortal(
            <SenseCardReportSheet
              snapshot={frozenSnapshot}
              interfaceLanguage={interfaceLanguage}
              onClose={dismissReport}
            />,
            document.body,
          )
        : null}
    </>
  );
}

function SenseCardReportSheet({
  snapshot,
  interfaceLanguage,
  onClose,
}: {
  snapshot: SenseCardDiagnosticSnapshot;
  interfaceLanguage: OnboardingLanguage;
  onClose: () => void;
}) {
  const [kind, setKind] = React.useState<FeedbackKind | null>(null);
  const [comment, setComment] = React.useState("");
  const [delivery, setDelivery] = React.useState<SenseCardReportDeliveryState>("editing");
  const dialogRef = React.useRef<HTMLDivElement>(null);
  const firstRadioRef = React.useRef<HTMLInputElement>(null);
  const closeButtonRef = React.useRef<HTMLButtonElement>(null);
  const t = (key: string) => platformV2Message(interfaceLanguage, key);
  const terminal = delivery === "sent" || delivery === "queued" || delivery === "scheduled" || delivery === "rejected";
  const preparedReportRef = React.useRef<ReturnType<typeof buildSenseCardDiagnosticReport> | null>(null);
  const deliveryAnnouncement = delivery === "editing"
    ? ""
    : delivery === "sending"
      ? t("senseCard.reportSheet.sending")
      : delivery === "retry"
        ? t("senseCard.reportSheet.retry")
        : `${t(`senseCard.reportSheet.states.${delivery}.title`)}. ${t(`senseCard.reportSheet.states.${delivery}.body`)}`;
  const dismiss = React.useCallback(() => {
    if (delivery !== "sending") onClose();
  }, [delivery, onClose]);

  React.useEffect(() => {
    if (terminal) closeButtonRef.current?.focus();
    else firstRadioRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismiss();
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), textarea:not([disabled])',
      )];
      if (!focusable.length) return;
      const first = focusable[0]!;
      const last = focusable.at(-1)!;
      if (!dialogRef.current.contains(document.activeElement)) {
        event.preventDefault();
        first.focus();
        return;
      }
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [dismiss, terminal]);

  const submit = async () => {
    if (!kind || delivery === "sending") return;
    setDelivery("sending");
    try {
      preparedReportRef.current ??= buildSenseCardDiagnosticReport({
        snapshot, kind, comment: comment.trim() || null,
      });
      const result = await queuePreparedSenseCardDiagnosticReport(
        await preparedReportRef.current,
      );
      setDelivery(result.state);
    } catch {
      setDelivery("retry");
    }
  };

  return (
    <div
      data-training-hotkeys-suspended="true"
      className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/70 pt-8 backdrop-blur-[2px] sm:items-center sm:p-6"
      onClick={(event) => {
        if (event.target === event.currentTarget) dismiss();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-busy={delivery === "sending"}
        aria-labelledby="sense-card-report-title"
        aria-describedby={terminal ? "sense-card-report-delivery-description" : "sense-card-report-context"}
        className="w-full max-w-[430px] overflow-hidden rounded-t-[28px] border border-slate-300 bg-slate-50 text-slate-900 shadow-2xl motion-safe:animate-[report-sheet-in_180ms_ease-out] dark:border-slate-600 dark:bg-[#202938] dark:text-slate-50 sm:rounded-[28px]"
      >
        <p
          role="status"
          aria-live="polite"
          aria-atomic="true"
          data-testid="report-delivery-announcement"
          className="sr-only"
        >
          {deliveryAnnouncement}
        </p>
        <div className="px-5 pb-3 pt-3">
          <span aria-hidden="true" className="mx-auto mb-3 block h-1 w-11 rounded-full bg-slate-300 dark:bg-slate-500" />
          <h2 id="sense-card-report-title" className="text-xl font-semibold leading-tight">
            {t("senseCard.reportSheet.title")}
          </h2>
        </div>

        <div className="max-h-[calc(100dvh-8rem)] overflow-y-auto px-5 pb-3">
          {terminal ? (
            <ReportStatus state={delivery} t={t} />
          ) : (
            <>
              <fieldset disabled={delivery !== "editing"} className="mt-1 overflow-hidden rounded-2xl border border-slate-300 bg-white dark:border-slate-600 dark:bg-[#192230]">
                <legend className="sr-only">{t("senseCard.reportSheet.title")}</legend>
                {categories.map((category, index) => (
                  <label
                    key={category}
                    className={`flex min-h-[39px] cursor-pointer items-center gap-3 border-b border-slate-200 px-3.5 py-1.5 text-sm transition last:border-b-0 motion-reduce:transition-none dark:border-slate-600 ${
                      kind === category
                        ? "bg-indigo-50 text-slate-950 dark:bg-indigo-400/10 dark:text-white"
                        : "hover:bg-slate-50 dark:hover:bg-slate-700/40"
                    }`}
                  >
                    <input
                      ref={index === 0 ? firstRadioRef : undefined}
                      type="radio"
                      name="report-kind"
                      value={category}
                      checked={kind === category}
                      onChange={() => setKind(category)}
                      className="h-4 w-4 appearance-none rounded-full border-2 border-slate-400 bg-transparent checked:border-indigo-500 checked:bg-[radial-gradient(circle_at_center,rgb(99_102_241)_0_35%,transparent_38%)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
                    />
                    <span>{t(`senseCard.reportSheet.categories.${category}`)}</span>
                  </label>
                ))}
              </fieldset>
              <label className="mt-4 block">
                <span className="sr-only">{t("senseCard.reportSheet.commentLabel")} ({t("senseCard.reportSheet.optional")})</span>
                <textarea
                  rows={2}
                  value={comment}
                  maxLength={1000}
                  disabled={delivery !== "editing"}
                  onChange={(event) => setComment(event.target.value)}
                  placeholder={t("senseCard.reportSheet.commentPlaceholder")}
                  className="h-14 min-h-14 w-full resize-none rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-sm font-normal outline-none placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 dark:border-slate-500 dark:bg-[#192230] dark:focus:ring-indigo-500/20"
                />
              </label>
              <p id="sense-card-report-context" className="mt-3 text-xs leading-5 text-slate-500 dark:text-slate-400">
                {t("senseCard.reportSheet.context")}
                {snapshot.operation ? <><br />{t("senseCard.reportSheet.operationContext")}</> : null}
                <br />{t("senseCard.reportSheet.privacy")}
              </p>
              {delivery === "retry" ? (
                <p role="alert" className="mt-3 text-sm text-amber-700 dark:text-amber-300">
                  {t("senseCard.reportSheet.retry")}
                </p>
              ) : null}
            </>
          )}
        </div>

        <div className="grid grid-cols-3 gap-2 px-5 pb-4 pt-1">
          <button
            ref={closeButtonRef}
            type="button"
            disabled={delivery === "sending"}
            onClick={dismiss}
            className="h-11 rounded-xl border border-slate-300 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-indigo-400 disabled:opacity-50 dark:border-slate-600 dark:bg-[#20252f] dark:text-slate-200 dark:hover:bg-slate-700"
          >
            {terminal ? t("senseCard.reportSheet.close") : t("senseCard.reportSheet.back")}
          </button>
          <button
            type="button"
            disabled={terminal || delivery === "sending" || !kind}
            onClick={() => void submit()}
            className="col-span-2 inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-indigo-600 text-sm font-semibold text-white hover:bg-indigo-500 focus-visible:ring-2 focus-visible:ring-indigo-300 disabled:cursor-not-allowed disabled:opacity-45 dark:bg-indigo-500 dark:hover:bg-indigo-400"
          >
            {delivery === "sending" ? t("senseCard.reportSheet.sending") : delivery === "retry" ? (
              <><RotateCcw aria-hidden="true" className="h-4 w-4" />{t("senseCard.reportSheet.tryAgain")}</>
            ) : t("senseCard.reportSheet.send")}
          </button>
        </div>
      </div>
    </div>
  );
}

function ReportStatus({
  state,
  t,
}: {
  state: Extract<SenseCardReportDeliveryState, "sent" | "queued" | "scheduled" | "rejected">;
  t: (key: string) => string;
}) {
  return (
    <div className="grid min-h-64 place-items-center text-center">
      <div className="max-w-xs">
        <span className={`mx-auto grid h-12 w-12 place-items-center rounded-full ${state === "rejected" ? "bg-rose-100 text-rose-700 dark:bg-rose-400/15 dark:text-rose-200" : "bg-emerald-100 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-200"}`}>
          {state === "rejected" ? <X aria-hidden="true" className="h-6 w-6" /> : <Check aria-hidden="true" className="h-6 w-6" />}
        </span>
        <h3 className="mt-4 text-lg font-semibold">{t(`senseCard.reportSheet.states.${state}.title`)}</h3>
        <p id="sense-card-report-delivery-description" className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">{t(`senseCard.reportSheet.states.${state}.body`)}</p>
      </div>
    </div>
  );
}
