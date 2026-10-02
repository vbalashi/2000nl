"use client";
import React, {useEffect, useState} from "react";
import type {OnboardingLanguage} from "@/lib/onboardingI18n";
import {TrainingBootstrapShell} from "./TrainingBootstrapShell";

/** Keep startup presentation continuous without unmounting the readers beneath it. */
export function TrainingStartupGate({pending, interfaceLanguage, children}: {
  pending: boolean;
  interfaceLanguage: OnboardingLanguage;
  children: React.ReactNode;
}) {
  const [longRunning, setLongRunning] = useState(false);
  useEffect(() => {
    if (!pending) { setLongRunning(false); return; }
    const timer = window.setTimeout(() => setLongRunning(true), 8000);
    return () => window.clearTimeout(timer);
  }, [pending]);
  return <>
    <div className={`contents ${pending ? "invisible" : ""}`} aria-hidden={pending || undefined}>{children}</div>
    {pending ? <div className="fixed inset-0 z-50" data-testid="training-startup-gate">
      <TrainingBootstrapShell interfaceLanguage={interfaceLanguage} status={longRunning ? "long-running" : "loading"} />
    </div> : null}
  </>;
}
