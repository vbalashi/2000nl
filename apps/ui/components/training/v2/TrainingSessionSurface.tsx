"use client";

import React from "react";
import approved from "../approvedTrainingCard.module.css";
import { trainingPresentationV1Enabled } from "@/lib/platform/platformV2Rollout";
import { FooterStats, type FooterStatsProps } from "../FooterStats";
import {
  TrainingSessionChrome,
  type TrainingSessionChromeProps,
} from "./TrainingSessionChrome";
import {
  TrainingSessionV2Layout,
  type TrainingSessionLayoutPhase,
  type TrainingSessionReadySurface,
} from "./TrainingSessionV2Layout";

export type TrainingSessionNoticeInput =
  | {
      kind: "error";
      message: string;
      retryLabel: string;
      retryDisabled?: boolean;
      onRetry: () => void;
    }
  | {
      kind: "status";
      message: string;
    };

export type TrainingSessionSurfaceProps = {
  phase: TrainingSessionLayoutPhase;
  chrome?: TrainingSessionChromeProps | null;
  footer: FooterStatsProps;
  notice?: TrainingSessionNoticeInput | null;
  readySurface?: TrainingSessionReadySurface;
  children: React.ReactNode;
};

export function TrainingSessionNotice({
  notice,
}: {
  notice: TrainingSessionNoticeInput;
}) {
  if (trainingPresentationV1Enabled()) return <div
    role={notice.kind === "error" ? "alert" : "status"}
    data-tone={notice.kind} className={approved.notice}>
    <span tabIndex={0}>{notice.message}</span>
    {notice.kind === "error" ? <button type="button" className={approved.primary}
      disabled={notice.retryDisabled} onClick={notice.onRetry}>{notice.retryLabel}</button> : null}
  </div>;

  if (notice.kind === "status") {
    return (
      <div
        role="status"
        className="mx-auto mb-3 w-full max-w-2xl rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-800 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-200"
      >
        {notice.message}
      </div>
    );
  }

  return (
    <div
      role="alert"
      className="mx-auto mb-3 flex w-full max-w-2xl items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-800 shadow-sm dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200"
    >
      <span>{notice.message}</span>
      <button
        type="button"
        disabled={notice.retryDisabled}
        onClick={notice.onRetry}
        className="min-h-9 shrink-0 rounded-lg border border-red-300 px-3 py-1.5 disabled:cursor-wait disabled:opacity-60 dark:border-red-800"
      >
        {notice.retryLabel}
      </button>
    </div>
  );
}

export function TrainingSessionSurface({
  phase,
  chrome,
  footer,
  notice,
  readySurface,
  children,
}: TrainingSessionSurfaceProps) {
  const approvedPresentation = trainingPresentationV1Enabled() && Boolean(chrome);
  return (
    <TrainingSessionV2Layout
      phase={phase}
      chrome={chrome ? (
        <TrainingSessionChrome
          {...chrome}
          approvedPresentation={approvedPresentation}
        />
      ) : null}
      footer={approvedPresentation ? null : <FooterStats {...footer} />}
      approvedPresentation={approvedPresentation}
      notice={notice ? <TrainingSessionNotice notice={notice} /> : null}
      readySurface={readySurface}
    >
      {children}
    </TrainingSessionV2Layout>
  );
}
