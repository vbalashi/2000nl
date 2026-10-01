"use client";
import React from "react";
import { trainingPresentationV1Enabled } from "@/lib/platform/platformV2Rollout";
import approved from "../approvedTrainingCard.module.css";

/** State presentation only; session termination and navigation stay with the owner. */
export function TrainingSessionState({
  title,
  detail,
  loading = false,
  action,
  secondaryAction,
  announcement = "status",
  heading = !loading,
}: {
  title: string;
  detail?: string;
  loading?: boolean;
  action?: { label: string; onClick: () => void };
  secondaryAction?: { label: string; onClick: () => void };
  announcement?: "status" | "alert";
  heading?: boolean;
}) {
  if (trainingPresentationV1Enabled()) return (
    <section className={approved.state} data-testid="training-session-state" data-state={loading ? "loading" : "terminal"}>
      <div className={approved.stateReading} role="region" aria-label={title} tabIndex={0}>
        <div className={approved.stateContent} role={announcement}>
          {heading ? <h1>{title}</h1> : <p>{title}</p>}
          {detail ? <p>{detail}</p> : null}
        </div>
      </div>
      {action || secondaryAction ? <footer className={approved.stateActions}>
        {action ? <button type="button" className={approved.primary} onClick={action.onClick}>{action.label}</button> : null}
        {secondaryAction ? <button type="button" className={approved.primary} data-kind="secondary" onClick={secondaryAction.onClick}>{secondaryAction.label}</button> : null}
      </footer> : null}
    </section>
  );
  if (loading) return <div role="status" className="grid h-full min-h-0 place-items-center rounded-3xl border border-slate-300 bg-slate-50 text-sm font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-300">{title}</div>;
  return <div role="status" className="grid h-full min-h-0 place-items-center rounded-3xl border border-slate-300 bg-slate-50 px-6 text-center dark:border-slate-700 dark:bg-slate-900/50"><div>
    <h1 className="text-2xl font-semibold text-slate-950 dark:text-white">{title}</h1>
    {detail ? <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{detail}</p> : null}
    {action ? <button type="button" onClick={action.onClick} className="mt-5 rounded-xl bg-indigo-500 px-4 py-3 font-semibold text-white">{action.label}</button> : null}
  </div></div>;
}
