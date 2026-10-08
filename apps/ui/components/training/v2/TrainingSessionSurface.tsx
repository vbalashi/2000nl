"use client";

import React from "react";
import approved from "../approvedTrainingCard.module.css";
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
  authorityRefreshing?: boolean;
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
  return <div
    role={notice.kind === "error" ? "alert" : "status"}
    data-tone={notice.kind} className={approved.notice}>
    <span tabIndex={0}>{notice.message}</span>
    {notice.kind === "error" ? <button type="button" className={approved.primary}
      disabled={notice.retryDisabled} onClick={notice.onRetry}>{notice.retryLabel}</button> : null}
  </div>;

}

export function TrainingSessionSurface({
  phase,
  chrome,
  footer,
  notice,
  readySurface,
  authorityRefreshing,
  children,
}: TrainingSessionSurfaceProps) {
  const approvedPresentation = Boolean(chrome);
  return (
    <TrainingSessionV2Layout
      phase={phase}
      authorityRefreshing={authorityRefreshing}
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
