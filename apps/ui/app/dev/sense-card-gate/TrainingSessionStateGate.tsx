"use client";
import React from "react";
import { TrainingUnsupportedMode } from "@/components/training/v2/TrainingUnsupportedMode";
import { TrainingUsableCandidatesExhausted } from "@/components/training/v2/TrainingUsableCandidatesExhausted";
import { platformV2Message } from "@/lib/platform/platformV2ClientI18n";
import { TrainingSessionState } from "@/components/training/v2/TrainingSessionState";
import { TrainingSessionNotice } from "@/components/training/v2/TrainingSessionSurface";
import { getUiMessages, formatUiCount } from "@/lib/uiMessages";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import { textSizeStyles } from "@/lib/reading/textScale";
import theme from "@/components/practice/ui/practiceTheme.module.css";

/** Direct rendering of production states, without session or learning-state writes. */
export function TrainingSessionStateGate({ language, family, state, dark }: {
  language: OnboardingLanguage; family: "idiom" | "sentence";
  state: "complete" | "empty" | "loading" | "error" | "unsupported" | "exhausted" | "failure"; dark: boolean;
}) {
  const text = getUiMessages(language), t = text.trainingExercises[family];
  const [returned, setReturned] = React.useState(false), [retried, setRetried] = React.useState(false);
  return <main className={theme.theme} data-colour-mode={dark ? "dark" : "light"}
    data-practice-palette={dark ? "graphite" : "lavender"}
    style={{ ...textSizeStyles("extra"), display:"flex",flexDirection:"column",height:"100dvh",padding:12,background:"var(--practice-canvas)" }}>
    {state === "unsupported" ? <TrainingUnsupportedMode interfaceLanguage={language} onExit={()=>setReturned(true)} />
      : state === "exhausted" ? <TrainingUsableCandidatesExhausted interfaceLanguage={language} onExit={()=>setReturned(true)} />
      : state === "failure" ? <TrainingSessionState announcement="alert" title={platformV2Message(language,"senseCard.training.loadFailed")}
          action={{label:platformV2Message(language,"senseCard.training.retry"),onClick:()=>setRetried(true)}}
          secondaryAction={{label:text.trainingSession.back,onClick:()=>setReturned(true)}} />
      : state === "error" ? <TrainingSessionNotice notice={{kind:"error",message:t.failed,retryLabel:t.retry,onRetry:()=>setRetried(true)}} /> :
      <TrainingSessionState title={state === "loading" ? t.loading : state === "empty" ? t.empty : t.complete}
        loading={state === "loading"} detail={state === "complete" ? formatUiCount(language,21,text.trainingSession,"completed") : undefined}
        action={state === "loading" ? undefined : {label:text.trainingSession.back,onClick:()=>setReturned(true)}} />}
    {returned || retried ? <output>{returned ? "returned" : "retried"}</output> : null}
  </main>;
}
