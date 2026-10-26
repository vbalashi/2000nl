"use client";
import React from "react";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
import { platformV2Message } from "@/lib/platform/platformV2ClientI18n";
import s from "./translationFeedback.module.css";

export type TranslationPreparationState = "pending" | "failed" | null;
export function TranslationPlaceholder({ emphasis = false, multiline = false, inline = false }: { emphasis?: boolean; multiline?: boolean; inline?: boolean }) {
  return <span data-content-translation="true" data-translation-loading="true" aria-hidden="true" className={`${s.placeholder} ${emphasis ? s.emphasis : ""} ${inline ? s.inline : ""}`}>
    <span className={`${s.line} ${s.shimmer}`} />
    {multiline && <span className={`${s.line} ${s.shimmer}`} />}
  </span>;
}
export function TranslationFailure({ language, onRetry }: { language: OnboardingLanguage; onRetry: () => void }) {
  return <span role="alert" className={s.error}>
    <span>{platformV2Message(language, "senseCard.translation.failed")}</span>
    <button type="button" onClick={event => { event.stopPropagation(); onRetry(); }}>{platformV2Message(language, "senseCard.translation.retry")}</button>
  </span>;
}
