"use client";
import React, {useEffect, useState} from "react";
import type {OnboardingLanguage} from "@/lib/onboardingI18n";
import {StartupRecovery} from "./StartupRecovery";
import {TrainingBootstrapShell} from "./TrainingBootstrapShell";

/** Keep startup presentation continuous without unmounting the readers beneath it. */
export function TrainingStartupGate({pending, interfaceLanguage, recovery, children}: {
  pending: boolean;
  interfaceLanguage: OnboardingLanguage;
  children: React.ReactNode;
  recovery?: { onRetry: () => void };
}) {
  const [longRunning, setLongRunning] = useState(false);
  useEffect(() => {
    if (!pending) { setLongRunning(false); return; }
    const timer = window.setTimeout(() => setLongRunning(true), 8000);
    return () => window.clearTimeout(timer);
  }, [pending]);
  const covered = pending || Boolean(recovery);
  return <>
    <div className={`contents ${covered ? "invisible" : ""}`} aria-hidden={covered || undefined}>{children}</div>
    {covered ? <div className="fixed inset-0 z-50" data-testid="training-startup-gate">
      {recovery ? <StartupRecovery language={interfaceLanguage} context="training" onRetry={recovery.onRetry} />
        : <TrainingBootstrapShell interfaceLanguage={interfaceLanguage} status={longRunning ? "long-running" : "loading"} />}
    </div> : null}
  </>;
}
