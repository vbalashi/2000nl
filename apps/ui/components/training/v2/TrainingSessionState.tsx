"use client";
import React from "react";
import { LoadingIndicator } from "@/components/system/LoadingIndicator";
import approved from "../approvedTrainingCard.module.css";

/** State presentation only; session termination and navigation stay with the owner. */
export function TrainingSessionState({
  title,
  detail,
  loading = false,
  action,
  secondaryAction,
  tertiaryAction,
  announcement = "status",
  heading = !loading,
}: {
  title: string;
  detail?: string;
  loading?: boolean;
  action?: { label: string; onClick: () => void; disabled?: boolean };
  secondaryAction?: { label: string; onClick: () => void; disabled?: boolean };
  tertiaryAction?: { label: string; onClick: () => void; disabled?: boolean };
  announcement?: "status" | "alert";
  heading?: boolean;
}) {
  return (
    <section className={approved.state} data-testid="training-session-state" data-state={loading ? "loading" : "terminal"} aria-busy={loading || undefined}>
      <div className={approved.stateReading} role="region" aria-label={title} tabIndex={0}>
        <div className={approved.stateContent} role={announcement}>
          {loading ? <LoadingIndicator /> : null}
          {heading ? <h1>{title}</h1> : <p>{title}</p>}
          {detail ? <p>{detail}</p> : null}
        </div>
      </div>
      {action || secondaryAction || tertiaryAction ? <footer className={approved.stateActions}>
        {action ? <button type="button" className={approved.primary} disabled={action.disabled} onClick={action.onClick}>{action.label}</button> : null}
        {secondaryAction ? <button type="button" className={approved.primary} data-kind="secondary" disabled={secondaryAction.disabled} onClick={secondaryAction.onClick}>{secondaryAction.label}</button> : null}
        {tertiaryAction ? <button type="button" className={approved.primary} data-kind="secondary" disabled={tertiaryAction.disabled} onClick={tertiaryAction.onClick}>{tertiaryAction.label}</button> : null}
      </footer> : null}
    </section>
  );
}
