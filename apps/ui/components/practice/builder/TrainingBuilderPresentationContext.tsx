"use client";
import { createContext, type ReactNode } from "react";
import type { OnboardingLanguage } from "@/lib/onboardingI18n";
/** Dev-only review additions; the production setup and session owner stay unchanged. */
export const TrainingBuilderPresentationContext = createContext<{
  renderAdditionalFilters: (language: OnboardingLanguage) => ReactNode;
} | null>(null);
